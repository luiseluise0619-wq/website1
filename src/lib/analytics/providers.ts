'use client';

import { apiUrl, isApiUnavailable } from '@/lib/apiBase';
import type {
  AnalyticsBatch,
  AnalyticsEvent,
  AnalyticsProviderConfig,
} from '@/types/analytics';

/* =============================================================================
 * Analytics Transport Layer
 * -----------------------------------------------------------------------------
 * 하나의 이벤트를 세 목적지로 팬아웃한다:
 *   1) 내부 수집 API  — 원본 데이터 소유권. 히트맵/이탈 리포트의 근거.
 *   2) GA4           — 마케팅팀의 표준 리포트.
 *   3) Mixpanel      — 코호트/퍼널 분석.
 * 어느 하나가 실패해도 나머지는 계속 전송된다(격리된 try/catch).
 * ========================================================================== */

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsProviderConfig = {
  internal: { enabled: true, endpoint: '/api/analytics/collect', batchSize: 20, flushIntervalMs: 5000 },
  ga4: { enabled: false, measurementId: process.env.NEXT_PUBLIC_GA4_ID },
  mixpanel: { enabled: false, token: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN },
  requireConsent: false,
  debug: process.env.NODE_ENV !== 'production',
  sampleRate: 1,
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    mixpanel?: {
      track: (event: string, props?: Record<string, unknown>) => void;
      identify: (id: string) => void;
      init?: (token: string, opts?: Record<string, unknown>) => void;
    };
  }
}

/* ---- GA4 ------------------------------------------------------------------ */

/**
 * GA4 는 이벤트명이 40자, 파라미터명이 40자, 값이 100자로 제한된다.
 * 스키마의 중첩 payload 를 평탄화하면서 이 제약에 맞춰 잘라낸다.
 */
function toGA4Params(event: AnalyticsEvent): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    page_id: event.context.pageId,
    page_path: event.context.path,
    locale: event.context.locale,
    device_type: event.context.device.type,
    session_id: event.context.sessionId,
  };
  for (const [k, v] of Object.entries(event.payload as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    const key = snake(k).slice(0, 40);
    flat[key] = typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : typeof v === 'string' ? v.slice(0, 100) : v;
  }
  return flat;
}

function sendToGA4(event: AnalyticsEvent, config: AnalyticsProviderConfig): void {
  if (!config.ga4.enabled || typeof window === 'undefined' || !window.gtag) return;
  try {
    window.gtag('event', event.type, toGA4Params(event));
  } catch (err) {
    if (config.debug) console.warn('[analytics] GA4 전송 실패', err);
  }
}

/** GA4 gtag.js 를 한 번만 주입한다 */
export function initGA4(measurementId: string): void {
  if (typeof window === 'undefined' || window.gtag) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag('js', new Date());
  // 페이지뷰는 우리 쪽에서 직접 보내므로 자동 전송을 끈다 (중복 방지)
  window.gtag('config', measurementId, { send_page_view: false });
}

/* ---- Mixpanel ------------------------------------------------------------- */

function sendToMixpanel(event: AnalyticsEvent, config: AnalyticsProviderConfig): void {
  if (!config.mixpanel.enabled || typeof window === 'undefined' || !window.mixpanel) return;
  try {
    window.mixpanel.track(event.type, {
      distinct_id: event.context.anonymousId,
      $session_id: event.context.sessionId,
      page_id: event.context.pageId,
      path: event.context.path,
      locale: event.context.locale,
      device: event.context.device.type,
      ...(event.payload as Record<string, unknown>),
    });
  } catch (err) {
    if (config.debug) console.warn('[analytics] Mixpanel 전송 실패', err);
  }
}

/* ---- 내부 수집 API -------------------------------------------------------- */

/**
 * 배치 전송. 페이지 이탈 시점에는 fetch 가 취소될 수 있으므로
 * sendBeacon 을 우선 사용한다(브라우저가 백그라운드에서 보장 전송).
 */
export function sendBatch(batch: AnalyticsBatch, config: AnalyticsProviderConfig): void {
  if (!config.internal.enabled || !batch.events.length) return;
  /* 정적 내보내기 산출물인데 되돌려 보낼 주소가 없으면 수집을 건너뛴다.
     없는 /api 로 계속 쏘면 콘솔이 404 로 뒤덮인다. */
  if (isApiUnavailable()) return;
  const body = JSON.stringify(batch);
  const endpoint = apiUrl(config.internal.endpoint);

  /* 본문은 JSON 이지만 Content-Type 은 text/plain 으로 보낸다.
     정적 사본은 다른 도메인에서 이 API 를 부르는데, application/json 은
     CORS 안전 목록에 없어 프리플라이트를 부른다. sendBeacon 은 프리플라이트를
     할 수 없어서 그대로 실패한다 — 게다가 반환값이 true 라 실패한 줄도 모른다.
     수집 라우트는 본문을 텍스트로 읽어 파싱하므로 서버 쪽은 달라질 게 없다. */
  const TYPE = 'text/plain;charset=UTF-8';

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: TYPE }));
    if (ok) return;
  }
  // sendBeacon 이 없거나 큐가 가득 찬 경우의 폴백
  void fetch(endpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': TYPE },
    keepalive: true,
  }).catch((err) => {
    if (config.debug) console.warn('[analytics] 내부 수집 전송 실패', err);
  });
}

/* ---- 팬아웃 --------------------------------------------------------------- */

/** 실시간 전송이 필요한 목적지(GA4/Mixpanel)로 즉시 팬아웃 */
export function dispatchRealtime(event: AnalyticsEvent, config: AnalyticsProviderConfig): void {
  if (config.debug) console.debug('[analytics]', event.type, event.payload);
  sendToGA4(event, config);
  sendToMixpanel(event, config);
}

function snake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

/* ---- 동의(consent) 게이트 ------------------------------------------------- */

const CONSENT_KEY = 'ksoho_analytics_consent';

export function hasConsent(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(CONSENT_KEY) === 'granted';
}

export function setConsent(granted: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
}
