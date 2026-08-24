import 'server-only';

/* =============================================================================
 * 정적 사본을 위한 CORS
 * -----------------------------------------------------------------------------
 * 정적 HTML 내보내기 산출물은 다른 도메인(웹호스팅)에 올라가고, 문의 접수와
 * 방문 분석만 원래 배포본으로 되돌려 보낸다. 브라우저는 이것을 교차 출처
 * 요청으로 보므로 허용 헤더가 없으면 조용히 막힌다 — 방문자는 문의를 다 쓰고
 * '전송'을 누른 뒤에야 실패를 알게 된다.
 *
 * 아무 출처나 열어 주지는 않는다. STATIC_SITE_ORIGINS 에 적어 둔 도메인만
 * 허용한다(쉼표로 여러 개). 목록이 비어 있으면 교차 출처는 그냥 막힌다 —
 * 켜는 것은 명시적인 선택이어야 한다.
 * ========================================================================== */

/** 허용 목록. 'https://a.com, https://b.com' 형태 */
function allowList(): string[] {
  return (process.env.STATIC_SITE_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * 이 요청에 붙일 CORS 헤더. 허용 목록에 없으면 빈 객체(=차단).
 *
 * Origin 을 그대로 되비추지 않고 목록과 대조한 값을 쓴다. 되비추면 사실상
 * 아무 사이트나 방문자의 쿠키로 이 API 를 부를 수 있게 된다.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin) return {}; // 같은 출처 요청 — 헤더가 필요 없다
  const allowed = allowList().find((o) => o === origin.replace(/\/$/, ''));
  if (!allowed) return {};

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    /* 같은 주소가 출처에 따라 다른 헤더를 내므로, 캐시가 섞이지 않게 알린다 */
    Vary: 'Origin',
  };
}

/** 프리플라이트 응답 (OPTIONS) */
export function corsPreflight(request: Request): Response {
  const headers = corsHeaders(request);
  // 허용하지 않는 출처에는 허용 헤더를 주지 않는다 — 브라우저가 알아서 막는다
  return new Response(null, { status: Object.keys(headers).length ? 204 : 403, headers });
}

/** 정적 사본이 이 API 를 부를 수 있게 설정돼 있는가 (/api/health 안내용) */
export function isStaticSiteConfigured(): boolean {
  return allowList().length > 0;
}
