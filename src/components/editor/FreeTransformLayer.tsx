'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { usePuck } from '@puckeditor/core';
import { useEditorStore } from '@/store/editorStore';
import { puckConfig } from '@/puck/config';
import type { FreePlacement } from '@/types/schema';

/* =============================================================================
 * 자유 배치 조작 레이어 — 드래그 이동 / 8방향 리사이즈
 * -----------------------------------------------------------------------------
 * 왜 캔버스 "밖"에서 그리는가:
 *   1) Puck 은 캔버스를 iframe 에 렌더한다. React 18 은 이벤트를 트리 루트(부모
 *      문서)에 위임하므로, iframe 안에서 발생한 이벤트는 React 핸들러에 도달하지
 *      않는다.
 *   2) Puck 은 각 컴포넌트 위에 선택용 오버레이를 덮는다. 요소에 네이티브
 *      리스너를 걸어도 그 오버레이가 포인터를 먼저 가져간다.
 * 그래서 부모 문서에 오버레이를 띄우고, 좌표만 환산해 조작한다.
 *
 * 좌표 환산: iframe 내부 rect 는 배율이 적용되지 않은 값이므로
 *   화면좌표 = 내부좌표 × scale + iframe오프셋
 * 반대로 드래그 델타는 캔버스 단위로 되돌리기 위해 scale 로 나눈다.
 * ========================================================================== */

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: Array<{ key: Handle; cursor: string; style: React.CSSProperties }> = [
  { key: 'nw', cursor: 'nwse-resize', style: { top: -5, left: -5 } },
  { key: 'n', cursor: 'ns-resize', style: { top: -5, left: '50%', marginLeft: -5 } },
  { key: 'ne', cursor: 'nesw-resize', style: { top: -5, right: -5 } },
  { key: 'e', cursor: 'ew-resize', style: { top: '50%', right: -5, marginTop: -5 } },
  { key: 'se', cursor: 'nwse-resize', style: { bottom: -5, right: -5 } },
  { key: 's', cursor: 'ns-resize', style: { bottom: -5, left: '50%', marginLeft: -5 } },
  { key: 'sw', cursor: 'nesw-resize', style: { bottom: -5, left: -5 } },
  { key: 'w', cursor: 'ew-resize', style: { top: '50%', left: -5, marginTop: -5 } },
];

const MIN_SIZE = 12;
const SNAP = 1;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  scale: number;
}

