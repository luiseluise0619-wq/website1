import { NextResponse } from 'next/server';
import { summarize } from '@/lib/server/analyticsStore';
import { isLocale } from '@/lib/i18n';
import { assertAdmin } from '@/lib/server/auth';
import type { AnalyticsFilters, DeviceInfo } from '@/types/analytics';

export const dynamic = 'force-dynamic';

const today = () => new Date().toISOString().slice(0, 10);

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/analytics/summary?pageId=..&from=YYYY-MM-DD&to=..&device=..&locale=..
 * 에디터 히트맵 오버레이와 이탈 패널이 읽는 단일 엔드포인트.
 */
export async function GET(request: Request) {
  /* 방문자 행동 데이터는 영업 정보다 — 에디터(로그인 상태)만 읽는다 */
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const device = url.searchParams.get('device');
  const locale = url.searchParams.get('locale');

  /* 기간을 지정하지 않으면 최근 30일. 열어 두면 이벤트가 쌓일수록 한 번의
     조회가 수십만 건을 끌어와 패널이 몇 초씩 멈춘다(20만 건에서 2.3초).
     히트맵·이탈 분석은 최근 흐름을 보는 도구라 30일이면 충분하다. */
  const to = url.searchParams.get('to') ?? today();
  const from = url.searchParams.get('from') ?? daysBefore(to, 30);

  const filters: AnalyticsFilters = {
    pageId: url.searchParams.get('pageId') ?? undefined,
    from,
    to,
    device: device === 'desktop' || device === 'tablet' || device === 'mobile' ? (device as DeviceInfo['type']) : 'all',
    locale: isLocale(locale) ? locale : 'all',
    country: url.searchParams.get('country') ?? 'all',
  };

  try {
    const summary = await summarize(filters);
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '집계 실패' }, { status: 500 });
  }
}
