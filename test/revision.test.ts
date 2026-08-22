import { describe, expect, it } from 'vitest';
import { conflictMessage, conflictOf, isStaleWrite } from '@/lib/revision';
import type { PageDocument } from '@/types/schema';

/* 에디터에는 자동 저장이 없고 탭을 여러 개 열 수 있다. 오래된 판이 최신
   작업을 덮어쓰면 조용히 사라진다 — 그 판단을 여기서 고정한다. */

const page = (revision: number, extra: Partial<PageDocument> = {}) =>
  ({ id: 'p1', path: '/x', title: '테스트', revision, ...extra }) as PageDocument;

describe('isStaleWrite', () => {
  it('저장소보다 오래된 판은 막는다', () => {
    expect(isStaleWrite(page(3), page(5))).toBe(true);
  });

  it('같은 판은 허용한다 — 제목·상태만 바꾸는 저장은 revision 을 올리지 않는다', () => {
    expect(isStaleWrite(page(5), page(5))).toBe(false);
  });

  it('더 새로운 판은 당연히 허용', () => {
    expect(isStaleWrite(page(6), page(5))).toBe(false);
  });

  it('저장소에 없는 새 페이지는 통과', () => {
    expect(isStaleWrite(page(1), null)).toBe(false);
    expect(isStaleWrite(page(1), undefined)).toBe(false);
  });

  it('숫자가 아니면 막지 않는다 (저장을 막는 쪽이 더 위험하다)', () => {
    expect(isStaleWrite(page(NaN), page(5))).toBe(false);
    expect(isStaleWrite(page(3), page(NaN))).toBe(false);
    expect(isStaleWrite({ ...page(3), revision: undefined } as unknown as PageDocument, page(5))).toBe(true);
  });
});

describe('isStaleWrite — baseRevision (탭 두 개)', () => {
  /* 두 탭이 같은 판 1을 열면 각자 편집으로 판이 2가 된다. 보내는 판만
     비교하면 둘 다 2라 충돌을 놓치고, 나중에 저장한 탭이 앞의 작업을 덮는다. */
  it('내가 본 판이 저장소보다 낮으면 막는다 — 보내는 판이 같아도', () => {
    expect(isStaleWrite(page(2), page(2), 1)).toBe(true);
  });

  it('내가 본 판이 저장소와 같으면 통과 (아무도 손대지 않았다)', () => {
    expect(isStaleWrite(page(2), page(1), 1)).toBe(false);
  });

  it('baseRevision 이 없으면 보내는 판으로 판단한다', () => {
    expect(isStaleWrite(page(1), page(3))).toBe(true);
    expect(isStaleWrite(page(4), page(3))).toBe(false);
  });
});

describe('conflictOf / conflictMessage', () => {
  it('충돌 정보에 저장소의 제목·경로를 담는다 (사용자는 그 이름으로 페이지를 안다)', () => {
    const c = conflictOf(page(2), page(7, { title: 'BEAUTY', path: '/brand/beauty' }), 2);
    expect(c).toEqual({
      pageId: 'p1',
      path: '/brand/beauty',
      title: 'BEAUTY',
      storedRevision: 7,
      incomingRevision: 2,
    });
  });

  it('무엇을 해야 하는지 알려 준다', () => {
    const msg = conflictMessage([conflictOf(page(2), page(7, { title: 'BEAUTY' }))]);
    expect(msg).toContain('BEAUTY');
    expect(msg).toContain('새로고침');
  });

  it('여러 건이면 이름을 모두 나열한다', () => {
    const msg = conflictMessage([
      conflictOf(page(1), page(3, { title: '홈' })),
      conflictOf(page(1), page(4, { title: 'FOOD' })),
    ]);
    expect(msg).toContain('홈');
    expect(msg).toContain('FOOD');
  });
});
