'use client';

import { useCallback, useEffect, useRef } from 'react';
import { DEFAULT_ANALYTICS_CONFIG, dispatchRealtime, hasConsent, initGA4, sendBatch } from '@/lib/analytics/providers';
import { getAnonymousId, getDeviceInfo, getSessionId, getUTM, uuid } from '@/lib/analytics/identity';
import { initPostHog, posthogPageView, sendToPostHog, setPostHogPersonProps } from '@/lib/analytics/posthog';
import { initUmami, umamiTrack } from '@/lib/analytics/umami';
import { SCROLL_THRESHOLDS } from '@/types/analytics';
import type {
  AnalyticsContext,
  AnalyticsEvent,
  AnalyticsEventType,
  AnalyticsPayloadMap,
  AnalyticsProviderConfig,
  ScrollThreshold,
} from '@/types/analytics';
import type { ElementType, LocaleCode } from '@/types/schema';

/* =============================================================================
 * useCanvasAnalytics — 캔버스 페이지 행동 추적 훅
 * -----------------------------------------------------------------------------
 * 한 번의 호출로 아래를 전부 수집한다:
 *   · page_view
 *   · element_click        (data-element-id 위임 클릭 + 요소 상대좌표)
 *   · rage_click / dead_click
 *   · element_impression   (IntersectionObserver)
 *   · scroll_depth         (20/50/80/100%)
 *   · section_dwell        (섹션별 체류 시간)
 *   · exit                 (마지막으로 보던 섹션 = 이탈 지점)
 *
 * 전송 경로: 내부 DB(배치) + PostHog + GA4 + Mixpanel + Umami
 * ========================================================================== */

export interface UseCanvasAnalyticsOptions {
  pageId: string;
  path: string;
  locale: LocaleCode;
  title?: string;
  enabled?: boolean;
  config?: Partial<AnalyticsProviderConfig>;
  posthog?: { key?: string; host?: string; sessionRecording?: boolean };
  /** 관측 대상 루트 — 미지정 시 document */
  rootRef?: React.RefObject<HTMLElement>;
}

export interface CanvasAnalyticsApi {
  /** 커스텀 전환 이벤트 수동 발생 */
  trackConversion: (goal: string, value?: number, elementId?: string) => void;
  trackLocaleChange: (from: LocaleCode, to: LocaleCode, method: 'switcher' | 'auto') => void;
  flush: () => void;
}

/** rage click 판정 — 800ms 안에 같은 요소를 3번 이상 */
const RAGE_WINDOW_MS = 800;
const RAGE_THRESHOLD = 3;

