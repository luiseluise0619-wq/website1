import { NextResponse } from 'next/server';
import { insertEvents } from '@/lib/server/analyticsStore';
import type { AnalyticsBatch } from '@/types/analytics';

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

  let batch: AnalyticsBatch;
  try {
    batch = (await request.json()) as AnalyticsBatch;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(batch?.events) || !batch.events.length) {
    return NextResponse.json({ accepted: 0 });
  }

  // 국가 정보는 클라이언트를 믿지 않고 엣지 헤더에서 읽는다
  const country =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    undefined;

  const accepted = await insertEvents(batch.events.slice(0, MAX_EVENTS), { country: country ?? undefined });
  return NextResponse.json({ accepted }, { status: 202 });
}
