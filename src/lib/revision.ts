import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * 낙관적 동시성 — 오래된 저장 막기
 * -----------------------------------------------------------------------------
 * 에디터는 자동 저장이 없고 탭을 여러 개 열 수 있다. 탭 A 에서 저장한 뒤
 * 한참 전에 열어 둔 탭 B 가 저장하면, 조용히 A 의 작업이 사라진다.
 * 그래서 저장 시점에 "내가 들고 있던 판(revision)이 아직 최신인가"를 본다.
 *
 * 판단은 순수 함수로 두어 테스트가 가능하게 한다.
 * ========================================================================== */

export interface RevisionConflict {
  pageId: string;
  path: string;
  title: string;
  /** 저장소에 있는 판 */
  storedRevision: number;
  /** 보내려는 판 */
  incomingRevision: number;
}

/**
 * 들어온 문서가 저장소의 것보다 오래됐는가.
 *
 * baseRevision = 편집을 시작할 때(불러오기·마지막 저장) 클라이언트가 본 판.
 * 이것을 봐야 하는 이유: 탭 두 개가 같은 판 1을 열면 각자 편집으로 판이 2가
 * 되므로, 보내는 판만 비교하면 둘 다 2라서 충돌을 놓친다. 내가 본 판이
 * 저장소의 현재 판보다 낮으면 그 사이에 누군가 저장한 것이다.
 *
 * baseRevision 이 없으면(구버전 클라이언트) 보내는 판으로 비교한다.
 * 같은 판은 허용한다 — 제목·상태만 바꾸는 저장은 revision 을 올리지 않는다.
 */
export function isStaleWrite(
  incoming: PageDocument,
  stored: PageDocument | null | undefined,
  baseRevision?: number,
): boolean {
  if (!stored) return false; // 새 페이지
  const storedRev = Number(stored.revision ?? 0);
  if (!Number.isFinite(storedRev)) return false;

  const mine = Number(baseRevision ?? incoming.revision ?? 0);
  if (!Number.isFinite(mine)) return false;
  return mine < storedRev;
}

export function conflictOf(
  incoming: PageDocument,
  stored: PageDocument,
  baseRevision?: number,
): RevisionConflict {
  return {
    pageId: incoming.id,
    path: stored.path,
    title: stored.title,
    storedRevision: Number(stored.revision ?? 0),
    incomingRevision: Number(baseRevision ?? incoming.revision ?? 0),
  };
}

/** 사용자가 바로 무엇을 해야 하는지 알려 주는 문구 */
export function conflictMessage(conflicts: RevisionConflict[]): string {
  const names = conflicts.map((c) => `'${c.title}'`).join(', ');
  return (
    `${names} 페이지가 다른 곳에서 이미 수정되었습니다(저장된 판 ${conflicts[0].storedRevision}, ` +
    `보낸 판 ${conflicts[0].incomingRevision}). 새로고침해 최신 내용을 불러온 뒤 다시 저장하세요.`
  );
}