export function useCanvasAnalytics(options: UseCanvasAnalyticsOptions): CanvasAnalyticsApi {
  const { pageId, path, locale, title, enabled = true, rootRef } = options;

  const config: AnalyticsProviderConfig = {
    ...DEFAULT_ANALYTICS_CONFIG,
    ...options.config,
    internal: { ...DEFAULT_ANALYTICS_CONFIG.internal, ...options.config?.internal },
    ga4: { ...DEFAULT_ANALYTICS_CONFIG.ga4, ...options.config?.ga4 },
    mixpanel: { ...DEFAULT_ANALYTICS_CONFIG.mixpanel, ...options.config?.mixpanel },
  };

  /* --- 세션 상태 (렌더와 무관하므로 전부 ref) --- */
  const queue = useRef<AnalyticsEvent[]>([]);
  const startedAt = useRef<number>(Date.now());
  const maxScroll = useRef(0);
  const firedThresholds = useRef<Set<ScrollThreshold>>(new Set());
  const interacted = useRef(false);
  const exitSent = useRef(false);
  /** 섹션별 누적 체류 시간과 마지막 진입 시각 */
  const dwell = useRef<Map<string, { total: number; enteredAt: number | null; maxRatio: number; name?: string }>>(new Map());
  /** 뷰포트 중앙에 가장 가까운 섹션 = 이탈 지점 후보 */
  const currentSection = useRef<{ id: string; name?: string } | null>(null);
  const rage = useRef<{ id: string; count: number; firstAt: number } | null>(null);
  const contextRef = useRef<AnalyticsContext | null>(null);

  /* --- 컨텍스트 --- */
  const buildContext = useCallback((): AnalyticsContext => {
    if (contextRef.current && contextRef.current.pageId === pageId && contextRef.current.locale === locale) {
      return contextRef.current;
    }
    const ctx: AnalyticsContext = {
      anonymousId: getAnonymousId(),
      sessionId: getSessionId(),
      pageId,
      path,
      locale,
      referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      utm: getUTM(),
      device: getDeviceInfo(),
    };
    contextRef.current = ctx;
    return ctx;
  }, [pageId, path, locale]);

  /* --- 전송 --- */
  const flush = useCallback(() => {
    if (!queue.current.length) return;
    const events = queue.current;
    queue.current = [];
    sendBatch({ events, sentAt: Date.now(), v: 1 }, config);
  }, [config]);

  const track = useCallback(
    <T extends AnalyticsEventType>(type: T, payload: AnalyticsPayloadMap[T]) => {
      if (!enabled) return;
      if (config.requireConsent && !hasConsent()) return;
      // 샘플링은 세션 단위로 고정되어야 퍼널이 깨지지 않는다
      if (config.sampleRate < 1 && !sampledIn(buildContext().sessionId, config.sampleRate)) return;

      const event: AnalyticsEvent<T> = {
        eventId: uuid(),
        type,
        ts: Date.now(),
        context: buildContext(),
        payload,
      };

      queue.current.push(event as AnalyticsEvent);
      dispatchRealtime(event as AnalyticsEvent, config);
      sendToPostHog(event as AnalyticsEvent);
      umamiTrack(type, payload as Record<string, unknown>);

      // exit 는 지연 없이 즉시 내보낸다 (탭이 닫히는 중일 수 있다)
      if (type === 'exit' || queue.current.length >= config.internal.batchSize) flush();
    },
    [enabled, config, buildContext, flush],
  );

  /* --- 초기화: 외부 SDK + page_view --- */
  useEffect(() => {
    if (!enabled) return;
    if (config.ga4.enabled && config.ga4.measurementId) initGA4(config.ga4.measurementId);
    const phKey = options.posthog?.key ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const phHost = options.posthog?.host ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
    if (phKey) {
      initPostHog({ key: phKey, host: phHost, sessionRecording: options.posthog?.sessionRecording, debug: config.debug });
      setPostHogPersonProps({ locale, last_page: path });
    }

    /* Umami 는 스크립트가 주입돼야 window.umami 가 생긴다.
       초기화하지 않으면 umamiTrack() 호출이 조용히 무시된다. */
    const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;
    const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
    if (umamiUrl && umamiId) initUmami(umamiUrl, umamiId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    startedAt.current = Date.now();
    maxScroll.current = 0;
    firedThresholds.current = new Set();
    interacted.current = false;
    exitSent.current = false;
    dwell.current = new Map();

    const loadMs = typeof performance !== 'undefined' ? Math.round(performance.now()) : undefined;
    track('page_view', { title: title ?? document.title, loadMs });
    posthogPageView(path, { page_id: pageId, locale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pageId, path, locale]);

  /* --- 1. 클릭 위임 --------------------------------------------------------- */
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef?.current ?? document;

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.('[data-element-id]') as HTMLElement | null;
      if (!el || el.dataset.noTrack === 'true') return;

      const rect = el.getBoundingClientRect();
      const me = e as MouseEvent;
      const elementId = el.dataset.elementId as string;
      const payload = {
        elementId,
        elementType: (el.dataset.elementType ?? 'Container') as ElementType,
        elementName: el.dataset.elementName,
        /* 요소 기준 상대 좌표 — 반응형에서 폭이 달라져도 히트맵이 일치한다 */
        relX: rect.width ? clamp01((me.clientX - rect.left) / rect.width) : 0,
        relY: rect.height ? clamp01((me.clientY - rect.top) / rect.height) : 0,
        pageX: Math.round(me.pageX),
        pageY: Math.round(me.pageY),
        href: (el.querySelector('a') as HTMLAnchorElement | null)?.href ?? (el as HTMLAnchorElement).href,
        timeOnPage: Date.now() - startedAt.current,
      };

      interacted.current = true;
      track('element_click', payload);

      /* rage click: 같은 요소를 짧은 시간에 반복 클릭 → UX 문제 신호 */
      const now = Date.now();
      if (rage.current?.id === elementId && now - rage.current.firstAt < RAGE_WINDOW_MS) {
        rage.current.count += 1;
        if (rage.current.count === RAGE_THRESHOLD) {
          track('rage_click', { elementId, clicks: rage.current.count, windowMs: now - rage.current.firstAt, pageX: payload.pageX, pageY: payload.pageY });
        }
      } else {
        rage.current = { id: elementId, count: 1, firstAt: now };
      }

      /* dead click: 링크도 액션도 없는 요소를 클릭 → 클릭 가능해 보이는 오해 */
      const isInteractive = Boolean(payload.href) || el.dataset.elementType === 'Button' || el.closest('a,button');
      if (!isInteractive) track('dead_click', payload);

      /* 전환 지점 */
      const goal = el.dataset.conversionGoal;
      if (goal) track('conversion', { goal, elementId });
    };

    root.addEventListener('click', onClick, { capture: true });
    return () => root.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
  }, [enabled, rootRef, track]);

  /* --- 2. 스크롤 깊이 ------------------------------------------------------- */
  useEffect(() => {
    if (!enabled) return;

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const depth = scrollable > 0 ? clamp01((window.scrollY + window.innerHeight - window.innerHeight) / scrollable) : 1;
      const percent = Math.round(depth * 100);
      maxScroll.current = Math.max(maxScroll.current, window.scrollY);

      for (const threshold of SCROLL_THRESHOLDS) {
        if (percent >= threshold && !firedThresholds.current.has(threshold)) {
          firedThresholds.current.add(threshold);
          track('scroll_depth', {
            threshold,
            timeToReach: Date.now() - startedAt.current,
            maxScrollPx: Math.round(maxScroll.current),
            documentHeight: doc.scrollHeight,
          });
        }
      }
    };

    // rAF 스로틀 — 스크롤 핸들러가 메인 스레드를 막지 않도록
    let ticking = false;
    const handler = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
    };

    window.addEventListener('scroll', handler, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', handler);
  }, [enabled, track]);

  /* --- 3. 섹션 노출 / 체류 / 이탈 지점 (IntersectionObserver) ---------------- */
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return;

    const impressionSeen = new Set<string>();

    /* (a) 노출 관측 — 요소가 처음 보였는가 */
    const impressionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.dataset.elementId;
          if (!id || !entry.isIntersecting || impressionSeen.has(id) || el.dataset.noTrack === 'true') continue;
          impressionSeen.add(id);
          track('element_impression', {
            elementId: id,
            elementType: (el.dataset.elementType ?? 'Container') as ElementType,
            timeToVisible: Date.now() - startedAt.current,
          });
        }
      },
      { threshold: 0.5 },
    );

    /* (b) 섹션 체류 관측 — 여러 임계값으로 "얼마나 보였는지"까지 잡는다 */
    const dwellObserver = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.dataset.elementId;
          if (!id) continue;
          const rec = dwell.current.get(id) ?? { total: 0, enteredAt: null, maxRatio: 0, name: el.dataset.elementName };
          rec.maxRatio = Math.max(rec.maxRatio, entry.intersectionRatio);

          if (entry.isIntersecting && rec.enteredAt === null) {
            rec.enteredAt = now;
          } else if (!entry.isIntersecting && rec.enteredAt !== null) {
            rec.total += now - rec.enteredAt;
            rec.enteredAt = null;
          }
          dwell.current.set(id, rec);
        }
        updateCurrentSection();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    /** 뷰포트 중앙을 차지한 섹션을 '현재 보고 있는 섹션'으로 본다 */
    const updateCurrentSection = () => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section="true"]'));
      const mid = window.innerHeight / 2;
      let best: { id: string; name?: string; distance: number } | null = null;
      for (const el of sections) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - mid);
        if (!best || distance < best.distance) {
          best = { id: el.dataset.elementId ?? '', name: el.dataset.elementName, distance };
        }
      }
      if (best) currentSection.current = { id: best.id, name: best.name };
    };

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-element-id]'));
    for (const el of targets) impressionObserver.observe(el);
    for (const el of document.querySelectorAll<HTMLElement>('[data-section="true"]')) dwellObserver.observe(el);

    const onScroll = () => updateCurrentSection();
    window.addEventListener('scroll', onScroll, { passive: true });
    updateCurrentSection();

    return () => {
      impressionObserver.disconnect();
      dwellObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [enabled, track, pageId]);

  /* --- 4. 이탈 (Drop-off) --------------------------------------------------- */
  useEffect(() => {
    if (!enabled) return;

    const sendExit = (reason: 'hidden' | 'unload' | 'navigation') => {
      if (exitSent.current) return;
      exitSent.current = true;

      // 진행 중이던 섹션 체류를 마감해서 함께 보낸다
      const now = Date.now();
      for (const [id, rec] of dwell.current.entries()) {
        if (rec.enteredAt !== null) {
          rec.total += now - rec.enteredAt;
          rec.enteredAt = null;
        }
        if (rec.total > 0) {
          track('section_dwell', { sectionId: id, sectionName: rec.name, dwellMs: rec.total, maxVisibleRatio: rec.maxRatio });
        }
      }

      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      track('exit', {
        lastVisibleSectionId: currentSection.current?.id ?? null,
        lastVisibleSectionName: currentSection.current?.name,
        scrollDepth: scrollable > 0 ? Math.round(clamp01(maxScroll.current / scrollable) * 100) : 100,
        timeOnPage: now - startedAt.current,
        reason,
        interacted: interacted.current,
      });
      flush();
    };

    /* visibilitychange 가 모바일에서 가장 신뢰할 수 있는 신호다.
       pagehide 는 bfcache 대응, beforeunload 는 데스크톱 폴백. */
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sendExit('hidden');
    };
    const onPageHide = () => sendExit('unload');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // SPA 라우트 전환 = 이탈이 아니라 이동
      sendExit('navigation');
    };
  }, [enabled, track, flush]);

  /* --- 5. 주기적 플러시 ----------------------------------------------------- */
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(flush, config.internal.flushIntervalMs);
    return () => {
      clearInterval(timer);
      flush();
    };
  }, [enabled, flush, config.internal.flushIntervalMs]);

  /* --- 공개 API ------------------------------------------------------------- */
  const trackConversion = useCallback(
    (goal: string, value?: number, elementId?: string) => track('conversion', { goal, value, elementId }),
    [track],
  );

  const trackLocaleChange = useCallback(
    (from: LocaleCode, to: LocaleCode, method: 'switcher' | 'auto') => {
      track('locale_change', { from, to, method });
      setPostHogPersonProps({ locale: to });
    },
    [track],
  );

  return { trackConversion, trackLocaleChange, flush };
}

/* ---- 유틸 ----------------------------------------------------------------- */

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 세션 ID 해시 기반 결정적 샘플링 — 같은 세션은 항상 같은 판정을 받는다 */
function sampledIn(sessionId: string, rate: number): boolean {
  let h = 0;
  for (let i = 0; i < sessionId.length; i += 1) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000 < rate;
}
