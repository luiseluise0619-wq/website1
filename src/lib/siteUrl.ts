/* =============================================================================
 * 배포 도메인 결정
 * -----------------------------------------------------------------------------
 * NEXT_PUBLIC_* 은 빌드 시점에 번들에 박히므로, 배포 후 변수를 추가하거나
 * 커스텀 도메인을 붙여도 반영되지 않는다. sitemap/robots 는 서버에서만 쓰이므로
 * 런타임에 읽는 서버 변수를 우선한다.
 *
 * 우선순위: SITE_URL(런타임) → 호스팅이 주입한 운영 도메인 → 빌드 시점 변수 → 배포 URL
 * ========================================================================== */
export function siteUrl(): string {
  const candidates = [
    process.env.SITE_URL,
    // Vercel
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    // Netlify — URL 은 운영 도메인, DEPLOY_PRIME_URL 은 프리뷰별 주소
    process.env.CONTEXT === 'production' ? process.env.URL : process.env.DEPLOY_PRIME_URL || process.env.URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = candidate.startsWith('http') ? candidate : `https://${candidate}`;
    return url.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}
