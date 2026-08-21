import { NextResponse } from 'next/server';
import { listPages, savePages, upsertPage } from '@/lib/server/pageStore';
import { sanitizePage } from '@/lib/server/sanitizePage';
import { assertAdmin } from '@/lib/server/auth';
import { StorageReadOnlyError } from '@/lib/server/storage';
import type { PageDocument } from '@/types/schema';

export const dynamic = 'force-dynamic';

/** GET /api/pages — 에디터 부팅 시 전체 페이지 목록 */
export async function GET() {
  const pages = await listPages();
  return NextResponse.json({ pages });
}

/** POST /api/pages — 단일 페이지 생성/수정, 또는 { pages: [...] } 전체 저장 */
export async function POST(request: Request) {
  // 공개 배포에서 누구나 페이지를 바꿔 발행하는 것을 막는 유일한 지점
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
    // 저장소가 읽기 전용이면 원인을 그대로 알려준다(조용한 실패 금지)
    const status = err instanceof StorageReadOnlyError ? 503 : 400;
    return NextResponse.json({ error: err instanceof Error ? err.message : '저장 실패' }, { status });
  }
}
