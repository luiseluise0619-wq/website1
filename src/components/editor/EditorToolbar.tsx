'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { LOCALES, LOCALE_ORDER } from '@/lib/i18n';
import { translatePage } from '@/lib/translate/pipeline';
import { coverageReport } from '@/lib/translate/walk';
import { PAGE_TEMPLATES } from '@/data/templates';
import type { LocaleCode, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 에디터 상단 바 — 언어 전환 / 자동번역 / 히트맵 / 저장·발행
 * ========================================================================== */

export interface EditorToolbarProps {
  /** Puck 이 들고 있는 현재 편집 데이터 (저장 시점의 최신값) */
  getCurrentData: () => PuckPageData;
  onReplaceData: (data: PuckPageData) => void;
  onSave: (publish?: boolean) => Promise<void> | void;
  /** 좌측 패널들을 접어 캔버스를 넓히는 모드 */
  wide?: boolean;
  onToggleWide?: () => void;
}

export function EditorToolbar({ getCurrentData, onReplaceData, onSave, wide, onToggleWide }: EditorToolbarProps) {
  const page = useEditorStore((s) => s.activePage());
  const editingLocale = useEditorStore((s) => s.editingLocale);
  const setEditingLocale = useEditorStore((s) => s.setEditingLocale);
  const heatmapEnabled = useEditorStore((s) => s.heatmapEnabled);
  const toggleHeatmap = useEditorStore((s) => s.toggleHeatmap);
  const heatmapMetric = useEditorStore((s) => s.heatmapMetric);
  const setHeatmapMetric = useEditorStore((s) => s.setHeatmapMetric);
  const translating = useEditorStore((s) => s.translating);
  const progress = useEditorStore((s) => s.translationProgress);
  const setTranslating = useEditorStore((s) => s.setTranslating);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);
  const applyTemplate = useEditorStore((s) => s.applyTemplate);

  const [message, setMessage] = React.useState<string | null>(null);

  const coverage = React.useMemo(() => {
    if (!page) return [];
    return coverageReport(page.content, page.sourceLocale, LOCALE_ORDER);
    // content 가 바뀔 때마다 다시 계산 (revision 으로 추적)
  }, [page?.content, page?.revision, page?.sourceLocale]);

  /** 페이지 전체 자동번역 */
  const handleTranslateAll = async () => {
    if (!page) return;
    const targets = LOCALE_ORDER.filter((l) => l !== page.sourceLocale);
    setTranslating(true, { done: 0, total: targets.length });
    setMessage(null);
    try {
      const result = await translatePage({
        data: getCurrentData(),
        sourceLocale: page.sourceLocale,
        targets,
        onProgress: (done, total) => setTranslating(true, { done, total }),
      });
      onReplaceData(result.data);
      setMessage(
        result.errors.length
          ? `${result.translatedCount}건 번역 완료 · 실패: ${result.errors.map((e) => `${e.locale}(${e.message})`).join(', ')}`
          : `${result.translatedCount}건 번역 완료 (검수 완료분 ${result.skipped}건은 유지)`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '번역 실패');
    } finally {
      setTranslating(false, null);
    }
  };

  if (!page) return null;

  return (
    <div style={bar}>
      {/* --- 페이지 정보 --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{page.title}</strong>
        <input
          value={page.path}
          onChange={(e) => updatePageMeta(page.id, { path: e.target.value })}
          title="URL 경로"
          style={{ ...input, width: 190, fontFamily: 'monospace', fontSize: 11 }}
        />
        <select
          value={page.status}
          onChange={(e) => updatePageMeta(page.id, { status: e.target.value as typeof page.status })}
          style={{ ...input, width: 92 }}
        >
          <option value="draft">초안</option>
          <option value="published">발행</option>
          <option value="archived">보관</option>
        </select>
      </div>

      <button
        type="button"
        onClick={onToggleWide}
        title="좌측 패널을 접어 캔버스를 넓게 씁니다"
        style={{ ...btn, background: wide ? '#3b82f6' : 'transparent', color: wide ? '#fff' : 'inherit' }}
      >
        {wide ? '넓게 ON' : '넓게'}
      </button>

      {/* 현재 페이지를 다른 템플릿으로 갈아끼운다 */}
      <select
        value=""
        title="이 페이지에 템플릿 적용 (내용이 교체됩니다)"
        onChange={(e) => {
          const id = e.target.value;
          e.target.value = '';
          if (!id) return;
          const t = PAGE_TEMPLATES.find((x) => x.id === id);
          if (!t) return;
          if (!window.confirm(`'${t.name}' 템플릿으로 교체합니다. 현재 페이지 내용은 사라집니다. 계속할까요?`)) return;
          applyTemplate(page.id, id);
        }}
        style={{ ...input, width: 130 }}
      >
        <option value="">템플릿 적용…</option>
        {PAGE_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div style={{ flex: 1 }} />

      {/* --- 언어 --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {LOCALE_ORDER.map((locale) => {
          const cov = coverage.find((c) => c.locale === locale);
          const complete = cov ? cov.total === 0 || cov.missing + cov.stale === 0 : true;
          return (
            <button
              key={locale}
              type="button"
              onClick={() => setEditingLocale(locale)}
              title={
                cov
                  ? `${LOCALES[locale].nativeName} · 완료 ${cov.done} / 자동 ${cov.auto} / 미번역 ${cov.missing} / 원문변경 ${cov.stale}`
                  : LOCALES[locale].nativeName
              }
              style={{
                ...chip,
                background: locale === editingLocale ? '#3b82f6' : 'transparent',
                color: locale === editingLocale ? '#fff' : 'inherit',
                borderColor: complete ? 'var(--ks-edge)' : '#f59e0b',
              }}
            >
              {LOCALES[locale].flag} {locale.toUpperCase()}
              {!complete ? <span style={{ color: '#f59e0b', marginLeft: 2 }}>•</span> : null}
            </button>
          );
        })}

        <button type="button" onClick={handleTranslateAll} disabled={translating} style={{ ...btn, marginLeft: 4 }}>
          {translating ? `번역 중 ${progress?.done ?? 0}/${progress?.total ?? 0}` : '전체 자동번역'}
        </button>
      </div>

      {/* --- 히트맵 --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
        <button
          type="button"
          onClick={toggleHeatmap}
          style={{ ...btn, background: heatmapEnabled ? '#ef4444' : 'transparent', color: heatmapEnabled ? '#fff' : 'inherit' }}
        >
          히트맵 {heatmapEnabled ? 'ON' : 'OFF'}
        </button>
        {heatmapEnabled ? (
          <select value={heatmapMetric} onChange={(e) => setHeatmapMetric(e.target.value as 'clicks')} style={{ ...input, width: 110 }}>
            <option value="clicks">클릭 수</option>
            <option value="ctr">CTR</option>
            <option value="rage">분노 클릭</option>
          </select>
        ) : null}
      </div>

      {/* --- 저장 --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <a href={page.path} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
          미리보기 ↗
        </a>
        {/* 접수된 문의를 볼 곳이 없으면 BUSINESS 폼은 있으나 마나다 */}
        <a href="/admin/inquiries" style={{ ...btn, textDecoration: 'none' }}>
          문의
        </a>
        <button type="button" onClick={() => onSave(false)} disabled={saving} style={btn}>
          {saving ? '저장 중…' : dirty ? '저장 *' : '저장됨'}
        </button>
        <button type="button" onClick={() => onSave(true)} disabled={saving} style={{ ...btn, background: '#22c55e', color: '#04210f', fontWeight: 700 }}>
          발행
        </button>
        <button
          type="button"
          title="로그아웃"
          onClick={async () => {
            await fetch('/api/admin/login', { method: 'DELETE' });
            window.location.href = '/admin/login';
          }}
          style={{ ...btn, opacity: 0.7 }}
        >
          ⏻
        </button>
      </div>

      {message ? (
        <div style={toast} onClick={() => setMessage(null)}>
          {message}
        </div>
      ) : null}
    </div>
  );
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel)',
  position: 'relative',
  flexWrap: 'wrap',
};

const input: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel2)',
  color: 'inherit',
  fontSize: 12,
};

const btn: React.CSSProperties = {
  padding: '6px 11px',
  borderRadius: 6,
  border: '1px solid var(--ks-edge)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const chip: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid var(--ks-edge)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const toast: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 12,
  marginTop: 6,
  background: '#111827',
  color: '#fff',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 12,
  zIndex: 200,
  cursor: 'pointer',
  boxShadow: '0 8px 24px rgba(0,0,0,.4)',
};
