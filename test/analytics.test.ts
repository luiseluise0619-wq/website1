import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsEventRow } from '@/types/analytics';

/* 집계는 히트맵·이탈 리포트의 근거다.
   저장소 드라이버를 가짜로 바꿔 순수 집계 로직만 검증한다. */

const rows: AnalyticsEventRow[] = [];

vi.mock('@/lib/server/storage', () => ({
  analyticsStorage: {
    name: 'test',
    readOnly: false,
    insert: async (r: AnalyticsEventRow[]) => {
      rows.push(...r);
      return r.length;
    },
    query: async (f: { locale?: string; device?: string }) =>
      rows.filter((r) => {
        if (f.locale && f.locale !== 'all' && r.locale !== f.locale) return false;
        if (f.device && f.device !== 'all' && r.deviceType !== f.device) return false;
        return true;
      }),
  },
}));

const { summarize } = await import('@/lib/server/analyticsStore');

function row(partial: Partial<AnalyticsEventRow> & { type: AnalyticsEventRow['type'] }): AnalyticsEventRow {
  return {
    eventId: Math.random().toString(36).slice(2),
    day: '2026-08-01',
    ts: '2026-08-01T00:00:00.000Z',
    receivedAt: '2026-08-01T00:00:00.000Z',
    anonymousId: 'a1',
    sessionId: 's1',
    pageId: 'page_home',
    path: '/',
    locale: 'ko',
    elementId: null,
    deviceType: 'desktop',
    country: 'KR',
    payload: {},
    ...partial,
  };
}

beforeEach(() => {
  rows.length = 0;
});

describe('summarize — 요소별 클릭', () => {
  it('클릭 점유율과 CTR 을 계산한다', async () => {
    rows.push(
      ...Array.from({ length: 3 }, (_, i) =>
        row({ type: 'element_click', elementId: 'cta', sessionId: `s${i}`, anonymousId: `a${i}`,
              payload: { elementId: 'cta', elementType: 'Button' } })),
      row({ type: 'element_click', elementId: 'nav', payload: { elementId: 'nav', elementType: 'Button' } }),
      ...Array.from({ length: 6 }, () =>
        row({ type: 'element_impression', elementId: 'cta', payload: { elementId: 'cta' } })),
    );

    const s = await summarize({ pageId: 'page_home' });
    const cta = s.elements.find((e) => e.elementId === 'cta')!;
    expect(cta.clicks).toBe(3);
    expect(cta.clickShare).toBeCloseTo(0.75);  // 3 / 4
    expect(cta.ctr).toBeCloseTo(0.5);          // 3 / 6
    expect(cta.uniqueClickers).toBe(3);
    expect(cta.intensity).toBe(1);             // 최댓값 기준 정규화
  });

  it('클릭 많은 순으로 정렬한다', async () => {
    rows.push(
      row({ type: 'element_click', elementId: 'low', payload: { elementId: 'low' } }),
      ...Array.from({ length: 5 }, () => row({ type: 'element_click', elementId: 'high', payload: { elementId: 'high' } })),
    );
    const s = await summarize({});
    expect(s.elements[0].elementId).toBe('high');
  });

  it('노출이 0 이면 CTR 은 0 (0 나누기 방지)', async () => {
    rows.push(row({ type: 'element_click', elementId: 'x', payload: { elementId: 'x' } }));
    const s = await summarize({});
    expect(s.elements[0].ctr).toBe(0);
  });
});

describe('summarize — 스크롤 퍼널', () => {
  it('도달률과 단계별 유지율을 계산한다', async () => {
    // 10개 세션: 전부 20% 도달, 5개만 50% 도달
    for (let i = 0; i < 10; i++) {
      rows.push(row({ type: 'scroll_depth', sessionId: `s${i}`, payload: { threshold: 20, timeToReach: 1000 } }));
    }
    for (let i = 0; i < 5; i++) {
      rows.push(row({ type: 'scroll_depth', sessionId: `s${i}`, payload: { threshold: 50, timeToReach: 3000 } }));
    }

    const s = await summarize({});
    const step20 = s.scrollFunnel.find((f) => f.threshold === 20)!;
    const step50 = s.scrollFunnel.find((f) => f.threshold === 50)!;
    expect(step20.reached).toBe(10);
    expect(step20.rate).toBe(1);
    expect(step50.reached).toBe(5);
    expect(step50.stepRetention).toBeCloseTo(0.5); // 10 → 5
  });
});

