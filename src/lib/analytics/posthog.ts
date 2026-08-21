'use client';

import posthog from 'posthog-js';
import type { AnalyticsEvent } from '@/types/analytics';

/* =============================================================================
 * PostHog 연동 (셀프호스팅 가능)
 * -----------------------------------------------------------------------------
 * PostHog 가 기본 제공하는 것 — 자동 캡처, 히트맵, 세션 리플레이, 퍼널.
 * 우리가 추가로 하는 것 — data-element-id 기반의 "요소 단위" 집계.
 * PostHog 의 히트맵은 CSS 셀렉터/좌표 기반이라 요소를 옮기면 히스토리가 끊기는데,
 * trackingId 를 property 로 함께 보내면 옮겨도 이어진다.
 * ========================================================================== */

let initialized = false;

export interface PostHogConfig {
  key: string;
  /** 셀프호스팅 시 https://posthog.k-soho.com 형태 */
  host: string;
  /** 세션 리플레이 — 개인정보 이슈로 기본 비활성 */
  sessionRecording?: boolean;
  debug?: boolean;
}

export function initPostHog(config: PostHogConfig): void {
  if (initialized || typeof window === 'undefined' || !config.key) return;
  posthog.init(config.key, {
    api_host: config.host,
    /* 우리가 라우트 변경 시 직접 $pageview 를 보낸다 (App Router 는 자동 감지가 부정확) */
    capture_pageview: false,
    capture_pageleave: true,
    /* 히트맵 데이터 수집 — PostHog 툴바의 히트맵과 우리 에디터 오버레이 양쪽이 이 데이터를 쓴다 */
    enable_heatmaps: true,
    autocapture: {
      /* data-element-id 를 자동 캡처 이벤트에도 실어 보낸다 */
      element_attribute_ignorelist: [],
    },
    disable_session_recording: !config.sessionRecording,
    persistence: 'localStorage+cookie',
    loaded: (ph) => {
      if (config.debug) ph.debug();
    },
  });
  initialized = true;
}

export function isPostHogReady(): boolean {
  return initialized;
}

/** 내부 이벤트 스키마 → PostHog 이벤트 */
export function sendToPostHog(event: AnalyticsEvent): void {
  if (!initialized) return;
  const { context, payload } = event;
  posthog.capture(event.type, {
    $current_url: typeof window !== 'undefined' ? window.location.href : undefined,
    page_id: context.pageId,
    path: context.path,
    locale: context.locale,
    device_type: context.device.type,
    session_id: context.sessionId,
    ...(payload as Record<string, unknown>),
  });
}

export function posthogPageView(path: string, props: Record<string, unknown> = {}): void {
  if (!initialized) return;
  posthog.capture('$pageview', { $current_url: window.location.href, path, ...props });
}

/** 언어 전환 등 방문자 속성 갱신 — 코호트 분석에 쓰인다 */
export function setPostHogPersonProps(props: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.setPersonProperties(props);
}

export { posthog };
