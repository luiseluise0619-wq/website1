import 'server-only';
import { analyticsStorage } from './storage';
import type {
  AnalyticsEvent,
  AnalyticsEventRow,
  AnalyticsFilters,
  ClickPointBucket,
  ElementClickPayload,
  ElementStat,
  ExitPayload,
  ImpressionPayload,
  PageAnalyticsSummary,
  ScrollDepthPayload,
  ScrollFunnelStep,
  SectionDropOff,
  SectionDwellPayload,
} from '@/types/analytics';
import { SCROLL_THRESHOLDS } from '@/types/analytics';
import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * Analytics Store — 수집 · 적재 · 집계
 * -----------------------------------------------------------------------------
 * 적재/조회는 storage 드라이버가, 집계는 이 파일의 순수 함수가 담당한다.
 * 트래픽이 커지면 summarize() 를 롤업 테이블(analytics_element_daily) 조회로
 * 바꾸면 되고, 결과 형태(PageAnalyticsSummary)는 그대로 유지된다.
 * ========================================================================== */

export async function insertEvents(events: AnalyticsEvent[], meta: { country?: string } = {}): Promise<number> {
  if (!events.length) return 0;
  const receivedAt = new Date().toISOString();

  const rows: AnalyticsEventRow[] = events
    .filter((event) => Boolean(event?.eventId))
    .map((event) => {
      const ts = new Date(event.ts || Date.now()).toISOString();
      const payload = event.payload as { elementId?: string; sectionId?: string } | undefined;
      return {
        eventId: event.eventId,
        day: ts.slice(0, 10),
        ts,
        receivedAt,
        type: event.type,
        anonymousId: event.context.anonymousId,
        sessionId: event.context.sessionId,
        pageId: event.context.pageId,
        path: event.context.path,
        locale: event.context.locale,
        elementId: payload?.elementId ?? payload?.sectionId ?? null,
        deviceType: event.context.device?.type ?? 'desktop',
        country: meta.country ?? event.context.device?.country ?? null,
        payload: event.payload as Record<string, unknown>,
      };
    });

  return analyticsStorage.insert(rows);
}

/* ---------------------------------------------------------------------------
 * 집계
 * ------------------------------------------------------------------------ */

interface ElementGroup {
  clicks: AnalyticsEventRow[];
  impressions: AnalyticsEventRow[];
  rage: AnalyticsEventRow[];
  dead: AnalyticsEventRow[];
}

/** 클릭·노출·분노·데드 클릭을 요소 id 로 한 번에 묶는다 (순회 1회) */
function groupByElement(
  [clicks, impressions, rage, dead]: AnalyticsEventRow[][],
): Map<string, ElementGroup> {
  const map = new Map<string, ElementGroup>();
  const bucket = (id: string): ElementGroup => {
    let g = map.get(id);
    if (!g) {
      g = { clicks: [], impressions: [], rage: [], dead: [] };
      map.set(id, g);
    }
    return g;
  };

  /* 요소 목록은 클릭·노출에서만 만든다 — 분노/데드 클릭만 있는 id 로
     칸을 만들면 히트맵에 클릭 0 짜리 항목이 생긴다(기존 동작 유지). */
  for (const r of clicks) if (r.elementId) bucket(r.elementId).clicks.push(r);
  for (const r of impressions) if (r.elementId) bucket(r.elementId).impressions.push(r);
  for (const r of rage) if (r.elementId && map.has(r.elementId)) map.get(r.elementId)!.rage.push(r);
  for (const r of dead) if (r.elementId && map.has(r.elementId)) map.get(r.elementId)!.dead.push(r);

  return map;
}

