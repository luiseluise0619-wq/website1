'use client';

import React from 'react';
import { usePuck } from '@puckeditor/core';
import { useEditorStore } from '@/store/editorStore';

/* =============================================================================
 * 선택 경로 (빵부스러기)
 * -----------------------------------------------------------------------------
 * 캔버스 클릭은 '가장 안쪽'을 고른다. 그래서 캐러셀을 누르면 그 안의 카드가
 * 잡히고, 카드 안에 글을 넣으면 이번엔 카드가 잡힌다 — 정작 바꾸고 싶은
 * 것(캐러셀 자체, 또는 그 안의 글)에 닿을 방법이 없었다. 우측 패널은 계속
 * 엉뚱한 것을 가리키고, 크기 손잡이도 엉뚱한 것에 붙는다.
 *
 * 지금 고른 것의 조상들을 늘어놓고 눌러서 올라갈 수 있게 한다.
 * 겹쳐 있는 구조에서 '무엇을 고르고 있는지'를 눈으로 보여 주는 일도 겸한다.
 *
 * 조상 목록은 저장 구조(zones)가 아니라 캔버스 DOM 에서 읽는다. Puck 0.23 은
 * DropZone 데이터를 내부적으로 슬롯으로 정규화해서 저장 포맷의 zone 키와
 * 일치하지 않기 때문에, 화면에 실제로 그려진 트리가 더 믿을 만하다.
 * ========================================================================== */

interface Crumb {
  id: string;
  label: string;
}

/** 사람이 알아볼 이름 — 관리자가 붙인 이름 > 블록 종류 */
function labelOf(el: Element): string {
  const name = el.getAttribute('data-element-name');
  const type = el.getAttribute('data-element-type') ?? '요소';
  return name ? `${name}` : type;
}

export function SelectionPath() {
  const pickedId = useEditorStore((s) => s.pickedElementId);
  const setPickedId = useEditorStore((s) => s.setPickedElement);
  const { dispatch, getSelectorForId, selectedItem, appState } = usePuck();

  const currentId =
    pickedId ?? ((selectedItem?.props as { id?: string } | undefined)?.id ?? null);

  const [crumbs, setCrumbs] = React.useState<Crumb[]>([]);

  /* 선택이 바뀔 때, 그리고 캔버스가 다시 그려질 때 경로를 다시 읽는다 */
  React.useEffect(() => {
    if (!currentId) {
      setCrumbs([]);
      return;
    }
    const read = () => {
      const doc = document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;
      const node = doc?.querySelector(`[data-puck-id="${CSS.escape(currentId)}"]`);
      if (!node) return;

      const chain: Crumb[] = [];
      let el: Element | null = node;
      while (el) {
        const id = el.getAttribute('data-puck-id');
        if (id) chain.unshift({ id, label: labelOf(el) });
        el = el.parentElement;
      }
      setCrumbs(chain);
    };
    read();
    /* 캔버스는 우리보다 늦게 준비될 수 있다 — 한 번 더 시도한다 */
    const timer = setTimeout(read, 300);
    return () => clearTimeout(timer);
  }, [currentId, appState.data]);

  if (crumbs.length < 2) return null;

  const select = (id: string) => {
    /* 자유 배치 요소는 우리 레이어가 선택을 쥐고, 흐름 배치는 Puck 이 쥔다.
       둘 다 갱신해야 인스펙터와 크기 손잡이가 같은 것을 가리킨다. */
    const doc = document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;
    const node = doc?.querySelector<HTMLElement>(`[data-puck-id="${CSS.escape(id)}"]`);
    setPickedId(node?.dataset.free === 'true' ? id : null);

    const selector = getSelectorForId(id);
    if (selector) {
      dispatch({ type: 'setUi', ui: { itemSelector: { index: selector.index, zone: selector.zone } } });
    }
  };

  return (
    <div style={bar}>
      <span style={{ color: '#9aa4b5', fontSize: 10.5, flexShrink: 0 }}>선택</span>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={`${crumb.id}:${i}`}>
            {i > 0 ? <span style={{ color: '#4b5563', flexShrink: 0 }}>›</span> : null}
            <button
              type="button"
              disabled={isLast}
              onClick={() => select(crumb.id)}
              title={isLast ? '지금 고른 요소' : `${crumb.label} 선택`}
              style={{ ...crumbBtn, ...(isLast ? crumbCurrent : null) }}
            >
              {crumb.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  padding: '7px 10px',
  borderBottom: '1px solid var(--puck-color-grey-09, #dcdcdc)',
  background: 'var(--puck-color-grey-12, #fafafa)',
  fontSize: 11,
};

const crumbBtn: React.CSSProperties = {
  padding: '2px 7px',
  borderRadius: 5,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--puck-color-azure-04, #0158ad)',
  fontSize: 11,
  cursor: 'pointer',
  maxWidth: 130,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const crumbCurrent: React.CSSProperties = {
  background: 'var(--puck-color-azure-10, #e7eef7)',
  borderColor: 'var(--puck-color-azure-08, #abc7e5)',
  color: 'var(--puck-color-black, #111827)',
  fontWeight: 700,
  cursor: 'default',
};