/** 자유 캔버스 영역 — 이 안에서는 우리가 선택을 처리한다 */
interface CanvasRegion {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** iframe 과 화면 좌표를 잇는 변환값 */
interface FrameGeometry {
  frame: HTMLIFrameElement;
  doc: Document;
  scale: number;
  offsetX: number;
  offsetY: number;
}

function readGeometry(container: HTMLElement | null): FrameGeometry | null {
  const frame = document.querySelector<HTMLIFrameElement>('iframe');
  const doc = frame?.contentDocument;
  if (!frame || !doc) return null;
  const frameRect = frame.getBoundingClientRect();
  const containerRect = container?.getBoundingClientRect();
  return {
    frame,
    doc,
    scale: frame.offsetWidth ? frameRect.width / frame.offsetWidth : 1,
    offsetX: frameRect.left - (containerRect?.left ?? 0),
    offsetY: frameRect.top - (containerRect?.top ?? 0),
  };
}

export function FreeTransformLayer({ containerRef }: { containerRef: React.RefObject<HTMLElement> }) {
  const { dispatch, getSelectorForId, getItemById, selectedItem, appState } = usePuck();
  /* 자체 선택 상태.
     Puck 의 setUi 는 중첩 DropZone 안의 항목을 선택 대상으로 받아주지 않는다
     (getSelectorForId 는 selector 를 돌려주지만 itemSelector 로 넣으면 null 로
     정규화된다). 자유 배치 요소의 선택은 이 레이어가 직접 관리한다. */
  /* 인스펙터가 같은 선택을 봐야 하므로 스토어에 둔다 */
  const pickedId = useEditorStore((s) => s.pickedElementId);
  const setPickedId = useEditorStore((s) => s.setPickedElement);
  const [box, setBox] = React.useState<Box | null>(null);
  const [regions, setRegions] = React.useState<CanvasRegion[]>([]);
  const [mode, setMode] = React.useState<'idle' | 'move' | Handle>('idle');
  /* containerRef 는 ref 라 값이 채워져도 리렌더가 일어나지 않는다 —
     첫 페인트 뒤 한 번 다시 그려 포털 대상을 잡는다. */
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (containerRef.current) force();
  }, [containerRef]);

  /* 선택 항목은 Puck 이 직접 알려주는 값을 쓴다.
     appState.data.zones 를 직접 뒤지면 안 된다 — Puck 0.23 은 DropZone 데이터를
     내부적으로 슬롯 구조로 정규화해서, 저장 포맷의 zone 키와 일치하지 않는다. */
  const selected = React.useMemo(() => {
    /* 우리가 고른 자유 배치 요소가 우선. 없으면 Puck 의 선택을 따른다. */
    if (pickedId) {
      const item = getItemById(pickedId);
      const props = item?.props as { id?: string; placement?: FreePlacement } | undefined;
      if (props?.id) return { id: props.id, placement: props.placement };
    }
    const props = selectedItem?.props as { id?: string; placement?: FreePlacement } | undefined;
    if (!props?.id) return null;
    return { id: props.id, placement: props.placement };
  }, [pickedId, selectedItem, getItemById, appState.data]);

  /** iframe 안의 위치들을 화면 좌표로 환산 */
  const measure = React.useCallback(() => {
    const geo = readGeometry(containerRef.current);
    if (!geo) {
      setBox(null);
      setRegions([]);
      return;
    }
    const { doc, scale, offsetX, offsetY } = geo;
    const toScreen = (r: DOMRect) => ({
      left: r.left * scale + offsetX,
      top: r.top * scale + offsetY,
      width: r.width * scale,
      height: r.height * scale,
    });

    /* 자유 캔버스 영역 — 이 안의 클릭은 우리가 가로채 선택을 처리한다 */
    setRegions(
      Array.from(doc.querySelectorAll<HTMLElement>('[data-free-canvas="true"]')).map((el) =>
        toScreen(el.getBoundingClientRect()),
      ),
    );

    const node = selected
      ? doc.querySelector<HTMLElement>(`[data-puck-id="${CSS.escape(selected.id)}"][data-free="true"]`)
      : null;
    setBox(node ? { ...toScreen(node.getBoundingClientRect()), scale } : null);
  }, [selected, containerRef]);

  /* 선택 변경·스크롤·리사이즈·캔버스 변경 시 다시 잰다.
     캔버스 iframe 은 이 컴포넌트보다 늦게 준비되므로, 준비될 때까지 재시도한다.
     (한 번만 재고 끝내면 첫 렌더에서 빈 화면으로 굳어버린다) */
  React.useEffect(() => {
    let stopped = false;
    let mo: MutationObserver | null = null;
    let observedDoc: Document | null = null;
    const rerun = () => {
      if (!stopped) requestAnimationFrame(measure);
    };

    const attach = () => {
      if (stopped) return;
      measure();
      const doc = document.querySelector<HTMLIFrameElement>('iframe')?.contentDocument;
      if (!doc?.body || doc === observedDoc) return;

      mo?.disconnect();
      observedDoc?.defaultView?.removeEventListener('scroll', rerun);
      observedDoc = doc;
      mo = new MutationObserver(rerun);
      mo.observe(doc.body, { subtree: true, attributes: true, childList: true });
      doc.defaultView?.addEventListener('scroll', rerun, { passive: true });
    };

    attach();
    /* iframe 이 교체되거나(페이지 전환) 늦게 로드되는 경우를 모두 흡수한다 */
    const timer = setInterval(attach, 700);
    window.addEventListener('resize', rerun);

    return () => {
      stopped = true;
      clearInterval(timer);
      mo?.disconnect();
      observedDoc?.defaultView?.removeEventListener('scroll', rerun);
      window.removeEventListener('resize', rerun);
    };
  }, [measure]);

  /** placement 갱신을 Puck 상태에 반영 */
  const commitFor = React.useCallback(
    (id: string, next: Partial<FreePlacement>) => {
      const selector = getSelectorForId(id);
      const item = getItemById(id);
      if (!selector || !item) return;

      dispatch({
        type: 'replace',
        destinationIndex: selector.index,
        destinationZone: selector.zone,
        data: {
          ...item,
          props: {
            ...item.props,
            placement: { ...(item.props as { placement?: FreePlacement }).placement, ...next },
          },
        },
      });
    },
    [dispatch, getSelectorForId, getItemById],
  );

  const commit = React.useCallback(
    (next: Partial<FreePlacement>) => {
      if (selected) commitFor(selected.id, next);
    },
    [selected, commitFor],
  );

  /**
   * 자유 캔버스 안의 클릭을 우리가 처리한다.
   * Puck 의 히트 테스트는 흐름 배치를 전제해서, 절대 좌표로 놓인 자식은
   * 언제나 부모 캔버스가 대신 선택된다. 그래서 좌표를 iframe 내부계로 되돌려
   * elementFromPoint 로 직접 찾고 선택을 지정한다.
   */
  const selectAtPoint = React.useCallback(
    (clientX: number, clientY: number): string | null => {
      const geo = readGeometry(containerRef.current);
      if (!geo) return null;
      const frameRect = geo.frame.getBoundingClientRect();
      const ix = (clientX - frameRect.left) / geo.scale;
      const iy = (clientY - frameRect.top) / geo.scale;

      /* DOM 히트 테스트는 쓸 수 없다: Puck 은 캔버스 안의 컴포넌트에
         pointer-events:none 을 걸어 두기 때문에(자체 오버레이가 상호작용을 담당)
         elementFromPoint 가 우리 요소를 절대 돌려주지 않는다.
         그래서 자유 배치 요소들의 사각형을 직접 재서 기하학적으로 판정한다. */
      const candidates = Array.from(
        geo.doc.querySelectorAll<HTMLElement>('[data-free="true"][data-puck-id]'),
      )
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => ix >= rect.left && ix <= rect.right && iy >= rect.top && iy <= rect.bottom);

      if (!candidates.length) return null;

      /* 겹쳐 있으면 z-index 가 큰 것, 같으면 나중에 그려진 것이 위에 있다 */
      const top = candidates.reduce((best, current) => {
        const z = (el: HTMLElement) => Number(geo.doc.defaultView?.getComputedStyle(el).zIndex) || 0;
        return z(current.node) >= z(best.node) ? current : best;
      });

      const id = top.node.dataset.puckId;
      if (!id) return null;

      setPickedId(id);
      /* Puck 인스펙터도 따라오면 좋지만, 중첩 항목은 무시될 수 있다 —
         실패해도 우리 레이어의 선택은 유지된다. */
      const selector = getSelectorForId(id);
      if (selector) {
        dispatch({ type: 'setUi', ui: { itemSelector: { index: selector.index, zone: selector.zone } } });
      }
      return id;
    },
    [containerRef, dispatch, getSelectorForId],
  );

  /* 드래그 — 부모 문서에서 발생하므로 React 이벤트로 충분하다.
     targetId 를 넘길 수 있게 한 이유: 선택과 동시에 드래그를 시작할 때는
     아직 selected 상태가 갱신되기 전이다. */
  const runDrag = (
    kind: 'move' | Handle,
    e: React.PointerEvent,
    target: { id: string; placement?: FreePlacement },
    startBox: { width: number; height: number; scale: number },
  ) => {
    setMode(kind);

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = {
      x: Number(target.placement?.x ?? 0),
      y: Number(target.placement?.y ?? 0),
      width: startBox.width / startBox.scale,
      height: startBox.height / startBox.scale,
    };
    const scale = startBox.scale || 1;
    const commitTo = (next: Partial<FreePlacement>) => commitFor(target.id, next);
    const round = (v: number) => (SNAP > 1 ? Math.round(v / SNAP) * SNAP : Math.round(v));

    const onMove = (ev: PointerEvent) => {
      // 화면상의 이동량을 캔버스 단위로 되돌린다
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;

      if (kind === 'move') {
        commitTo({ x: round(origin.x + dx), y: round(origin.y + dy) });
        return;
      }

      /* 왼쪽·위쪽 핸들은 크기와 함께 좌표도 옮겨야 반대편 모서리가 고정돼 보인다 */
      const next: Partial<FreePlacement> = {};
      if (kind.includes('e')) next.width = Math.max(MIN_SIZE, round(origin.width + dx));
      if (kind.includes('s')) next.height = Math.max(MIN_SIZE, round(origin.height + dy));
      if (kind.includes('w')) {
        const width = Math.max(MIN_SIZE, round(origin.width - dx));
        next.width = width;
        next.x = round(origin.x + (origin.width - width));
      }
      if (kind.includes('n')) {
        const height = Math.max(MIN_SIZE, round(origin.height - dy));
        next.height = height;
        next.y = round(origin.y + (origin.height - height));
      }
      commitTo(next);
    };

    const onUp = () => {
      setMode('idle');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** 선택 박스/핸들에서 시작하는 드래그 */
  const start = (kind: 'move' | Handle) => (e: React.PointerEvent) => {
    if (!selected || !box) return;
    e.preventDefault();
    e.stopPropagation();
    runDrag(kind, e, selected, box);
  };

  /** 캔버스에서 요소를 처음 누른 순간 — 선택과 드래그를 한 번에 시작한다 */
  const beginDrag = (e: React.PointerEvent, id: string) => {
    const geo = readGeometry(containerRef.current);
    const node = geo?.doc.querySelector<HTMLElement>(`[data-puck-id="${CSS.escape(id)}"][data-free="true"]`);
    if (!geo || !node) return;
    const item = getItemById(id);
    const placement = (item?.props as { placement?: FreePlacement } | undefined)?.placement;
    const rect = node.getBoundingClientRect();
    runDrag('move', e, { id, placement }, {
      width: rect.width * geo.scale,
      height: rect.height * geo.scale,
      scale: geo.scale,
    });
  };

  /* 키보드 조작 — 방향키 미세 이동, 삭제, 복제, 선택 해제.
     입력란에 포커스가 있을 때는 가로채지 않는다. */
  React.useEffect(() => {
    if (!selected) return;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      if (e.key === 'Escape') {
        setPickedId(null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selector = getSelectorForId(selected.id);
        if (!selector) return;
        e.preventDefault();
        dispatch({ type: 'remove', index: selector.index, zone: selector.zone });
        setPickedId(null);
        return;
      }

      /* Ctrl/Cmd+D 복제 — 브라우저 북마크 단축키를 대신 차지한다 */
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        const selector = getSelectorForId(selected.id);
        if (!selector) return;
        e.preventDefault();
        dispatch({ type: 'duplicate', sourceIndex: selector.index, sourceZone: selector.zone });
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const delta = map[e.key];
      if (!delta) return;
      e.preventDefault();
      commit({
        x: Number(selected.placement?.x ?? 0) + delta[0],
        y: Number(selected.placement?.y ?? 0) + delta[1],
      });
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, commit, dispatch, getSelectorForId, setPickedId]);

  /* 좌표를 containerRef 기준으로 계산하므로, 실제 DOM 도 그 컨테이너 안에 있어야
     한다. Puck 내부 어딘가에 렌더되면 offsetParent 가 달라져 위치가 어긋난다. */
  const host = containerRef.current;
  if (!host) return null;

  /**
   * 섹션 추가.
   * 블록 목록에서 끌어오는 방법만 있으면 "한 칸 더 만들기"가 매번 드래그라
   * 번거롭다. 캔버스 하단 버튼으로 섹션과 그 안의 자유 캔버스를 한 번에 넣는다.
   */
  const addSection = () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const sectionId = `section-${suffix}`;
    const canvasId = `canvas-${suffix}`;

    /* insert 액션으로는 중첩 존에 넣을 수 없다 — 런타임에 등록되지 않은 존을
       대상으로 하면 조용히 무시된다(setUi 로 중첩 항목을 선택하지 못하는 것과
       같은 제약). 그래서 문서를 통째로 다시 써서 섹션과 그 안의 자유 캔버스를
       한 번에 만든다. 시드 데이터가 만들어지는 방식과 동일하다. */
    const sectionDefaults = puckConfig.components.Section?.defaultProps ?? {};
    const canvasDefaults = puckConfig.components.FreeCanvas?.defaultProps ?? {};

    dispatch({
      type: 'setData',
      data: (prev) => ({
        ...prev,
        content: [
          ...(prev.content ?? []),
          { type: 'Section', props: { ...sectionDefaults, id: sectionId, name: '새 섹션' } },
        ],
        zones: {
          ...(prev.zones ?? {}),
          [`${sectionId}:content`]: [
            { type: 'FreeCanvas', props: { ...canvasDefaults, id: canvasId, name: '자유 캔버스' } },
          ],
          [`${canvasId}:layers`]: [],
        },
      }),
    });

    /* 새 섹션이 그려진 뒤 그쪽으로 시선을 옮긴다 */
    let attempts = 0;
    const reveal = () => {
      const el = document
        .querySelector<HTMLIFrameElement>('iframe')
        ?.contentDocument?.querySelector(`[data-puck-id="${sectionId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else if (attempts++ < 20) setTimeout(reveal, 100);
    };
    setTimeout(reveal, 80);
  };

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2000 }}>
      {/* 캔버스 어디서든 닿는 섹션 추가 버튼 */}
      <button
        type="button"
        onClick={addSection}
        title="페이지 맨 아래에 섹션을 추가합니다"
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '9px 16px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,.18)',
          background: 'rgba(13,15,20,.9)',
          color: '#e6ebf5',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          pointerEvents: 'auto',
          boxShadow: '0 6px 20px rgba(0,0,0,.35)',
          backdropFilter: 'blur(6px)',
        }}
      >
        ＋ 섹션 추가
      </button>
      {/* 자유 캔버스 영역: 클릭을 받아 우리가 선택을 결정한다 */}
      {regions.map((r, i) => (
        <div
          key={i}
          onPointerDown={(e) => {
            const id = selectAtPoint(e.clientX, e.clientY);
            if (!id) {
              // 빈 곳 — 선택을 풀고 Puck 기본 동작(캔버스 선택)에 맡긴다
              setPickedId(null);
              return;
            }
            /* Puck 은 컴포넌트 밖 클릭을 선택 해제로 해석한다. 우리 오버레이는
               캔버스 밖이라 그대로 두면 방금 지정한 선택이 즉시 풀린다. */
            e.preventDefault();
            e.stopPropagation();
            beginDrag(e, id);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            pointerEvents: 'auto',
          }}
        />
      ))}

      {selected && box ? (
      <div
        onPointerDown={start('move')}
        style={{
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
          border: '2px solid #3b82f6',
          borderRadius: 2,
          cursor: mode === 'move' ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          background: mode === 'move' ? 'rgba(59,130,246,.08)' : 'transparent',
        }}
      >
        <span style={badge}>
          {Math.round(Number(selected.placement?.x ?? 0))}, {Math.round(Number(selected.placement?.y ?? 0))}
          <span style={{ opacity: 0.75, fontWeight: 500, marginLeft: 6 }}>
            방향키 이동 · Del 삭제 · Esc 해제
          </span>
        </span>

        {HANDLES.map((h) => (
          <span
            key={h.key}
            onPointerDown={start(h.key)}
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: '#fff',
              border: '1.5px solid #3b82f6',
              boxShadow: '0 1px 3px rgba(0,0,0,.3)',
              cursor: h.cursor,
              pointerEvents: 'auto',
              ...h.style,
            }}
          />
        ))}
      </div>
      ) : null}
    </div>,
    host,
  );
}

const badge: React.CSSProperties = {
  position: 'absolute',
  top: -22,
  left: 0,
  background: '#3b82f6',
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: 4,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};
