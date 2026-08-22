import type { ElementType, LocaleCode } from '@/types/schema';

/* =============================================================================
 * K-SOHO GLOBAL — Behavioral Analytics Schema
 * 수집(Collect) → 적재(Store) → 집계(Aggregate) → 시각화(Heatmap) 4단계의
 * 계약(contract)을 한 파일에 정의한다.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1. EVENT TYPES (클라이언트 → 서버 전송 단위)
 * ------------------------------------------------------------------------ */

export type AnalyticsEventType =
  | 'page_view'
  | 'element_click'
  | 'element_impression'   // 요소가 뷰포트에 처음 노출됨
  | 'scroll_depth'
  | 'section_dwell'        // 섹션 체류 시간
  | 'exit'                 // 이탈 (마지막으로 보고 있던 섹션 포함)
  | 'rage_click'           // 짧은 시간 내 동일 지점 반복 클릭 (UX 문제 신호)
  | 'dead_click'           // 클릭했지만 아무 반응 없는 요소
  | 'conversion'
  | 'locale_change'
  | 'video_progress'
  | 'form_submit';

/** 모든 이벤트가 공유하는 컨텍스트 */
export interface AnalyticsContext {
  /** 익명 방문자 ID — 1st-party 쿠키/localStorage, PII 아님 */
  anonymousId: string;
  /** 탭 단위 세션 ID (30분 무활동 시 갱신) */
  sessionId: string;
  pageId: string;
  path: string;
  locale: LocaleCode;
  referrer?: string;
  /** UTM 파라미터 — 유입 채널별 이탈 분석용 */
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  device: DeviceInfo;
}

export interface DeviceInfo {
  type: 'desktop' | 'tablet' | 'mobile';
  viewportWidth: number;
  viewportHeight: number;
  /** 히트맵 좌표 정규화의 기준 — 기기별 폭 차이를 보정한다 */
  dpr: number;
  os?: string;
  browser?: string;
  /** 국가 코드는 서버에서 IP → geo 로 채운다 (클라이언트는 비움) */
  country?: string;
}

/** 클릭 이벤트 페이로드 */
export interface ElementClickPayload {
  elementId: string;
  elementType: ElementType;
  elementName?: string;
  /** 요소 박스 기준 상대 좌표 0~1 — 반응형에서도 히트맵이 일치한다 */
  relX: number;
  relY: number;
  /** 페이지 기준 절대 좌표(px) — 픽셀 히트맵 렌더링용 */
  pageX: number;
  pageY: number;
  /** 버튼/링크의 목적지 */
  href?: string;
  /** 페이지 진입 후 경과 ms */
  timeOnPage: number;
}

export interface ScrollDepthPayload {
  /** 도달한 임계값 — 20 | 50 | 80 | 100 */
  threshold: ScrollThreshold;
  timeToReach: number;
  maxScrollPx: number;
  documentHeight: number;
}

export type ScrollThreshold = 20 | 50 | 80 | 100;
export const SCROLL_THRESHOLDS: ScrollThreshold[] = [20, 50, 80, 100];

export interface SectionDwellPayload {
  sectionId: string;
  sectionName?: string;
  /** 뷰포트 안에 머문 누적 ms */
  dwellMs: number;
  /** 섹션이 뷰포트를 차지한 최대 비율 0~1 */
  maxVisibleRatio: number;
}

/** 이탈 이벤트 — Drop-off 분석의 핵심 */
export interface ExitPayload {
  /** 이탈 시점에 뷰포트 중앙에 있던 섹션 = 드롭오프 지점 */
  lastVisibleSectionId: string | null;
  lastVisibleSectionName?: string;
  scrollDepth: number;
  timeOnPage: number;
  /** 이탈 방식 — 다음 행선지가 있으면 이탈이 아니라 이동이다 */
  reason: 'hidden' | 'unload' | 'navigation';
  nextPath?: string;
  /** 페이지에서 아무 클릭도 없었는가 (바운스 신호) */
  interacted: boolean;
}

export interface ImpressionPayload {
  elementId: string;
  elementType: ElementType;
  /** 노출까지 걸린 ms */
  timeToVisible: number;
}

