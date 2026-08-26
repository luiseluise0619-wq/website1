'use client';

import React from 'react';

/* =============================================================================
 * ＋ 추가 메뉴
 * -----------------------------------------------------------------------------
 * '새로 만드는 일'이 화면 여기저기 흩어져 있었다 — 새 페이지는 좌측 목록 맨
 * 아래(페이지가 39개면 스크롤 끝), 섹션 추가는 캔버스 하단, HTML 가져오기는
 * 상단 바. 처음 쓰는 사람은 "뭘 더 만들려면 어디를 눌러야 하나"를 매번 새로
 * 찾아야 했다.
 *
 * 만드는 일은 한 버튼 아래 모은다. 원래 자리(캔버스의 [＋ 섹션 추가] 등)는
 * 그대로 둔다 — 손에 익은 경로를 뺏지 않으면서 입구를 하나 더 주는 쪽이,
 * 이미 쓰던 사람에게도 처음 쓰는 사람에게도 낫다.
 * ========================================================================== */

export interface AddMenuItem {
  key: string;
  label: string;
  hint: string;
  icon: string;
  onSelect: () => void;
  disabled?: boolean;
}

export function AddMenu({ items }: { items: AddMenuItem[] }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  /* 바깥을 누르거나 Esc 로 닫는다 — 열어 놓고 다른 일을 하려는데 메뉴가
     화면을 가리면 그게 곧 막다른 골목이 된다. */
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="페이지·섹션을 새로 만들거나 HTML 을 가져옵니다"
        style={{ ...trigger, ...(open ? triggerOpen : null) }}
      >
        ＋ 추가
      </button>

      {open ? (
        <div role="menu" style={sheet}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={{ ...row, opacity: item.disabled ? 0.45 : 1, cursor: item.disabled ? 'not-allowed' : 'pointer' }}
              onMouseEnter={(e) => {
                if (!item.disabled) e.currentTarget.style.background = 'rgba(59,130,246,.16)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{item.icon}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <strong style={{ fontSize: 12.5 }}>{item.label}</strong>
                {/* 이름만으로는 무엇이 일어날지 모르는 항목이 섞여 있다 */}
                <span style={{ fontSize: 11, color: '#8b95a7', lineHeight: 1.5 }}>{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const trigger: React.CSSProperties = {
  padding: '6px 13px',
  borderRadius: 7,
  border: '1px solid #2f6fe4',
  background: '#1d4ed8',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const triggerOpen: React.CSSProperties = { background: '#1e40af' };

const sheet: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 3000,
  minWidth: 268,
  padding: 6,
  borderRadius: 10,
  border: '1px solid #262d3a',
  background: '#151922',
  boxShadow: '0 12px 34px rgba(0,0,0,.5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
  padding: '9px 10px',
  borderRadius: 7,
  border: 0,
  background: 'transparent',
  color: '#e6ebf5',
  textAlign: 'left',
  width: '100%',
};