export async function summarize(filters: AnalyticsFilters): Promise<PageAnalyticsSummary> {
  /* 기간 미지정은 '전체 기간'이다. 여기서 센티널 날짜('0000-01-01')를 만들어
     드라이버에 넘기면 Postgres 가 범위를 벗어난 날짜로 거부한다 — 경계값은
     드라이버에 넘기지 않고, 표시용 range 에만 사용한다. */
  const rows = await analyticsStorage.query({
    pageId: filters.pageId,
    from: filters.from,
    to: filters.to,
    device: filters.device,
    locale: filters.locale,
    country: filters.country,
  });

  const days = rows.map((r) => r.day).sort();
  const from = filters.from ?? days[0] ?? '-';
  const to = filters.to ?? days[days.length - 1] ?? '-';

  const sessions = new Set(rows.map((r) => r.sessionId));
  const visitors = new Set(rows.map((r) => r.anonymousId));
  const pageViews = rows.filter((r) => r.type === 'page_view').length;

  /* --- 요소별 클릭/노출 --- */
  const clicks = rows.filter((r) => r.type === 'element_click');
  const impressions = rows.filter((r) => r.type === 'element_impression');
  const rageClicks = rows.filter((r) => r.type === 'rage_click');
  const deadClicks = rows.filter((r) => r.type === 'dead_click');
  const totalClicks = clicks.length;

  /* 요소마다 전체 행을 다시 훑으면 (요소 수 × 이벤트 수) 가 된다.
     요소가 수십 개, 이벤트가 수십만 건이면 집계 한 번에 수 초가 걸린다.
     한 번의 순회로 요소별 묶음을 만들어 둔다. */
  const byElement = groupByElement([clicks, impressions, rageClicks, deadClicks]);

  const elements: ElementStat[] = [...byElement.entries()].map(([elementId, g]) => {
    const clickCount = g.clicks.length;
    const impressionCount = g.impressions.length;
    const payload = g.clicks[0]?.payload as unknown as ElementClickPayload | undefined;
    const impPayload = g.impressions[0]?.payload as unknown as ImpressionPayload | undefined;

    return {
      elementId,
      elementName: payload?.elementName,
      elementType: payload?.elementType ?? impPayload?.elementType,
      clicks: clickCount,
      uniqueClickers: new Set(g.clicks.map((r) => r.anonymousId)).size,
      impressions: impressionCount,
      clickShare: totalClicks ? clickCount / totalClicks : 0,
      ctr: impressionCount ? clickCount / impressionCount : 0,
      rageClicks: g.rage.length,
      deadClicks: g.dead.length,
      intensity: 0,
    };
  });

  // 강도는 최댓값 기준으로 정규화한다 — 색상 스케일이 데이터에 맞춰 늘어난다
  const maxClicks = Math.max(1, ...elements.map((e) => e.clicks));
  for (const el of elements) el.intensity = el.clicks / maxClicks;
  elements.sort((a, b) => b.clicks - a.clicks);

  /* --- 스크롤 퍼널 --- */
  const scrollRows = rows.filter((r) => r.type === 'scroll_depth');
  const sessionCount = sessions.size || 1;
  let previousReached = sessionCount;
  const scrollFunnel: ScrollFunnelStep[] = SCROLL_THRESHOLDS.map((threshold) => {
    const reachedSessions = new Set(
      scrollRows.filter((r) => (r.payload as unknown as ScrollDepthPayload).threshold === threshold).map((r) => r.sessionId),
    );
    const reached = reachedSessions.size;
    const times = scrollRows
      .filter((r) => (r.payload as unknown as ScrollDepthPayload).threshold === threshold)
      .map((r) => (r.payload as unknown as ScrollDepthPayload).timeToReach)
      .sort((a, b) => a - b);
    const step: ScrollFunnelStep = {
      threshold,
      reached,
      rate: reached / sessionCount,
      stepRetention: previousReached ? reached / previousReached : 0,
      medianTimeToReachMs: times.length ? times[Math.floor(times.length / 2)] : 0,
    };
    previousReached = reached || previousReached;
    return step;
  });

  /* --- 섹션별 이탈 --- */
  const exitRows = rows.filter((r) => r.type === 'exit');
  const dwellRows = rows.filter((r) => r.type === 'section_dwell');
  /* 요소 집계와 같은 이유로 섹션도 한 번에 묶는다 (섹션 수 × 이벤트 수 방지) */
  const exitsBySection = new Map<string, AnalyticsEventRow[]>();
  for (const r of exitRows) {
    const id = (r.payload as unknown as ExitPayload).lastVisibleSectionId;
    if (!id) continue;
    (exitsBySection.get(id) ?? exitsBySection.set(id, []).get(id)!).push(r);
  }
  const viewsBySection = new Map<string, AnalyticsEventRow[]>();
  for (const r of dwellRows) {
    const id = (r.payload as unknown as SectionDwellPayload).sectionId;
    if (!id) continue;
    (viewsBySection.get(id) ?? viewsBySection.set(id, []).get(id)!).push(r);
  }
  const sectionIds = new Set<string>([...exitsBySection.keys(), ...viewsBySection.keys()]);

  const dropOff: SectionDropOff[] = [...sectionIds].map((sectionId) => {
    const exits = exitsBySection.get(sectionId) ?? [];
    const views = viewsBySection.get(sectionId) ?? [];
    const viewSessions = new Set(views.map((r) => r.sessionId)).size;
    const dwellTotal = views.reduce((n, r) => n + (r.payload as unknown as SectionDwellPayload).dwellMs, 0);
    /* 이탈률은 '이 섹션을 본 세션 중 여기서 떠난 비율' 이다. 분자를 이벤트 수로
       세면 한 세션이 같은 섹션에서 두 번 떠났을 때 100% 를 넘는 값(예: 175%)이
       패널에 그대로 표시된다. 분자·분모를 모두 세션 단위로 맞춘다. */
    const exitSessions = new Set(exits.map((r) => r.sessionId)).size;
    return {
      sectionId,
      sectionName:
        (exits[0]?.payload as unknown as ExitPayload)?.lastVisibleSectionName ??
        (views[0]?.payload as unknown as SectionDwellPayload)?.sectionName,
      exits: exits.length,
      exitRate: viewSessions ? Math.min(1, exitSessions / viewSessions) : 0,
      views: viewSessions,
      avgDwellMs: views.length ? dwellTotal / views.length : 0,
    };
  });
  dropOff.sort((a, b) => b.exitRate - a.exitRate);

  /* --- 체류 시간 / 바운스 --- */
  const exitPayloads = exitRows.map((r) => r.payload as unknown as ExitPayload);
  const avgTimeOnPageMs = exitPayloads.length
    ? exitPayloads.reduce((n, p) => n + (p.timeOnPage ?? 0), 0) / exitPayloads.length
    : 0;
  // 바운스 = 아무 상호작용 없이 떠난 세션
  const bouncedSessions = new Set(exitRows.filter((r) => !(r.payload as unknown as ExitPayload).interacted).map((r) => r.sessionId));
  const bounceRate = sessions.size ? bouncedSessions.size / sessions.size : 0;

  /* --- 클릭 좌표 버킷 (픽셀 히트맵용) --- */
  const clickPoints = bucketClickPoints(clicks);

  /* --- 언어별 분포 --- */
  const localeMap = new Map<LocaleCode, Set<string>>();
  for (const r of rows) {
    if (!localeMap.has(r.locale)) localeMap.set(r.locale, new Set());
    localeMap.get(r.locale)?.add(r.sessionId);
  }
  const localeBreakdown = [...localeMap.entries()]
    .map(([locale, set]) => ({ locale, sessions: set.size, share: set.size / sessionCount }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    pageId: filters.pageId ?? 'all',
    path: rows[0]?.path ?? '',
    range: { from, to },
    filters,
    sessions: sessions.size,
    pageViews,
    uniqueVisitors: visitors.size,
    avgTimeOnPageMs,
    bounceRate,
    totalClicks,
    elements,
    scrollFunnel,
    dropOff,
    clickPoints,
    localeBreakdown,
  };
}

/** 클릭 좌표를 정규화 격자에 모아 픽셀 히트맵용 버킷을 만든다 */
function bucketClickPoints(clicks: AnalyticsEventRow[], gridSize = 40): ClickPointBucket[] {
  const buckets = new Map<string, ClickPointBucket>();
  for (const row of clicks) {
    const p = row.payload as unknown as ElementClickPayload;
    if (typeof p.pageX !== 'number') continue;
    // 기기 폭 차이를 흡수하기 위해 뷰포트 폭으로 정규화한 좌표를 쓴다
    const x = Math.round((p.pageX / 1440) * gridSize) / gridSize;
    const y = Math.round(p.pageY / 100) * 100;
    const key = `${x}:${y}`;
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { x, y, count: 1 });
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 500);
}
