'use client';

/* =============================================================================
 * API 주소 결정 (브라우저)
 * -----------------------------------------------------------------------------
 * 평소에는 같은 출처의 /api/… 를 부른다.
 *
 * 정적 내보내기 산출물은 /api 가 없는 웹호스팅에 올라간다. 그래서 내보낼 때
 * HTML 에 원래 배포본의 절대 주소를 심어 두고(window.__KS_API_BASE__),
 * 여기서 그 값을 앞에 붙인다 — 정적 사이트에서 들어온 문의도 같은 곳으로
 * 접수된다. 값이 없으면 상대 경로 그대로라 평소 동작에는 영향이 없다.
 * ========================================================================== */

declare global {
  interface Window {
    /** 정적 내보내기 산출물에만 존재한다 (staticExport.ts 의 injectApiBase) */
    __KS_API_BASE__?: string;
  }
}

export function apiUrl(path: string): string {
  const base = typeof window === 'undefined' ? undefined : window.__KS_API_BASE__;
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

/**
 * 정적 산출물인데 되돌려 보낼 주소가 없는 상태인가.
 * 이때는 폼이 "지금은 접수할 수 없습니다"를 보여 줘야 한다 —
 * 그냥 보내면 자기 자신의 없는 /api 를 때려 404 를 받는다.
 */
export function isApiUnavailable(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__KS_STATIC_EXPORT__ === true && !window.__KS_API_BASE__;
}

declare global {
  interface Window {
    __KS_STATIC_EXPORT__?: boolean;
  }
}
