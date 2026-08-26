'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { fetchJson } from '@/lib/fetchJson';
import { NAVIGATION } from '@/data/navigation';
import type { NavNode, PageDocument } from '@/types/schema';

/* =============================================================================
 * 좌측 Page Tree — 네비게이션 IA 와 실제 페이지 문서를 겹쳐 보여준다.
 * 메뉴에는 있는데 페이지가 없으면 '＋ 생성' 으로 즉시 만들 수 있다.
 * ========================================================================== */

export interface PageTreeProps {
  /** 삭제 실패를 화면에 알리기 위해 부모(EditorShell)의 배너를 쓴다 */
  onError?: (message: string) => void;
}

export function PageTree({ onError }: PageTreeProps = {}) {
  const pages = useEditorStore((s) => s.pages);
  const activePageId = useEditorStore((s) => s.activePageId);
  const setActivePage = useEditorStore((s) => s.setActivePage);
  const deletePage = useEditorStore((s) => s.deletePage);
  const duplicatePage = useEditorStore((s) => s.duplicatePage);
  const [filter, setFilter] = React.useState('');
  /** null = 닫힘, undefined preset = 빈 페이지에서 시작 */
  /* 대화상자는 EditorShell 이 그린다.
     여기서 그리면 좌측 목록을 접었을 때([넓게]) 이 컴포넌트 자체가 사라져
     상단 [＋ 추가 → 새 페이지] 가 아무 일도 하지 않고, 게다가 열림 표시가
     남아 있어 목록을 다시 펼치는 순간 대화상자가 저절로 튀어나왔다. */
  const setNewPage = useEditorStore((s) => s.setNewPage);

  const byPath = React.useMemo(() => new Map(pages.map((p) => [p.path, p])), [pages]);

  /* 삭제는 서버까지 지워야 한다. 화면에서만 지우면 새로고침에 되살아나고,
     공개 사이트에서는 계속 서빙된다 — '지웠는데 아직 보인다'가 된다. */
  const handleDelete = async (pageId: string) => {
    try {
      await fetchJson(`/api/pages/${encodeURIComponent(pageId)}`, { method: 'DELETE' });
      deletePage(pageId);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : '페이지를 삭제하지 못했습니다.');
    }
  };

  const matches = (text: string) => !filter || text.toLowerCase().includes(filter.toLowerCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 만들기는 맨 위에 둔다.
          예전에는 목록 맨 아래에 있었는데, 페이지가 39개면 스크롤 끝이라
          "새 페이지를 어디서 만드나"를 매번 찾아야 했다. */}
      <div style={{ padding: '10px 12px 0' }}>
        <button type="button" onClick={() => setNewPage({ preset: null })} style={createBtn}>
          ＋ 새 페이지
        </button>
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ks-edge)' }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="페이지 검색"
          style={{
            width: '100%',
            padding: '7px 9px',
            borderRadius: 6,
            border: '1px solid var(--ks-edge)',
            background: 'var(--ks-panel2)',
            color: 'inherit',
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {NAVIGATION.map((node) => (
          <div key={node.id} style={{ marginBottom: 6 }}>
            <NavRow node={node} page={byPath.get(node.path ?? '')} depth={0} onCreate={(n) => setNewPage({ preset: n })} activePageId={activePageId} onSelect={setActivePage} onDelete={handleDelete} onDuplicate={duplicatePage} visible={matches(node.label)} />
            {node.children?.map((child) =>
              matches(child.label) || matches(node.label) ? (
                <NavRow
                  key={child.id}
                  node={child}
                  page={byPath.get(child.path ?? '')}
                  depth={1}
                  onCreate={(node) => setNewPage({ preset: node })}
                  activePageId={activePageId}
                  onSelect={setActivePage}
                  onDelete={handleDelete} onDuplicate={duplicatePage}
                  visible
                />
              ) : null,
            )}
          </div>
        ))}

        {/* --- IA 에 없는 커스텀 페이지 --- */}
        <CustomPages pages={pages} activePageId={activePageId} onSelect={setActivePage} onDelete={handleDelete} onDuplicate={duplicatePage} />
      </div>

    </div>
  );
}

