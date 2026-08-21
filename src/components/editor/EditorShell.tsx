'use client';

import React from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { puckConfig } from '@/puck/config';
import { RenderCtx } from '@/puck/blocks/shared';
import { useEditorStore } from '@/store/editorStore';
import { PageTree } from './PageTree';
import { EditorToolbar } from './EditorToolbar';
import { SeoPanel } from './SeoPanel';
import { HeatmapOverlay } from '@/components/analytics/HeatmapOverlay';
import { DropOffPanel } from '@/components/analytics/DropOffPanel';
import type { Data } from '@puckeditor/core';
import type { PageDocument, PuckPageData } from '@/types/schema';

/* =============================================================================
 * Editor Shell — 3분할 레이아웃
 *   좌: 페이지 트리(IA 매핑)  ·  중앙: Puck 캔버스  ·  우: Puck 인스펙터 + 분석
 * Puck 이 자체 좌/우 패널을 갖고 있으므로, 우리는 그 바깥에 우리 패널을 덧댄다.
 * ========================================================================== */

export interface StorageStatus {
  pages: { driver: string; readOnly: boolean };
  analytics: { driver: string; readOnly: boolean };
  serverless: boolean;
  hint?: string;
}

export function EditorShell({ initialPages, storage }: { initialPages: PageDocument[]; storage?: StorageStatus }) {
  const pages = useEditorStore((s) => s.pages);
  const activePage = useEditorStore((s) => s.activePage());
  const loadPages = useEditorStore((s) => s.loadPages);
  const commitContent = useEditorStore((s) => s.commitContent);
  const editingLocale = useEditorStore((s) => s.editingLocale);
  const heatmapEnabled = useEditorStore((s) => s.heatmapEnabled);
  const heatmapRange = useEditorStore((s) => s.heatmapRange);
  const analytics = useEditorStore((s) => s.analytics);
  const setAnalytics = useEditorStore((s) => s.setAnalytics);
  const setAnalyticsLoading = useEditorStore((s) => s.setAnalyticsLoading);
  const setAnalyticsError = useEditorStore((s) => s.setAnalyticsError);
  const setSaving = useEditorStore((s) => s.setSaving);
  const markSaved = useEditorStore((s) => s.markSaved);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);

  const [rightTab, setRightTab] = React.useState<'inspector' | 'seo' | 'analytics'>('inspector');
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  /** Puck 캔버스는 iframe 안에서 렌더된다 — 히트맵 측정 대상 */
  const [canvasDoc, setCanvasDoc] = React.useState<Document | null>(null);
  /** Puck 의 최신 데이터를 항상 들고 있는 ref (툴바 저장/번역이 참조) */
  const liveData = React.useRef<PuckPageData | null>(null);
  /** 번역 등으로 데이터를 통째로 갈아끼울 때 Puck 을 리마운트하기 위한 키 */
  const [dataVersion, setDataVersion] = React.useState(0);

  React.useEffect(() => {
    loadPages(initialPages);
  }, [initialPages, loadPages]);

  React.useEffect(() => {
    liveData.current = activePage?.content ?? null;
  }, [activePage?.id]);

  /* --- 히트맵 켤 때 분석 데이터 로드 --- */
  React.useEffect(() => {
    if (!heatmapEnabled || !activePage) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    const params = new URLSearchParams({ pageId: activePage.id, from: heatmapRange.from, to: heatmapRange.to });
    fetch(`/api/analytics/summary?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setAnalyticsError(json.error);
        else setAnalytics(json.summary);
      })
      .catch((err) => !cancelled && setAnalyticsError(err.message));
    return () => {
      cancelled = true;
    };
  }, [heatmapEnabled, activePage?.id, heatmapRange, setAnalytics, setAnalyticsLoading, setAnalyticsError]);

  /* --- Puck iframe document 탐색 (히트맵 오버레이 좌표 기준) --- */
  React.useEffect(() => {
    if (!heatmapEnabled) return;
    const findFrame = () => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe#preview-frame, .Puck-frame iframe, iframe');
      if (frame?.contentDocument) setCanvasDoc(frame.contentDocument);
    };
    findFrame();
    const timer = setInterval(findFrame, 800);
    return () => clearInterval(timer);
  }, [heatmapEnabled]);

  const handleSave = async (publish?: boolean) => {
    if (!activePage) return;
    setSaving(true);
    setSaveError(null);
    try {
      const content = liveData.current ?? activePage.content;
      const page: PageDocument = {
        ...activePage,
        content,
        status: publish ? 'published' : activePage.status,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장 실패');
      commitContent(activePage.id, content);
      if (publish) updatePageMeta(activePage.id, { status: 'published' });
      markSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      setSaving(false);
    }
  };

  const replaceData = (data: PuckPageData) => {
    if (!activePage) return;
    liveData.current = data;
    commitContent(activePage.id, data);
    // Puck 내부 상태를 새 데이터로 재초기화
    setDataVersion((v) => v + 1);
  };

  const renderCtxValue = React.useMemo(
    () => ({ locale: editingLocale, siteDefault: activePage?.sourceLocale ?? 'ko', isEditing: true }),
    [editingLocale, activePage?.sourceLocale],
  );

  if (!pages.length || !activePage) {
    return <div style={{ padding: 40, color: '#8b95a7' }}>페이지를 불러오는 중…</div>;
  }

  return (
    <RenderCtx.Provider value={renderCtxValue}>
      <div style={shell}>
        {/* ============ 좌측: 페이지 트리 ============ */}
        <aside style={leftPanel}>
          <div style={panelHeader}>K-SOHO GLOBAL</div>
          <PageTree />
        </aside>

        {/* ============ 중앙: 툴바 + Puck 캔버스 ============ */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <EditorToolbar
            getCurrentData={() => liveData.current ?? activePage.content}
            onReplaceData={replaceData}
            onSave={handleSave}
          />

          {/* 저장이 불가능한 배포에서는 편집 전에 미리 알린다 */}
          {storage?.pages.readOnly ? (
            <Banner tone="warn">
              <strong>읽기 전용 배포</strong> — {storage.hint ?? '데이터베이스가 연결되지 않아 저장할 수 없습니다.'}
            </Banner>
          ) : null}
          {saveError ? (
            <Banner tone="error" onClose={() => setSaveError(null)}>
              {saveError}
            </Banner>
          ) : null}

          <div ref={canvasRef} style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <Puck
              key={`${activePage.id}:${dataVersion}`}
              config={puckConfig}
              data={activePage.content as unknown as Data}
              onChange={(data) => {
                liveData.current = data as unknown as PuckPageData;
                commitContent(activePage.id, data as unknown as PuckPageData);
              }}
              onPublish={() => handleSave(true)}
              /* Puck 의 기본 헤더는 우리 툴바로 대체한다 */
              headerTitle={activePage.title}
              headerPath={activePage.path}
            />

            {/* 히트맵은 Puck 캔버스 위에 겹치는 별도 레이어 */}
            {heatmapEnabled ? (
              <HeatmapOverlay targetDocument={canvasDoc} containerRef={canvasRef} summary={analytics} />
            ) : null}
          </div>
        </div>

        {/* ============ 우측: SEO / 분석 보조 패널 ============ */}
        <aside style={rightPanel}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--ks-edge)' }}>
            {(['inspector', 'seo', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                style={{
                  flex: 1,
                  padding: '10px 6px',
                  border: 0,
                  background: rightTab === tab ? 'var(--ks-panel2)' : 'transparent',
                  color: 'inherit',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: rightTab === tab ? 700 : 400,
                }}
              >
                {tab === 'inspector' ? '가이드' : tab === 'seo' ? 'SEO' : '분석'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightTab === 'seo' ? <SeoPanel /> : null}
            {rightTab === 'analytics' ? <DropOffPanel summary={analytics} /> : null}
            {rightTab === 'inspector' ? <InspectorGuide /> : null}
          </div>
        </aside>
      </div>
    </RenderCtx.Provider>
  );
}

function Banner({
  tone,
  children,
  onClose,
}: {
  tone: 'warn' | 'error';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const palette =
    tone === 'error'
      ? { bg: 'rgba(239,68,68,.14)', fg: '#fca5a5', edge: 'rgba(239,68,68,.4)' }
      : { bg: 'rgba(245,158,11,.14)', fg: '#fcd34d', edge: 'rgba(245,158,11,.4)' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 14px',
        fontSize: 12,
        lineHeight: 1.6,
        background: palette.bg,
        color: palette.fg,
        borderBottom: `1px solid ${palette.edge}`,
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {onClose ? (
        <button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', fontSize: 15 }}>
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Puck 자체 인스펙터가 캔버스 오른쪽에 붙으므로, 이 탭은 사용법 안내를 담당한다 */
function InspectorGuide() {
  return (
    <div style={{ padding: '14px 16px', fontSize: 12, lineHeight: 1.9, color: '#a8b1c2' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 12, color: '#e6ebf5' }}>편집 방법</h4>
      <ul style={{ paddingLeft: 16, margin: 0 }}>
        <li>왼쪽 블록 목록에서 캔버스로 <b>드래그</b>해 요소를 추가합니다.</li>
        <li>요소를 클릭하면 <b>스타일 인스펙터</b>가 열립니다 (색상·폰트·여백·테두리).</li>
        <li><b>자유 캔버스</b> 블록 안에서는 X/Y/Z 좌표로 자유 배치됩니다.</li>
        <li>텍스트 필드는 언어별로 저장됩니다. 상단에서 편집 언어를 바꾸세요.</li>
        <li><b>추적 ID</b> 를 지정하면 요소를 옮겨도 히트맵 기록이 이어집니다.</li>
        <li><b>전환 목표명</b> 을 넣은 요소의 클릭은 전환으로 집계됩니다.</li>
      </ul>
    </div>
  );
}

const shell: React.CSSProperties = {
  display: 'flex',
  height: '100vh',
  background: 'var(--ks-ink)',
  color: '#e6ebf5',
  overflow: 'hidden',
};

const leftPanel: React.CSSProperties = {
  width: 250,
  flexShrink: 0,
  borderRight: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel)',
  display: 'flex',
  flexDirection: 'column',
};

const rightPanel: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderLeft: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel)',
  display: 'flex',
  flexDirection: 'column',
};

const panelHeader: React.CSSProperties = {
  padding: '14px 14px 10px',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: -0.3,
  borderBottom: '1px solid var(--ks-edge)',
};