export interface ConversionPayload {
  goal: string;
  elementId?: string;
  value?: number;
  currency?: string;
}

export interface VideoProgressPayload {
  elementId: string;
  provider: string;
  source: string;
  /** 25 | 50 | 75 | 100 */
  percent: number;
}

export interface RageClickPayload {
  elementId: string;
  clicks: number;
  windowMs: number;
  pageX: number;
  pageY: number;
}

export interface LocaleChangePayload {
  from: LocaleCode;
  to: LocaleCode;
  /** 'switcher' = 사용자가 직접 선택, 'auto' = 브라우저 감지 */
  method: 'switcher' | 'auto';
}

/** 이벤트 타입 → 페이로드 매핑 */
export interface AnalyticsPayloadMap {
  page_view: { title: string; loadMs?: number };
  element_click: ElementClickPayload;
  element_impression: ImpressionPayload;
  scroll_depth: ScrollDepthPayload;
  section_dwell: SectionDwellPayload;
  exit: ExitPayload;
  rage_click: RageClickPayload;
  dead_click: ElementClickPayload;
  conversion: ConversionPayload;
  locale_change: LocaleChangePayload;
  video_progress: VideoProgressPayload;
  form_submit: { elementId: string; formName?: string };
}

export interface AnalyticsEvent<T extends AnalyticsEventType = AnalyticsEventType> {
  /** 클라이언트 생성 UUID — 재전송 시 서버가 중복을 제거한다 */
  eventId: string;
  type: T;
  /** 클라이언트 시각(ms epoch). 서버는 별도로 receivedAt 을 기록한다. */
  ts: number;
  context: AnalyticsContext;
  payload: AnalyticsPayloadMap[T];
}

/** 배치 전송 봉투 — sendBeacon 한 번에 여러 이벤트를 실어 보낸다 */
export interface AnalyticsBatch {
  events: AnalyticsEvent[];
  sentAt: number;
  /** 스키마 버전 — 서버가 구버전 클라이언트를 구분해 마이그레이션한다 */
  v: 1;
}

/* ---------------------------------------------------------------------------
 * 2. STORAGE SCHEMA (내부 분석 DB)
 * ------------------------------------------------------------------------ */

/**
 * 원본 이벤트 테이블 `analytics_events`.
 * 파티션: (day, page_id) — 대부분의 조회가 "특정 페이지의 특정 기간"이다.
 *
 *   CREATE TABLE analytics_events (
 *     event_id     TEXT PRIMARY KEY,
 *     day          DATE        NOT NULL,
 *     ts           TIMESTAMPTZ NOT NULL,
 *     received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     type         TEXT        NOT NULL,
 *     anonymous_id TEXT        NOT NULL,
 *     session_id   TEXT        NOT NULL,
 *     page_id      TEXT        NOT NULL,
 *     path         TEXT        NOT NULL,
 *     locale       TEXT        NOT NULL,
 *     element_id   TEXT,
 *     device_type  TEXT,
 *     country      TEXT,
 *     payload      JSONB       NOT NULL
 *   ) PARTITION BY RANGE (day);
 *   CREATE INDEX ON analytics_events (page_id, day, type);
 *   CREATE INDEX ON analytics_events (element_id) WHERE element_id IS NOT NULL;
 */
export interface AnalyticsEventRow {
  eventId: string;
  day: string;
  ts: string;
  receivedAt: string;
  type: AnalyticsEventType;
  anonymousId: string;
  sessionId: string;
  pageId: string;
  path: string;
  locale: LocaleCode;
  elementId: string | null;
  deviceType: DeviceInfo['type'];
  country: string | null;
  payload: Record<string, unknown>;
}

/**
 * 롤업 테이블 `analytics_element_daily` — 히트맵은 원본이 아니라 이 표를 읽는다.
 *
 *   CREATE TABLE analytics_element_daily (
 *     day DATE, page_id TEXT, element_id TEXT, device_type TEXT, locale TEXT,
 *     clicks BIGINT, unique_clickers BIGINT, impressions BIGINT,
 *     rage_clicks BIGINT, dead_clicks BIGINT,
 *     PRIMARY KEY (day, page_id, element_id, device_type, locale)
 *   );
 */