function NavRow({
  node,
  page,
  depth,
  onCreate,
  activePageId,
  onSelect,
  onDelete,
  onDuplicate,
  visible,
}: {
  node: NavNode;
  page?: PageDocument;
  depth: number;
  onCreate: (node: NavNode) => void;
  activePageId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => string | null;
  visible: boolean;
}) {
  if (!visible) return null;
  const isActive = page?.id === activePageId;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: `5px 8px 5px ${8 + depth * 14}px`,
        borderRadius: 6,
        background: isActive ? 'rgba(59,130,246,.22)' : 'transparent',
        cursor: page ? 'pointer' : 'default',
        fontSize: 12,
      }}
      onClick={() => page && onSelect(page.id)}
    >
      <span style={{ opacity: depth ? 0.5 : 0.9, fontWeight: depth ? 400 : 700, fontSize: depth ? 12 : 11, letterSpacing: depth ? 0 : 0.4 }}>
        {depth ? '·' : ''} {node.label}
      </span>

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {page ? (
          <>
            <StatusDot status={page.status} />
            {/* 국가별 랜딩처럼 같은 구성을 여러 벌 만들 때 처음부터 짜지 않아도 된다 */}
            <button
              type="button"
              title="페이지 복제 (초안으로)"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(page.id);
              }}
              style={{ background: 'none', border: 0, color: 'inherit', opacity: 0.45, cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              ⧉
            </button>
            <button
              type="button"
              title="페이지 삭제"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`'${page.title}' 페이지를 삭제할까요?`)) onDelete(page.id);
              }}
              style={iconBtn}
            >
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            title="이 메뉴의 페이지 생성"
            onClick={(e) => {
              e.stopPropagation();
              onCreate(node);
            }}
            style={{ ...iconBtn, opacity: 0.7 }}
          >
            ＋
          </button>
        )}
      </span>
    </div>
  );
}

function CustomPages({
  pages,
  activePageId,
  onSelect,
  onDelete,
  onDuplicate,
}: {
  pages: PageDocument[];
  activePageId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => string | null;
}) {
  const navPaths = new Set<string>(['/']);
  const walk = (nodes: NavNode[]) => {
    for (const n of nodes) {
      if (n.path) navPaths.add(n.path);
      if (n.children) walk(n.children);
    }
  };
  walk(NAVIGATION);

  const custom = pages.filter((p) => !navPaths.has(p.path));
  const home = pages.find((p) => p.path === '/');

  return (
    <>
      {home ? (
        <div
          onClick={() => onSelect(home.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            marginBottom: 6,
            background: home.id === activePageId ? 'rgba(59,130,246,.22)' : 'transparent',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.4 }}>HOME /</span>
          <span style={{ marginLeft: 'auto' }}>
            <StatusDot status={home.status} />
          </span>
        </div>
      ) : null}

      {custom.length ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, opacity: 0.5, padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            커스텀 페이지
          </div>
          {custom.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                background: p.id === activePageId ? 'rgba(59,130,246,.22)' : 'transparent',
              }}
            >
              <span>{p.title}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                <StatusDot status={p.status} />
                <button
                  type="button"
                  title="페이지 복제 (초안으로)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(p.id);
                  }}
                  style={{ background: 'none', border: 0, color: 'inherit', opacity: 0.45, cursor: 'pointer', fontSize: 12, padding: 0 }}
                >
                  ⧉
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`'${p.title}' 페이지를 삭제할까요?`)) onDelete(p.id);
                  }}
                  style={iconBtn}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function StatusDot({ status }: { status: PageDocument['status'] }) {
  const color = status === 'published' ? '#22c55e' : status === 'draft' ? '#f59e0b' : '#6b7280';
  return <span title={status} style={{ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block' }} />;
}

const iconBtn: React.CSSProperties = {
  background: 'none',
  border: 0,
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  padding: '0 3px',
  opacity: 0.6,
};

const createBtn: React.CSSProperties = {
  margin: 10,
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px dashed var(--ks-edge)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};
