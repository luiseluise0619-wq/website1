import { NextResponse } from 'next/server';
import { insertEvents } from '@/lib/server/analyticsStore';
import { analyticsBatchSchema } from '@/lib/schemas';
import type { AnalyticsEvent } from '@/types/analytics';

export const dynamic = 'force-dynamic';

/** sendBeacon 은 최대 64KB 를 보낸다 — 그보다 큰 본문은 조작으로 간주 */
const MAX_BODY = 256 * 1024;
const MAX_EVENTS = 200;

/**
 * POST /api/analytics/collect
 * 브라우저의 useCanvasAnalytics 가 배치로 보내는 이벤트를 적재한다.
 * sendBeacon 응답은 무시되므로 항상 202 로 빠르게 끊는다.
 */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  const parsed = analyticsBatchSchema.safeParse(await request.json().catch(() => null));
  /* 수집은 최선 노력(best-effort)이다. 형식이 틀린 배치 때문에 방문자 브라우저에
     오류를 돌려줄 이유가 없으므로 조용히 0건 처리한다. */
  if (!parsed.success || !parsed.data.events.length) {
    return NextResponse.json({ accepted: 0 });
  }
  const batch = parsed.data;

  // 국가 정보는 클라이언트를 믿지 않고 엣지 헤더에서 읽는다
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    undefined;

  const accepted = await insertEvents(
    batch.events.slice(0, MAX_EVENTS) as unknown as AnalyticsEvent[],
    { country: country ?? undefined },
  );
  return NextResponse.json({ accepted }, { status: 202 });
}
