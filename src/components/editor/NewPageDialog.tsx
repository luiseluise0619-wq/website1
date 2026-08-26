'use client';

import React from 'react';
import { PAGE_TEMPLATES, suggestTemplate } from '@/data/templates';
import { normalizePath, slugify } from '@/lib/id';
import type { NavNode } from '@/types/schema';

/* =============================================================================
 * 새 페이지 만들기 — 경로·제목·템플릿을 한 화면에서 정한다.
 * (window.prompt 로는 템플릿을 고를 수 없어 별도 대화상자로 만들었다)
 * ========================================================================== */

export interface NewPageResult {
  path: string;
  title: string;
  navId?: string;
  templateId: string;
}

export interface NewPageDialogProps {
  /** 메뉴에서 만들기를 누른 경우 그 노드 — 경로·제목이 미리 채워진다 */
  preset?: NavNode | null;
  existingPaths: string[];
  onCancel: () => void;
  onCreate: (result: NewPageResult) => void;
}

export function NewPageDialog({ preset, existingPaths, onCancel, onCreate }: NewPageDialogProps) {
  const [title, setTitle] = React.useState(preset?.label ?? '');
  const [path, setPath] = React.useState(preset?.path ?? '');
  const [templateId, setTemplateId] = React.useState(() => suggestTemplate(preset?.id).id);
  const [touchedPath, setTouchedPath] = React.useState(Boolean(preset?.path));

  /* 제목을 입력하면 경로를 따라 만들어 준다 — 직접 고친 뒤에는 건드리지 않는다 */
  React.useEffect(() => {
    if (touchedPath) return;
    setPath(title ? `/${slugify(title)}` : '');
  }, [title, touchedPath]);

  const normalized = path ? normalizePath(path) : '';
  const duplicate = normalized !== '' && existingPaths.includes(normalized);
  const valid = title.trim() !== '' && normalized !== '' && normalized !== '/' && !duplicate;

  /* Esc 로 닫는다.
     배경 클릭만 되고 Esc 가 안 되면, 화면을 덮은 상자 앞에서 습관대로 Esc 를
     누른 사람은 아무 반응이 없어 갇힌 것처럼 느낀다(그 상태에서 뒤의 버튼은
     배경이 가로채 눌리지도 않는다). */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onCreate({ path: normalized, title: title.trim(), navId: preset?.id, templateId });
  };

  return (
    <div style={backdrop} onClick={onCancel} role="dialog" aria-modal="true" aria-label="새 페이지">
      <form style={dialog} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>새 페이지</h2>

        <label style={field}>
          <span style={labelText}>페이지 제목</span>
          <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="예: THAILAND" style={input} />
        </label>

        <label style={field}>
          <span style={labelText}>
            URL 경로
            {duplicate ? <span style={{ color: '#fca5a5', marginLeft: 6 }}>이미 존재하는 경로입니다</span> : null}
          </span>
          <input
            value={path}
            onChange={(e) => {
              setTouchedPath(true);
              setPath(e.target.value);
            }}
            placeholder="/global/thailand"
            style={{ ...input, fontFamily: 'monospace', borderColor: duplicate ? '#ef4444' : undefined }}
          />
        </label>

        <div style={field}>
          <span style={labelText}>템플릿</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {PAGE_TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  /* 자동 점검이 이름 대신 id 로 고를 수 있게 — 이름은 문구가
                     바뀌면 흔들리고, 카드가 늘면 순서로도 못 짚는다. */
                  data-template-id={t.id}
                  aria-pressed={active}
                  onClick={() => setTemplateId(t.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${active ? '#3b82f6' : 'var(--ks-edge)'}`,
                    background: active ? 'rgba(59,130,246,.16)' : 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{t.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>{t.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} style={btn}>
            취소
          </button>
          <button type="submit" disabled={!valid} style={{ ...btn, background: '#3b82f6', border: 0, opacity: valid ? 1 : 0.5 }}>
            만들기
          </button>
        </div>
      </form>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.55)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 500,
  padding: 24,
};

const dialog: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: 'var(--ks-panel)',
  color: '#e6ebf5',
  border: '1px solid var(--ks-edge)',
  borderRadius: 14,
  padding: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  maxHeight: '85vh',
  overflowY: 'auto',
};

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelText: React.CSSProperties = { fontSize: 12, fontWeight: 600 };
const input: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 7,
  border: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel2)',
  color: 'inherit',
  fontSize: 13,
};
const btn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 7,
  border: '1px solid var(--ks-edge)',
  background: 'transparent',
  color: '#fff',
  fontSize: 13,
  cursor: 'pointer',
};
