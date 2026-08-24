'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { LOCALES, LOCALE_ORDER } from '@/lib/i18n';
import { translatePage } from '@/lib/translate/pipeline';
import { coverageReport } from '@/lib/translate/walk';
import { PAGE_TEMPLATES } from '@/data/templates';
import { SitePreview } from './SitePreview';
import { ImportHtmlDialog } from './ImportHtmlDialog';
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
  /** 아직 확인하지 않은 문의 수 */
  newInquiries?: number;
}

/**
 * 번역 결과 한 줄 요약.
 * 같은 원인(키 미설정 등)으로 다섯 언어가 모두 실패하면 같은 문장이 다섯 번
 * 반복돼 정작 무엇을 해야 하는지가 묻힌다 — 원인별로 묶어서 보여 준다.
 */
function summarizeTranslation(result: {
  translatedCount: number;
  skipped: number;
  errors: Array<{ locale: LocaleCode; message: string }>;
}): string {
  if (!result.errors.length) {
    return `${result.translatedCount}건 번역 완료 (검수 완료분 ${result.skipped}건은 유지)`;
  }

  const byMessage = new Map<string, LocaleCode[]>();
  for (const e of result.errors) {
    const locales = byMessage.get(e.message) ?? [];
    if (!locales.includes(e.locale)) locales.push(e.locale);
    byMessage.set(e.message, locales);
  }
  const detail = [...byMessage.entries()]
    .map(([message, locales]) => `${locales.join('·')}: ${message}`)
    .join(' / ');

  // 한 건도 못 채웠으면 '완료' 라고 말하지 않는다
  return result.translatedCount
    ? `${result.translatedCount}건 번역 완료 · 일부 실패 — ${detail}`
    : `번역 실패 — ${detail}`;
}

