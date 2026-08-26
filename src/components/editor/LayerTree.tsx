'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';

/* =============================================================================
 * 레이어 트리 — 페이지 안의 모든 요소를 목록으로 보여 주고 눌러서 고른다
 * -----------------------------------------------------------------------------
 * 이것이 없어서 생긴 문제들이 길었다. 캔버스 클릭은 '가장 안쪽'만 고른다:
 *   · 캐러셀을 누르면 그 안의 카드가 잡혀 캐러셀 크기를 못 바꾼다
 *   · 카드에 글을 넣으면 이번엔 카드가 잡혀 글에 닿지 못한다
 *   · 빈 컨테이너·섹션처럼 '누를 자리'가 없는 것은 아예 고를 수 없다
 * 그때마다 "왜 안 되지"가 됐고, 고칠 곳은 매번 달랐다. 근본 원인은 하나 —
 * 원하는 요소를 직접 지목할 방법이 없다는 것.
 *
 * 목록은 저장 구조(zones)가 아니라 캔버스 DOM 에서 읽는다. Puck 0.23 은
 * DropZone 데이터를 내부적으로 슬롯으로 정규화해 저장 포맷의 zone 키와
 * 일치하지 않으므로, 실제로 그려진 트리가 언제나 더 정확하다.
 *
 * 이 목록은 Puck 트리 바깥(좌측 패널)에 산다. 그래서 usePuck 을 쓰면 안 된다 —
 * 'usePuck must be used inside <Puck>' 이 던져져 에디터가 통째로 오류 화면이
 * 된다. 선택은 스토어에 요청만 남기고, Puck 안의 조작 레이어가 수행한다.
 * ========================================================================== */

interface LayerNode {
  id: string;
  label: string;
  type: string;
  /** 자유 배치인가 — 선택을 어느 쪽이 쥘지 결정한다 */
  free: boolean;
  depth: number;
  children: LayerNode[];
}

/** 사람이 알아볼 이름 — 관리자가 붙인 이름 > 글 내용 > 블록 종류 */
function labelOf(el: Element, type: string): string {
  const name = el.getAttribute('data-element-name');
  if (name) return name;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text && text.length <= 24) return text;
  if (text) return `${text.slice(0, 22)}…`;
  return type;
}

const ICONS: Record<string, string> = {
  Section: '▤', FreeCanvas: '▦', Container: '▢', Text: 'T', Button: '⬛',
  Image: '🖼', Video: '▶', Shape: '◆', Form: '✉', Icon: '★',
  Carousel: '▷', Divider: '─', Spacer: '␣', Embed: '</>',
};

/** 캔버스 DOM 을 훑어 중첩 구조 그대로 목록을 만든다 */
function readLayers(doc: Document): LayerNode[] {
  const roots: LayerNode[] = [];
  const byEl = new Map<Element, LayerNode>();

  /* querySelectorAll 은 문서 순서로 준다 — 부모가 자식보다 항상 먼저다.
     그래서 한 번만 훑어도 부모를 찾을 수 있다. */
  for (const el of Array.from(doc.querySelectorAll('[data-puck-id]'))) {
    const id = el.getAttribute('data-puck-id');
    if (!id) continue;
    const type = el.getAttribute('data-element-type') ?? '요소';

    let parent: LayerNode | undefined;
    let ancestor = el.parentElement;
    while (ancestor && !parent) {
      parent = byEl.get(ancestor);
      ancestor = ancestor.parentElement;
    }

    const node: LayerNode = {
      id,
      type,
      label: labelOf(el, type),
      free: el.getAttribute('data-free') === 'true',
      depth: parent ? parent.depth + 1 : 0,
      children: [],
    };
    byEl.set(el, node);
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

function flatten(nodes: LayerNode[], collapsed: Set<string>, out: LayerNode[] = []): LayerNode[] {
  for (const node of nodes) {
    out.push(node);
    if (!collapsed.has(node.id)) flatten(node.children, collapsed, out);
  }
  return out;
}

export function LayerTree() {
  const currentId = useEditorStore((s) => s.currentElementId);
  const requestSelect = useEditorStore((s) => s.requestSelect);

  const [layers, setLayers] = React.useState<LayerNode[]>([]);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  /* 캔버스가 바뀔 때마다 다시 읽는다. 캔버스는 이 패널보다 늦게 준비될 수
     있으므로 준비될 때까지 재시도한다(한 번만 읽으면 첫 화면이 빈 채로 굳는다). */
  React.useEffect(() => {
    let stopped = false;
    const read = () => {
      if (stopped) return;
      const doc = document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;
      if (!doc?.body) return;
      setLayers(readLayers(doc));
    };
    read();
    const timer = setInterval(read, 800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  /**
   * 선택.
   * 자유 배치는 우리 조작 레이어가, 흐름 배치는 Puck 이 선택을 쥔다.
   * 둘 다 갱신해야 인스펙터와 크기 손잡이가 같은 것을 가리킨다 —
   * 한쪽만 바꾸면 "패널은 A 를 보여 주는데 손잡이는 B 에 붙는" 상태가 된다.
   */
  const select = React.useCallback(
    (node: LayerNode) => {
      requestSelect(node.id);

      /* 목록에서 골랐으면 캔버스에서도 보여야 한다 — 화면 밖에 있는 것을
         고르고 나면 "골랐는데 아무 일도 없다"로 보인다. */
      const doc = document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;
      doc?.querySelector(`[data-puck-id="${CSS.escape(node.id)}"]`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    },
    [requestSelect],
  );

  const rows = React.useMemo(() => flatten(layers, collapsed), [layers, collapsed]);

  if (!rows.length) {
    return <div style={empty}>캔버스를 불러오는 중…</div>;
  }

  return (
    <div style={wrap}>
      {rows.map((node) => {
        const active = node.id === currentId;
        const hasChildren = node.children.length > 0;
        return (
          <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => select(node)}
              title={`${node.type} · ${node.label}`}
              style={{
                ...row,
                paddingLeft: 8 + node.depth * 12,
                background: active ? 'rgba(59,130,246,.22)' : 'transparent',
                color: active ? '#e6ebf5' : '#c8d0de',
                fontWeight: active ? 700 : 400,
              }}
            >
              {/* 접기 — 깊은 페이지에서 목록이 수십 줄이 되면 못 쓴다 */}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  if (!hasChildren) return;
                  e.stopPropagation();
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                }}
                style={{ width: 12, flexShrink: 0, opacity: hasChildren ? 0.7 : 0, cursor: hasChildren ? 'pointer' : 'default' }}
              >
                {hasChildren ? (collapsed.has(node.id) ? '▸' : '▾') : '·'}
              </span>
              <span style={{ width: 16, flexShrink: 0, textAlign: 'center', opacity: 0.75, fontSize: 11 }}>
                {ICONS[node.type] ?? '·'}
              </span>
              <span style={labelStyle}>{node.label}</span>
              {/* 자유 배치인지 흐름인지 — 크기 조절 방식이 다르므로 보여 준다 */}
              {node.free ? <span style={badge} title="자유 배치">⤧</span> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}

const wrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '6px 4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  width: '100%',
  padding: '5px 8px',
  borderRadius: 5,
  border: 0,
  background: 'transparent',
  color: '#c8d0de',
  fontSize: 11.5,
  textAlign: 'left',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const badge: React.CSSProperties = { fontSize: 9, opacity: 0.6, flexShrink: 0 };

const empty: React.CSSProperties = { padding: 14, fontSize: 11.5, color: '#8b95a7', lineHeight: 1.7 };
