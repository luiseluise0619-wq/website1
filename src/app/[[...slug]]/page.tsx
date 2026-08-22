import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { PageRenderer } from '@/components/site/PageRenderer';
import { getPageByPath, listPages } from '@/lib/server/pageStore';
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_ORDER, isLocale, parseAcceptLanguage, t } from '@/lib/i18n';
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
  searchParams?: { lang?: string | string[]; locale?: string | string[] };
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
  const page = await getPageByPath(pathFromSlug(params.slug));

  // 초안/보관 페이지는 공개 사이트에 노출하지 않는다
  if (!page || page.status !== 'published') notFound();

  const locale = resolveLocale(page.enabledLocales, langOf(searchParams));
  return <PageRenderer page={page} initialLocale={locale} />;
}
