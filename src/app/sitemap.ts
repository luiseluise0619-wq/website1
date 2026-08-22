import { listPages } from '@/lib/server/pageStore';
import { LOCALES, LOCALE_ORDER } from '@/lib/i18n';
import { siteUrl } from '@/lib/siteUrl';
import type { MetadataRoute } from 'next';

/* 정적 생성하면 빌드 시점 도메인이 박혀, 나중에 커스텀 도메인을 붙여도
   sitemap 이 옛 주소를 가리킨다. 크롤러만 호출하므로 런타임 생성이 저렴하다. */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await listPages();
  const base = siteUrl();

  /* 페이지가 알리는 canonical 과 같은 문자열이어야 한다. Next 는 루트의
     canonical 을 'https://x' (뒤 슬래시 없음)로 만드므로 여기서도 맞춘다. */
  const urlOf = (path: string) => `${base}${path === '/' ? '' : path}`;

  return pages
    .filter((page) => page.status === 'published' && !page.seo.noindex)
    .map((page) => ({
      url: urlOf(page.path),
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: page.path === '/' ? 1 : page.path.split('/').length > 2 ? 0.6 : 0.8,
      /* 언어별 대체 URL — 검색엔진이 국가별로 올바른 버전을 노출하게 한다 */
      alternates: {
        languages: Object.fromEntries(
          (page.enabledLocales ?? LOCALE_ORDER).map((locale) => [
            LOCALES[locale].bcp47,
            `${urlOf(page.path)}?lang=${locale}`,
          ]),
        ),
      },
    }));
}
