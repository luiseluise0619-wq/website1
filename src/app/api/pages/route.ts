import { NextResponse } from 'next/server';
import { getPageById, listPages, savePages, upsertPage } from '@/lib/server/pageStore';
import { conflictMessage, conflictOf, isStaleWrite, type RevisionConflict } from '@/lib/revision';
import { sanitizePage } from '@/lib/server/sanitizePage';
import { assertAdmin } from '@/lib/server/auth';
import { StorageReadOnlyError } from '@/lib/server/storage';
import type { PageDocument } from '@/types/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pages — 전체 페이지 목록(관리자 전용)
 * 초안·보관 페이지까지 본문째로 돌려주므로 공개 사이트가 숨기는 내용이 그대로 새어
 * 나간다. 에디터는 서버 컴포넌트에서 listPages() 를 직접 읽으므로 이 라우트를
 * 잠가도 화면은 그대로 동작한다.
 */
export async function GET() {
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const pages = await listPages();
  return NextResponse.json({ pages });
}

/** POST /api/pages — 단일 페이지 생성/수정, 또는 { pages: [...] } 전체 저장 */
export async function POST(request: Request) {
  // 공개 배포에서 누구나 페이지를 바꿔 발행하는 것을 막는 유일한 지점
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as {
      page?: PageDocument;
      pages?: PageDocument[];
      /** 클라이언트가 편집을 시작할 때 본 판 { pageId: revision } */
      base?: Record<string, number>;
    };

    const incoming = Array.isArray(body.pages) ? body.pages : body.page ? [body.page] : [];

    /* 오래된 판이 최신 작업을 덮어쓰지 않게 막는다(탭 두 개, 관리자 두 명).
       한 건이라도 충돌하면 아무것도 저장하지 않는다 — 절반만 저장되면
       어느 쪽이 최신인지 아무도 알 수 없게 된다. */
    const conflicts: RevisionConflict[] = [];
    for (const page of incoming) {
      const stored = await getPageById(page.id);
      const base = body.base?.[page.id];
      if (stored && isStaleWrite(page, stored, base)) conflicts.push(conflictOf(page, stored, base));
    }
    if (conflicts.length) {
      return NextResponse.json({ error: conflictMessage(conflicts), conflicts }, { status: 409 });
    }

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