describe('summarize — 이탈 지점', () => {
  it('섹션별 이탈률과 최다 이탈 지점을 낸다', async () => {
    // hero: 10세션이 보고 8세션이 이탈 / body: 10세션이 보고 2세션이 이탈
    for (let i = 0; i < 10; i++) {
      rows.push(row({ type: 'section_dwell', sessionId: `s${i}`, payload: { sectionId: 'hero', sectionName: 'Hero', dwellMs: 5000 } }));
      rows.push(row({ type: 'section_dwell', sessionId: `s${i}`, payload: { sectionId: 'body', sectionName: 'Body', dwellMs: 3000 } }));
    }
    for (let i = 0; i < 8; i++) {
      rows.push(row({ type: 'exit', sessionId: `s${i}`, payload: { lastVisibleSectionId: 'hero', lastVisibleSectionName: 'Hero', timeOnPage: 9000, interacted: true } }));
    }
    for (let i = 8; i < 10; i++) {
      rows.push(row({ type: 'exit', sessionId: `s${i}`, payload: { lastVisibleSectionId: 'body', lastVisibleSectionName: 'Body', timeOnPage: 20000, interacted: true } }));
    }

    const s = await summarize({});
    expect(s.dropOff[0].sectionId).toBe('hero'); // 이탈률 높은 순
    expect(s.dropOff[0].exitRate).toBeCloseTo(0.8);
    expect(s.dropOff.find((d) => d.sectionId === 'body')!.exitRate).toBeCloseTo(0.2);
  });

  it('한 세션이 같은 섹션에서 두 번 떠나도 이탈률이 100% 를 넘지 않는다', async () => {
    /* 언어 전환처럼 한 방문 안에서 exit 이 두 번 기록될 수 있다.
       분자를 이벤트 수로 세면 175% 같은 값이 패널에 그대로 표시된다. */
    rows.push(row({ type: 'section_dwell', sessionId: 's1', payload: { sectionId: 'hero', dwellMs: 4000 } }));
    rows.push(row({ type: 'exit', sessionId: 's1', payload: { lastVisibleSectionId: 'hero', timeOnPage: 4000, interacted: true } }));
    rows.push(row({ type: 'exit', sessionId: 's1', payload: { lastVisibleSectionId: 'hero', timeOnPage: 9000, interacted: true } }));

    const s = await summarize({});
    const hero = s.dropOff.find((d) => d.sectionId === 'hero')!;
    expect(hero.exits).toBe(2); // 원본 이벤트 수는 그대로 보여 준다
    expect(hero.exitRate).toBe(1);
  });

  it('상호작용 없이 떠난 세션을 바운스로 센다', async () => {
    rows.push(
      row({ type: 'exit', sessionId: 's1', payload: { interacted: false, timeOnPage: 2000 } }),
      row({ type: 'exit', sessionId: 's2', payload: { interacted: true, timeOnPage: 30000 } }),
    );
    const s = await summarize({});
    expect(s.bounceRate).toBeCloseTo(0.5);
    expect(s.avgTimeOnPageMs).toBe(16000);
  });
});

describe('summarize — 필터와 경계', () => {
  it('언어 필터를 드라이버에 전달한다', async () => {
    rows.push(
      row({ type: 'element_click', locale: 'ko', elementId: 'x', payload: { elementId: 'x' } }),
      row({ type: 'element_click', locale: 'en', elementId: 'x', sessionId: 's2', payload: { elementId: 'x' } }),
    );
    expect((await summarize({ locale: 'en' })).totalClicks).toBe(1);
  });

  it('데이터가 없어도 던지지 않고 빈 요약을 낸다', async () => {
    const s = await summarize({ pageId: 'none' });
    expect(s.sessions).toBe(0);
    expect(s.totalClicks).toBe(0);
    expect(s.elements).toEqual([]);
    expect(s.bounceRate).toBe(0);
    expect(s.scrollFunnel).toHaveLength(4);
  });

  it('기간 미지정 시 실제 데이터 범위를 range 로 보고한다', async () => {
    rows.push(row({ type: 'page_view', day: '2026-08-01' }), row({ type: 'page_view', day: '2026-08-20' }));
    const s = await summarize({});
    expect(s.range).toEqual({ from: '2026-08-01', to: '2026-08-20' });
  });

  it('언어별 방문 분포를 낸다', async () => {
    rows.push(
      row({ type: 'page_view', sessionId: 's1', locale: 'ko' }),
      row({ type: 'page_view', sessionId: 's2', locale: 'th' }),
    );
    const s = await summarize({});
    expect(s.localeBreakdown.map((l) => l.locale).sort()).toEqual(['ko', 'th']);
  });
});
