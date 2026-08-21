import { siteUrl } from '@/lib/siteUrl';

/**
 * robots.txt
 * -----------------------------------------------------------------------------
 * metadata 파일(app/robots.ts) 대신 라우트 핸들러로 둔 이유:
 * 동기 함수에 외부 데이터 접근이 없으면 Next 가 빌드 시점에 정적 생성해버려,
 * 배포 후 도메인을 바꿔도 sitemap 주소가 옛 값으로 남는다.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  /* 프리뷰 배포가 색인되면 운영 도메인과 중복 콘텐츠가 된다 — 운영에서만 허용 */
  const isProduction = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL;

  const body = isProduction
    ? [
        'User-Agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api',
        '',
        `Sitemap: ${siteUrl()}/sitemap.xml`,
        '',
      ].join('\n')
    : ['User-Agent: *', 'Disallow: /', ''].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
