import { NextResponse } from 'next/server';
import { listPages, savePages, upsertPage } from '@/lib/server/pageStore';
import { sanitizePage } from '@/lib/server/sanitizePage';
import type { PageDocument } from '@/types/schema';

export const dynamic = 'force-dynamic';

/** GET /api/pages — 에디터 부팅 시 전체 페이지 목록 */
export async function GET() {
  const pages = await listPages();
  return NextResponse.json({ pages });
}

/** POST /api/pages — 단일 페이지 생성/수정, 또는 { pages: [...] } 전체 저장 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { page?: PageDocument; pages?: PageDocument[] };

    if (Array.isArray(body.pages)) {
      // 저장 경로가 유일한 신뢰 경계 — 캔버스 HTML 은 여기서 정화된다
      const saved = await savePages(body.pages.map(sanitizePage));
      return NextResponse.json({ pages: saved });
    }
    if (body.page) {
      const saved = await upsertPage(sanitizePage(body.page));
      return NextResponse.json({ page: saved });
    }
    return NextResponse.json({ error: 'page 또는 pages 필드가 필요합니다.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '저장 실패' }, { status: 400 });
  }
}
