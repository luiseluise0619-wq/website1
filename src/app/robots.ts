import type { MetadataRoute } from 'next';

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export default function robots(): MetadataRoute.Robots {
  /* 프리뷰 배포는 색인되면 안 된다 — 운영 도메인에서만 크롤링을 허용한다 */
  const isProduction = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL;

  return {
    rules: isProduction
      ? { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] }
      : { userAgent: '*', disallow: '/' },
    sitemap: `${baseUrl()}/sitemap.xml`,
  };
}
