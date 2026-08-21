'use client';

/* =============================================================================
 * Umami 연동 (선택) — PostHog 보다 가벼운 대체/병행 수단
 * 스크립트 한 줄로 동작하며, 커스텀 이벤트만 우리가 추가로 보낸다.
 * ========================================================================== */

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

export function initUmami(scriptUrl: string, websiteId: string): void {
  if (typeof document === 'undefined' || document.querySelector('script[data-website-id]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.src = scriptUrl;
  script.setAttribute('data-website-id', websiteId);
  document.head.appendChild(script);
}

export function umamiTrack(event: string, data?: Record<string, unknown>): void {
  window.umami?.track(event, data);
}