export function EditorToolbar({ getCurrentData, onReplaceData, onSave, wide, onToggleWide, newInquiries = 0 }: EditorToolbarProps) {
  const page = useEditorStore((s) => s.activePage());
  const editingLocale = useEditorStore((s) => s.editingLocale);
  const setEditingLocale = useEditorStore((s) => s.setEditingLocale);
  const heatmapEnabled = useEditorStore((s) => s.heatmapEnabled);
  const toggleHeatmap = useEditorStore((s) => s.toggleHeatmap);
  const heatmapMetric = useEditorStore((s) => s.heatmapMetric);
  const setHeatmapMetric = useEditorStore((s) => s.setHeatmapMetric);
  const heatmapPixel = useEditorStore((s) => s.heatmapPixel);
  const toggleHeatmapPixel = useEditorStore((s) => s.toggleHeatmapPixel);
  const translating = useEditorStore((s) => s.translating);
  const progress = useEditorStore((s) => s.translationProgress);
  const setTranslating = useEditorStore((s) => s.setTranslating);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const showBadges = useEditorStore((s) => s.showTranslationBadges);
  const toggleBadges = useEditorStore((s) => s.toggleTranslationBadges);
  const applyTemplate = useEditorStore((s) => s.applyTemplate);

  const [message, setMessage] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [previewing, setPreviewing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  /* 이 페이지가 노출하는 언어만 다룬다(SEO 탭에서 지정). 끈 언어까지 번역하면
     보이지도 않을 문장에 번역 API 비용을 쓰게 된다. */
  const enabledLocales = React.useMemo<LocaleCode[]>(
    () => (page?.enabledLocales?.length ? page.enabledLocales : LOCALE_ORDER),
    [page?.enabledLocales],
  );

  const coverage = React.useMemo(() => {
    if (!page) return [];
    return coverageReport(page.content, page.sourceLocale, enabledLocales);
    // content 가 바뀔 때마다 다시 계산 (revision 으로 추적)
  }, [page?.content, page?.revision, page?.sourceLocale, enabledLocales]);

  /* 노출을 끈 언어를 편집 중이었다면 원문 언어로 돌려놓는다 —
     보이지 않는 슬롯을 고치고 있으면 아무 일도 안 일어나는 것처럼 보인다. */
  React.useEffect(() => {
    if (page && !enabledLocales.includes(editingLocale)) setEditingLocale(page.sourceLocale);
  }, [page, enabledLocales, editingLocale, setEditingLocale]);

  /** 페이지 전체 자동번역 */
  const handleTranslateAll = async () => {
    if (!page) return;
    const targets = enabledLocales.filter((l) => l !== page.sourceLocale);
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
      setMessage(summarizeTranslation(result));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '번역 실패');
    } finally {
      setTranslating(false, null);
    }
  };

  /**
   * 정적 HTML 내보내기 — 발행된 페이지를 zip 한 덩어리로 받는다.
   * 서버가 자기 자신을 크롤링하므로 저장하지 않은 편집은 담기지 않는다.
   * 그 사실을 먼저 알려 준다("눌렀는데 어제 내용이 나왔다"를 막는다).
   */
  const handleExport = async () => {
    if (dirty && !window.confirm('저장하지 않은 편집이 있습니다.\n내보내기는 발행된 내용만 담습니다. 계속할까요?')) return;

    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `내보내기에 실패했습니다 (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'site.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 즉시 revoke 하면 브라우저가 아직 읽는 중일 수 있다
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      const pages = res.headers.get('X-Export-Pages');
      const files = res.headers.get('X-Export-Files');
      const warnings = decodeURIComponent(res.headers.get('X-Export-Warnings') ?? '')
        .split('\n')
        .filter(Boolean);
      setMessage(
        `${pages}장 · 파일 ${files}개를 내려받았습니다. 압축을 풀어 웹호스팅 문서 루트에 그대로 올리세요.` +
          (warnings.length ? ` — ${warnings.join(' / ')}` : ''),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '내보내기 실패');
    } finally {
      setExporting(false);
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
        {enabledLocales.map((locale) => {
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

        {/* 번역 상태 배지(자동/미번역/원문변경)를 인스펙터에 표시할지 */}
        <button
          type="button"
          onClick={toggleBadges}
          title="입력칸 옆의 번역 상태 표시를 켜고 끕니다"
          style={{ ...btn, opacity: showBadges ? 1 : 0.55 }}
        >
          번역 상태 {showBadges ? 'ON' : 'OFF'}
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
          <>
          <select
            value={heatmapMetric}
            onChange={(e) => setHeatmapMetric(e.target.value as 'clicks' | 'ctr' | 'rage' | 'dead')}
            style={{ ...input, width: 120 }}
          >
            <option value="clicks">클릭 수</option>
            <option value="ctr">CTR</option>
            <option value="rage">분노 클릭</option>
            <option value="dead">데드 클릭</option>
          </select>

          {/* 요소 박스는 '무엇이 눌렸나', 픽셀은 '어디를 눌렀나' */}
          <button
            type="button"
            onClick={toggleHeatmapPixel}
            title="클릭 좌표를 점으로 그립니다 (요소 단위 대신)"
            style={{ ...btn, background: heatmapPixel ? '#3b82f6' : 'transparent', color: heatmapPixel ? '#fff' : 'inherit' }}
          >
            픽셀
          </button>
          </>
        ) : null}
      </div>

      {/* --- 저장 --- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
        <a href={page.path} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
          미리보기 ↗
        </a>
        {/* 접수된 문의를 볼 곳이 없으면 BUSINESS 폼은 있으나 마나다 */}
        <a
          href="/admin/inquiries"
          title={newInquiries ? `확인하지 않은 문의 ${newInquiries}건` : '접수된 문의 보기'}
          style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          문의
          {newInquiries ? (
            <span
              style={{
                minWidth: 18,
                padding: '1px 5px',
                borderRadius: 999,
                background: '#ef4444',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              {newInquiries > 99 ? '99+' : newInquiries}
            </span>
          ) : null}
        </a>
        <button
          type="button"
          onClick={() => setImporting(true)}
          title="이미 있는 HTML 을 캔버스로 불러와 이어서 고칩니다"
          style={btn}
        >
          HTML 가져오기
        </button>
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          title="방문자가 보는 실제 화면을 에디터 안에서 확인합니다 (저장된 내용 기준)"
          style={btn}
        >
          미리보기
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          title="발행된 페이지를 정적 HTML(zip)로 내려받습니다 — 웹호스팅에 그대로 올릴 수 있습니다"
          style={btn}
        >
          {exporting ? 'HTML 뽑는 중…' : 'HTML 내보내기'}
        </button>
        <button
          type="button"
          onClick={() => onSave(false)}
          disabled={saving}
          /* 마지막으로 저장한 시각을 알려 준다 — 자동 저장이 없으므로 중요한 정보다 */
          title={lastSavedAt ? `마지막 저장 ${new Date(lastSavedAt).toLocaleTimeString('ko-KR')}` : '아직 저장하지 않았습니다'}
          style={btn}
        >
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

      {importing ? (
        <ImportHtmlDialog
          locale={editingLocale}
          getCurrentData={getCurrentData}
          onApply={onReplaceData}
          onClose={() => setImporting(false)}
        />
      ) : null}

      {previewing ? (
        <SitePreview
          path={page.path}
          locales={enabledLocales}
          dirty={dirty}
          onClose={() => setPreviewing(false)}
        />
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
