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
 * ========================================================================== */

interface Params {
  params: { slug?: string[] };
  /* hreflang 이 ?lang= 주소를 알리므로 서버도 이 값을 읽어야 한다.
     읽는 순간 이 라우트는 요청마다 렌더된다(정적 생성 해제). */
  searchParams?: { lang?: string };
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

  const locale = resolveLocale(page.enabledLocales, searchParams?.lang);
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
    alternates: { canonical: page.seo.canonical ?? page.path, languages },
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

  const locale = resolveLocale(page.enabledLocales, searchParams?.lang);
  return <PageRenderer page={page} initialLocale={locale} />;
}
