import { notFound, redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { PageRenderer } from '@/components/site/PageRenderer';
import { getPageByPath, listPages } from '@/lib/server/pageStore';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_ORDER, isLocale, parseAcceptLanguage, t } from '@/lib/i18n';
import { EXPORT_HEADER } from '@/lib/server/export/staticExport';
import { isAdminRequest } from '@/lib/server/auth';
import type { Metadata } from 'next';
import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * 동적 라우트 — 에디터로 만든 모든 페이지를 서빙한다.
 * /brand/beauty, /global/thailand, /business/buyer-inquiry … 전부 이 파일 하나가 처리.
 *
 * 주의: resolveLocale 이 cookies()/headers() 를 읽으므로 이 라우트는 요청마다
 * 렌더된다. generateStaticParams 는 경로 목록을 알려줄 뿐 정적 생성을 만들지
 * 않는다. 방문자마다 언어가 달라야 하므로 의도한 동작이다.
 * ========================================================================== */

interface Params {
  params: { slug?: string[] };
  /* hreflang 이 ?lang= 주소를 알리므로 서버도 이 값을 읽어야 한다.
     Next 는 같은 키가 반복되면 배열로 넘기므로 두 형태를 모두 받는다. */
  searchParams?: {
    lang?: string | string[];
    locale?: string | string[];
    /** 운영자가 공개 화면을 그대로 보려는 표시 (에디터로 넘기지 않는다) */
    site?: string | string[];
    /** 에디터 [미리보기] 안에서 그려지는 중 — 분석을 끄고 링크를 가둔다 */
    preview?: string | string[];
  };
}

/** 반복 파라미터(?lang=en&lang=ko)는 첫 값만 쓴다 */
function firstParam(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** 클라이언트(localeFromSearch)와 같은 키를 인정해야 동작이 어긋나지 않는다 */
function langOf(searchParams?: Params['searchParams']): string | undefined {
  return firstParam(searchParams?.lang) ?? firstParam(searchParams?.locale);
}

function pathFromSlug(slug?: string[]): string {
  return slug?.length ? `/${slug.join('/')}` : '/';
}

/** 방문자 언어 결정: ?lang= > 쿠키(직접 선택) > Accept-Language > 기본 */
function resolveLocale(enabled?: LocaleCode[], langParam?: string): LocaleCode {
  const supported = enabled?.length ? enabled : LOCALE_ORDER;
  if (isLocale(langParam) && supported.includes(langParam)) return langParam;
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale) && supported.includes(cookieLocale)) return cookieLocale;
  return parseAcceptLanguage(headers().get('accept-language'), supported) ?? DEFAULT_LOCALE;
}

