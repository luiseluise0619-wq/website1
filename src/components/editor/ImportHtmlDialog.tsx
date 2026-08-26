'use client';

import React from 'react';
import { appendImported, htmlToPage } from '@/lib/importHtml';
import { puckConfig } from '@/puck/config';
import type { LocaleCode, PuckPageData } from '@/types/schema';

/* =============================================================================
 * HTML 가져오기 대화상자
 * -----------------------------------------------------------------------------
 * 이미 있는 페이지(내보낸 산출물, 남이 만든 랜딩페이지)를 캔버스로 들여와
 * 이어서 고치고 덧붙이기 위한 입구.
 *
 * 붙여넣기와 파일 열기 두 가지를 받는다 — 사람이 갖고 있는 형태가 둘 중
 * 하나이기 때문이다. 들여오기 전에 '무엇이 블록이 되고 무엇이 원본으로
 * 남는지'를 먼저 보여 준다. 문서를 갈아엎는 동작이라, 누른 뒤에 알게 되면
 * 되돌리는 수밖에 없다.
 * ========================================================================== */

type Mode = 'append' | 'replace';

export function ImportHtmlDialog({
  locale,
  getCurrentData,
  onApply,
  onClose,
}: {
  /** 가져온 문구의 언어 = 번역 원문 */
  locale: LocaleCode;
  getCurrentData: () => PuckPageData;
  onApply: (data: PuckPageData) => void;
  onClose: () => void;
}) {
  const [html, setHtml] = React.useState('');

  /* Puck 은 에디터에서만 기본값을 채운다 — <Render> 는 채우지 않는다.
     기본값 없이 만든 블록은 캔버스에서만 멀쩡하고 공개 사이트에서는 서식이
     빠진 채 나간다. 만들 때 함께 박아 두려고 여기서 넘긴다. */
  const defaults = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(puckConfig.components).map(([type, def]) => [
          type,
          (def as { defaultProps?: Record<string, unknown> }).defaultProps ?? {},
        ]),
      ),
    [],
  );
  const [mode, setMode] = React.useState<Mode>('append');
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  /* 미리 해석해 요약만 보여 준다 — 실제 반영은 [가져오기] 를 눌러야 일어난다.

     타이핑마다 곧바로 해석하면 안 된다. 한 글자에 문서 전체를 파싱하고
     DOMPurify 로 정화하므로, 실제 크기의 파일(수십 KB)에서는 입력이 멎는다.
     잠깐 멈춘 뒤에 한 번만 해석한다. */
  const [settled, setSettled] = React.useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(html), 350);
    return () => clearTimeout(timer);
  }, [html]);

  const parsing = html.trim() !== settled.trim();

  const preview = React.useMemo(() => {
    if (!settled.trim()) return null;
    try {
      return htmlToPage(settled, { locale, defaults });
    } catch (err) {
      return { error: err instanceof Error ? err.message : '해석 실패' } as const;
    }
  }, [settled, locale, defaults]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setHtml(await file.text());
    } catch {
      setError('파일을 읽지 못했습니다.');
    }
  };

  const apply = () => {
    if (!html.trim()) {
      setError('가져올 HTML 을 붙여넣거나 파일을 선택하세요.');
      return;
    }
    try {
      const { data } = htmlToPage(html, { locale, defaults });
      onApply(mode === 'append' ? appendImported(getCurrentData(), data) : data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    }
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const summary = preview && !('error' in preview) ? preview.summary : null;

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="HTML 가져오기">
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>HTML 가져오기</strong>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={ghost} title="닫기 (Esc)">
            ✕
          </button>
        </div>

        <p style={hint}>
          기존 페이지의 HTML 을 붙여넣거나 파일을 고르세요. 알아보는 것은 편집 가능한 블록으로,
          알아보지 못하는 것은 원본 그대로 담깁니다.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => readFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} style={ghost}>
            HTML 파일 열기
          </button>
          {html ? (
            <button type="button" onClick={() => setHtml('')} style={ghost}>
              비우기
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <label style={radio}>
            <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />
            지금 페이지 뒤에 추가
          </label>
          <label style={radio}>
            <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            페이지 내용 교체
          </label>
        </div>

        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          placeholder="<section>…</section> 또는 문서 전체를 붙여넣으세요"
          spellCheck={false}
          style={area}
        />

        {preview && 'error' in preview ? <div style={errorBox}>{preview.error}</div> : null}

        {parsing && html.trim() ? <div style={summaryBox}>해석 중…</div> : null}

        {summary && !parsing ? (
          <div style={summaryBox}>
            <strong>미리 확인</strong> — 블록 {summary.blocks}개
            {summary.images ? ` · 이미지 ${summary.images}개` : ''}
            {summary.embedded ? ` · 원본 그대로 ${summary.embedded}개` : ''}
            {summary.notes.length ? (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {summary.notes.map((n) => (
                  <li key={n} style={{ color: '#fcd34d' }}>
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {mode === 'replace' ? (
          <div style={warnBox}>지금 페이지의 내용이 모두 사라지고 가져온 내용으로 바뀝니다.</div>
        ) : null}

        {error ? <div style={errorBox}>{error}</div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={ghost}>
            취소
          </button>
          <button type="button" onClick={apply} disabled={!html.trim()} style={primary}>
            가져오기
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  background: 'rgba(5,7,11,.72)',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
};

const panel: React.CSSProperties = {
  width: 'min(760px, 100%)',
  maxHeight: '90vh',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 20,
  borderRadius: 12,
  background: '#151922',
  border: '1px solid #262d3a',
  color: '#e6ebf5',
};

const hint: React.CSSProperties = { margin: 0, fontSize: 12, color: '#8b95a7', lineHeight: 1.7 };

const area: React.CSSProperties = {
  minHeight: 220,
  resize: 'vertical',
  padding: 10,
  borderRadius: 8,
  border: '1px solid #262d3a',
  background: '#0d0f14',
  color: '#e6ebf5',
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.6,
};

const ghost: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 7,
  border: '1px solid #262d3a',
  background: '#0d0f14',
  color: '#e6ebf5',
  fontSize: 12,
  cursor: 'pointer',
};

const primary: React.CSSProperties = { ...ghost, background: '#1d4ed8', borderColor: '#1d4ed8', fontWeight: 700 };

const radio: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: '#c8d0de',
  cursor: 'pointer',
};

const summaryBox: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.7,
  padding: '9px 12px',
  borderRadius: 8,
  background: 'rgba(59,130,246,.12)',
  border: '1px solid rgba(59,130,246,.35)',
};

const warnBox: React.CSSProperties = {
  fontSize: 12,
  padding: '9px 12px',
  borderRadius: 8,
  background: 'rgba(245,158,11,.14)',
  border: '1px solid rgba(245,158,11,.4)',
  color: '#fcd34d',
};

const errorBox: React.CSSProperties = {
  fontSize: 12,
  padding: '9px 12px',
  borderRadius: 8,
  background: 'rgba(239,68,68,.14)',
  border: '1px solid rgba(239,68,68,.4)',
  color: '#fca5a5',
};
