import { listPages } from '@/lib/server/pageStore';
import { LOCALES, LOCALE_ORDER } from '@/lib/i18n';
import type { MetadataRoute } from 'next';

/** 배포 도메인 — Vercel 이 주입하는 값을 우선 사용한다 */
function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await listPages();
  const base = baseUrl();

  return pages
    .filter((page) => page.status === 'published' && !page.seo.noindex)
    .map((page) => ({
      url: `${base}${page.path === '/' ? '' : page.path}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: page.path === '/' ? 1 : page.path.split('/').length > 2 ? 0.6 : 0.8,
      /* 언어별 대체 URL — 검색엔진이 국가별로 올바른 버전을 노출하게 한다 */
      alternates: {
        languages: Object.fromEntries(
          (page.enabledLocales ?? LOCALE_ORDER).map((locale) => [
            LOCALES[locale].bcp47,
            `${base}${page.path === '/' ? '' : page.path}?lang=${locale}`,
          ]),
        ),
      },
    }));
}
