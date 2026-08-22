import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/store/editorStore';
import type { PageDocument } from '@/types/schema';

/* 에디터 상태는 관리자가 하는 모든 행동의 기록이다. 복제가 얕으면 사본을
   고칠 때 원본까지 바뀌고, 경로가 겹치면 저장이 통째로 거부된다. */

function page(id: string, path: string): PageDocument {
  return {
    id,
    path,
    title: id,
    status: 'published',
    revision: 4,
    sourceLocale: 'ko',
    seo: { title: { ko: id } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    canvasWidth: 1440,
    content: {
      root: { props: {} },
      content: [{ type: 'Text', props: { id: 'a', html: { ko: '원본' } } }],
      zones: { 'a:layers': [{ type: 'Text', props: { id: 'b', html: { ko: '중첩' } } }] },
    },
  } as unknown as PageDocument;
}

beforeEach(() => {
  useEditorStore.getState().loadPages([page('p1', '/brand/beauty'), page('p2', '/brand/food')]);
});

describe('duplicatePage', () => {
  it('사본을 만들고 바로 편집 대상으로 삼는다', () => {
    const store = useEditorStore.getState();
    const id = store.duplicatePage('p1');
    expect(id).toBeTruthy();

    const next = useEditorStore.getState();
    expect(next.pages).toHaveLength(3);
    expect(next.activePageId).toBe(id);
    expect(next.dirty).toBe(true);
  });

  it('사본은 초안이고 개정 번호가 초기화된다 (복제하자마자 공개되면 사고다)', () => {
    const id = useEditorStore.getState().duplicatePage('p1');
    const copy = useEditorStore.getState().pages.find((p) => p.id === id)!;
    expect(copy.status).toBe('draft');
    expect(copy.revision).toBe(1);
    expect(copy.title).toBe('p1 사본');
  });

  it('경로가 겹치지 않는다 — 이미 사본이 있으면 번호를 올린다', () => {
    const first = useEditorStore.getState().duplicatePage('p1');
    expect(useEditorStore.getState().pages.find((p) => p.id === first)!.path).toBe('/brand/beauty-copy');

    const second = useEditorStore.getState().duplicatePage('p1');
    expect(useEditorStore.getState().pages.find((p) => p.id === second)!.path).toBe('/brand/beauty-copy-2');
  });

  it('본문을 깊게 복사한다 — 사본을 고쳐도 원본은 그대로', () => {
    const id = useEditorStore.getState().duplicatePage('p1')!;
    const copy = useEditorStore.getState().pages.find((p) => p.id === id)!;

    (copy.content.content[0].props.html as Record<string, string>).ko = '사본만 수정';
    (copy.content.zones!['a:layers'][0].props.html as Record<string, string>).ko = '중첩도 수정';

    const original = useEditorStore.getState().pages.find((p) => p.id === 'p1')!;
    expect((original.content.content[0].props.html as Record<string, string>).ko).toBe('원본');
    expect((original.content.zones!['a:layers'][0].props.html as Record<string, string>).ko).toBe('중첩');
  });

  it('없는 페이지는 null 이고 목록을 건드리지 않는다', () => {
    expect(useEditorStore.getState().duplicatePage('없음')).toBeNull();
    expect(useEditorStore.getState().pages).toHaveLength(2);
  });
});

describe('deletePage', () => {
  it('지운 페이지가 편집 중이었다면 다른 페이지로 옮겨 간다', () => {
    useEditorStore.getState().setActivePage('p2');
    useEditorStore.getState().deletePage('p2');
    const s = useEditorStore.getState();
    expect(s.pages.map((p) => p.id)).toEqual(['p1']);
    expect(s.activePageId).toBe('p1');
  });
});