export interface ElementDailyRow {
  day: string;
  pageId: string;
  elementId: string;
  deviceType: DeviceInfo['type'];
  locale: LocaleCode;
  clicks: number;
  uniqueClickers: number;
  impressions: number;
  rageClicks: number;
  deadClicks: number;
}

/* ---------------------------------------------------------------------------
 * 3. AGGREGATES (서버 → 에디터 히트맵/리포트)
 * ------------------------------------------------------------------------ */

export interface ElementStat {
  elementId: string;
  elementName?: string;
  elementType?: ElementType;
  clicks: number;
  uniqueClickers: number;
  impressions: number;
  /** clicks / 전체 페이지 클릭 수 — 히트맵 % 오버레이에 표시되는 값 */
  clickShare: number;
  /** clicks / impressions — 노출 대비 클릭률(CTR) */
  ctr: number;
  rageClicks: number;
  deadClicks: number;
  /** 0~1 로 정규화된 강도 — 오버레이 색상 결정 */
  intensity: number;
}

export interface ScrollFunnelStep {
  threshold: ScrollThreshold;
  reached: number;
  /** 전체 세션 대비 도달률 0~1 */
  rate: number;
  /** 이전 단계 대비 유지율 0~1 */
  stepRetention: number;
  medianTimeToReachMs: number;
}

export interface SectionDropOff {
  sectionId: string;
  sectionName?: string;
  /** 이 섹션을 마지막으로 보고 이탈한 세션 수 */
  exits: number;
  /** exits / 이 섹션을 본 세션 수 = 이탈률 */
  exitRate: number;
  views: number;
  avgDwellMs: number;
}

export interface PageAnalyticsSummary {
  pageId: string;
  path: string;
  range: { from: string; to: string };
  filters: AnalyticsFilters;
  sessions: number;
  pageViews: number;
  uniqueVisitors: number;
  avgTimeOnPageMs: number;
  bounceRate: number;
  totalClicks: number;
  elements: ElementStat[];
  scrollFunnel: ScrollFunnelStep[];
  dropOff: SectionDropOff[];
  /** 픽셀 히트맵용 클릭 좌표 버킷 (선택적, 무거우므로 요청 시에만) */
  clickPoints?: ClickPointBucket[];
  localeBreakdown: Array<{ locale: LocaleCode; sessions: number; share: number }>;
  /** 전환 목표별 성과 — '전환 목표명' 을 지정한 요소가 클릭된 횟수 */
  conversions: ConversionStat[];
}

export interface ConversionStat {
  /** 요소에 지정한 전환 목표명 (예: hero_cta, inquiry_submit) */
  goal: string;
  /** 발생 횟수 */
  count: number;
  /** 한 번이라도 전환한 세션 수 — 같은 사람이 세 번 눌러도 1 */
  sessions: number;
  /** 전환한 세션 / 전체 세션 */
  rate: number;
}

export interface ClickPointBucket {
  /** 페이지 폭 기준 0~1 정규화 */
  x: number;
  y: number;
  count: number;
}

export interface AnalyticsFilters {
  pageId?: string;
  from?: string;
  to?: string;
  device?: DeviceInfo['type'] | 'all';
  locale?: LocaleCode | 'all';
  country?: string | 'all';
}

/* ---------------------------------------------------------------------------
 * 4. PROVIDER CONFIG (GA4 / Mixpanel / 내부)
 * ------------------------------------------------------------------------ */

export interface AnalyticsProviderConfig {
  /** 내부 수집 엔드포인트 — 항상 켜두는 것을 권장 (원본 데이터 소유) */
  internal: { enabled: boolean; endpoint: string; batchSize: number; flushIntervalMs: number };
  ga4: { enabled: boolean; measurementId?: string };
  mixpanel: { enabled: boolean; token?: string; apiHost?: string };
  /** 동의(consent) 이전에는 전송 자체를 보류한다 */
  requireConsent: boolean;
  /** 개발 중 콘솔 출력 */
  debug: boolean;
  /** 샘플링 비율 0~1 — 트래픽이 큰 페이지의 비용 제어 */
  sampleRate: number;
}