/** 발행된 페이지를 정적 경로로 미리 생성 (ISR 대상) */
export async function generateStaticParams() {
  const pages = await listPages();
  return pages
    .filter((p) => p.status === 'published' && p.path !== '/')
    .map((p) => ({ slug: p.path.replace(/^\//, '').split('/') }));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const page = await getPageByPath(pathFromSlug(params.slug));
  if (!page) return { title: 'K-SOHO GLOBAL' };

  const requested = langOf(searchParams);
  const locale = resolveLocale(page.enabledLocales, requested);
  const title = t(page.seo.title, locale, page.sourceLocale) || page.title;
  const description = t(page.seo.description, locale, page.sourceLocale);

  /* hreflang — 검색엔진에 언어별 대체 URL 을 알린다 */
  const languages = Object.fromEntries(
    (page.enabledLocales ?? LOCALE_ORDER).map((l) => [LOCALES[l].bcp47, `${page.path}?lang=${l}`]),
  );

  return {
    title,
    description,
    keywords: page.seo.keywords?.[locale],
    alternates: {
      /* 각 언어 변형은 자기 자신을 가리켜야 한다. 모두 쿼리 없는 주소를
         canonical 로 지목하면 검색엔진이 중복으로 보고 hreflang 집합을 버린다. */
      canonical: page.seo.canonical ?? (requested ? `${page.path}?lang=${locale}` : page.path),
      languages,
    },
    robots: page.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: t(page.seo.ogTitle, locale, page.sourceLocale) || title,
      description: t(page.seo.ogDescription, locale, page.sourceLocale) || description,
      images: page.seo.ogImage ? [page.seo.ogImage] : undefined,
      locale: LOCALES[locale].bcp47,
    },
  };
}

export default async function DynamicPage({ params, searchParams }: Params) {
  const path = pathFromSlug(params.slug);

  /* 로그인한 운영자가 사이트 첫 화면으로 들어오면 에디터로 보낸다.
     이 제품에서 첫 화면을 여는 사람은 대개 '고치러 온 주인'이다.
     방문자에게는 아무 영향이 없고(쿠키가 없으니 그대로 사이트),
     주인이 공개 화면을 보고 싶을 때는 ?site=1 로 빠져나갈 수 있다
     (에디터의 [사이트 보기] 가 그 주소를 쓴다). */
  /* 두 표시는 하는 일이 다르다 — 섞으면 안 된다.
       site=1    : 운영자가 공개 화면을 그대로 본다. 진짜 방문과 똑같아야 하므로
                   분석도 켜져 있고 링크도 손대지 않는다.
       preview=1 : 에디터 [미리보기] 안이다. 분석을 끄고(주인이 자기 지표를
                   오염시키지 않게) 내부 링크를 미리보기 안에 가둔다.
     예전에는 site=1 하나가 둘을 겸해서, [새 탭 ↗] 으로 연 공개 화면이
     조용히 미리보기 모드로 열리고 주소창에도 그 표시가 남았다. */
  const siteMode = Boolean(firstParam(searchParams?.site));
  const previewMode = Boolean(firstParam(searchParams?.preview));
  if (path === '/' && !siteMode && !previewMode && !headers().get(EXPORT_HEADER) && isAdminRequest()) {
    redirect('/admin/editor');
  }

  const page = await getPageByPath(path);

  /* 초안/보관 페이지는 공개 사이트에 노출하지 않는다.
     단, 로그인한 운영자에게는 보여 준다 — 에디터의 [미리보기] 가 이 주소를
     띄우는데, 새로 만든 페이지는 대부분 초안이라 그대로 두면 미리보기가
     늘 404 였다. 방문자에게는 그대로 404 다. */
  if (!page) notFound();
  if (page.status !== 'published' && !isAdminRequest()) notFound();

  const requested = langOf(searchParams);
  const locale = resolveLocale(page.enabledLocales, requested);

  /* 정적 내보내기용 요청 — 로케일을 서버에서 못 박지 않는다.
     산출물은 페이지당 HTML 한 장이고, 그 한 장이 정적 호스팅에서 6개 언어를
     모두 담당해야 한다. initialLocale 을 박아 두면 브라우저가 언어를 다시
     정하지 않아(PageRenderer 의 감지 로직이 건너뛴다) ?lang= 이 죽는다.
     밖에서 이 헤더를 붙여도 손해가 없다 — 언어를 클라이언트가 정할 뿐이다. */
  if (headers().get(EXPORT_HEADER)) {
    return <PageRenderer page={page} />;
  }

  /* 이 페이지가 끈 언어로 들어온 요청은 실제로 보여 줄 언어로 넘긴다.
     그대로 두면 <html lang> 은 요청한 언어(미들웨어가 URL 만 보고 정한 값)인데
     본문은 다른 언어로 나가, 화면과 선언이 어긋난 페이지가 색인된다.
     넘긴 뒤에는 요청 언어 = 노출 언어라 다시 넘어가지 않는다. */
  if (requested && isLocale(requested) && requested !== locale) {
    redirect(`${page.path}?lang=${locale}`);
  }

  return <PageRenderer page={page} initialLocale={locale} previewMode={previewMode} analytics={!previewMode} />;
}
