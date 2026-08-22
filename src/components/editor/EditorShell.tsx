'use client';

import React from 'react';
import { Puck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { puckConfig } from '@/puck/config';
import { RenderCtx } from '@/puck/blocks/shared';
import { useEditorStore } from '@/store/editorStore';
import { fetchJson } from '@/lib/fetchJson';
import { PageTree } from './PageTree';
import { EditorToolbar } from './EditorToolbar';
import { RightPanel, type RightTab } from './RightPanel';
import { FreeTransformLayer } from './FreeTransformLayer';
import { HeatmapOverlay } from '@/components/analytics/HeatmapOverlay';
import type { Data } from '@puckeditor/core';
import type { PageDocument, PuckPageData } from '@/types/schema';
import type { PageAnalyticsSummary } from '@/types/analytics';

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

export function EditorShell({
  initialPages,
  storage,
  newInquiries = 0,
}: {
  initialPages: PageDocument[];
  storage?: StorageStatus;
  /** 아직 확인하지 않은 문의 수 — 상단 [문의] 배지 */
  newInquiries?: number;
}) {
  const pages = useEditorStore((s) => s.pages);
  const activePage = useEditorStore((s) => s.activePage());
  const loadPages = useEditorStore((s) => s.loadPages);
  const commitContent = useEditorStore((s) => s.commitContent);
  const editingLocale = useEditorStore((s) => s.editingLocale);
  const heatmapEnabled = useEditorStore((s) => s.heatmapEnabled);
  const heatmapRange = useEditorStore((s) => s.heatmapRange);
  const analytics = useEditorStore((s) => s.analytics);
  const dirtyPageIds = useEditorStore((s) => s.dirtyPageIds);
  const dirty = useEditorStore((s) => s.dirty);
  const baseRevisions = useEditorStore((s) => s.baseRevisions);
  const setAnalytics = useEditorStore((s) => s.setAnalytics);
  const setAnalyticsLoading = useEditorStore((s) => s.setAnalyticsLoading);
  const setAnalyticsError = useEditorStore((s) => s.setAnalyticsError);
  const setSaving = useEditorStore((s) => s.setSaving);
  const markSaved = useEditorStore((s) => s.markSaved);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);

  const [saveError, setSaveError] = React.useState<string | null>(null);
  /* 좌측 페이지 트리는 접을 수 있다.
     Puck 자체 좌측 패널(블록 목록)과 합치면 화면 폭을 크게 잡아먹어
     캔버스가 심하게 축소된다(1600px 화면에서 캔버스가 600px 이하). */
  const [treeOpen, setTreeOpen] = React.useState(true);
  /* 블록 목록까지 접어 캔버스를 최대로 넓히는 모드 */
  const [wide, setWide] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  /** Puck 캔버스는 iframe 안에서 렌더된다 — 히트맵 측정 대상 */
  /** Puck 의 최신 데이터를 항상 들고 있는 ref (툴바 저장/번역이 참조) */
  const liveData = React.useRef<PuckPageData | null>(null);
  /** 번역 등으로 데이터를 통째로 갈아끼울 때 Puck 을 리마운트하기 위한 키 */
  const [dataVersion, setDataVersion] = React.useState(0);
  const [rightTab, setRightTab] = React.useState<RightTab>('style');

  React.useEffect(() => {
    loadPages(initialPages);
  }, [initialPages, loadPages]);

  React.useEffect(() => {
    liveData.current = activePage?.content ?? null;
  }, [activePage?.id]);

  /* 저장하지 않은 편집을 안고 탭을 닫으려 하면 브라우저 기본 경고를 띄운다.
     이 에디터는 자동 저장이 없어서, 닫는 순간 그대로 사라진다. */
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 최신 브라우저는 문구를 무시하지만, 값이 있어야 경고가 뜬다
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /* --- 분석 데이터 로드 (히트맵 또는 '분석' 탭) ---
     히트맵에만 걸어 두면 우측 '분석' 탭이 아무것도 부르지 않아
     "분석 데이터를 불러오면…" 안내만 영원히 남는다. */
  const needAnalytics = heatmapEnabled || rightTab === 'analytics';
  React.useEffect(() => {
    if (!needAnalytics || !activePage) return;
    let cancelled = false;
    setAnalyticsLoading(true);
    const params = new URLSearchParams({ pageId: activePage.id, from: heatmapRange.from, to: heatmapRange.to });
    fetchJson<{ summary: PageAnalyticsSummary }>(`/api/analytics/summary?${params}`)
      .then((json) => !cancelled && setAnalytics(json.summary))
      .catch((err) => !cancelled && setAnalyticsError(err.message));
    return () => {
      cancelled = true;
    };
  }, [needAnalytics, activePage?.id, heatmapRange, setAnalytics, setAnalyticsLoading, setAnalyticsError]);

  /**
   * 저장 — 손댄 페이지를 전부 보낸다.
   * 예전에는 '지금 보고 있는 페이지' 하나만 보냈다. 여러 페이지를 고친 뒤
   * 저장하면 나머지는 조용히 사라졌다(dirty 표시는 하나뿐이라 저장된 것처럼
   * 보인다). 발행은 지금 보고 있는 페이지에만 적용한다.
   */
  const handleSave = async (publish?: boolean) => {
    if (!activePage) return;
    setSaving(true);
    setSaveError(null);
    try {
      const content = liveData.current ?? activePage.content;
      const now = new Date().toISOString();

      const active: PageDocument = {
        ...activePage,
        content,
        status: publish ? 'published' : activePage.status,
        updatedAt: now,
      };
      const others = pages.filter((p) => p.id !== activePage.id && dirtyPageIds.includes(p.id));
      const payload = [active, ...others];

      /* 내가 편집을 시작할 때 본 판을 함께 보낸다 — 그 사이 누군가 저장했다면
         서버가 409 로 막는다(보내는 판만 비교하면 두 탭이 똑같이 +1 해서 놓친다). */
      const base = Object.fromEntries(payload.map((p) => [p.id, baseRevisions[p.id] ?? p.revision]));

      await fetchJson('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.length === 1 ? { page: active, base } : { pages: payload, base }),
      });

      commitContent(activePage.id, content);
      if (publish) updatePageMeta(activePage.id, { status: 'published' });
      markSaved(payload.map((p) => ({ id: p.id, revision: p.revision })));
    } catch (err) {
      /* 409 = 다른 곳에서 이미 수정됨. 메시지에 '무엇을 해야 하는지'가 들어 있으므로
         그대로 보여 준다(fetchJson 이 서버 문구를 그대로 전달한다). */
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

  /* Puck 에 넘기는 data 는 "초기값"이다. onChange 결과를 그대로 되먹이면
     매 편집마다 새 객체가 들어가 Puck 이 상태를 다시 세우고, 그 과정에서
     캔버스 스크롤이 맨 위로 튀고 선택이 풀린다.
     그래서 페이지가 바뀌거나 템플릿을 갈아끼울 때만 새 값을 준다. */
  const puckData = React.useMemo(
    () => activePage?.content as unknown as Data,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePage?.id, dataVersion],
  );

  const renderCtxValue = React.useMemo(
    () => ({
      locale: editingLocale,
      siteDefault: activePage?.sourceLocale ?? 'ko',
      isEditing: true,
      designWidth: activePage?.canvasWidth || 1440,
    }),
    [editingLocale, activePage?.sourceLocale, activePage?.canvasWidth],
  );

  if (!pages.length || !activePage) {
    return <div style={{ padding: 40, color: '#8b95a7' }}>페이지를 불러오는 중…</div>;
  }

  return (
    <RenderCtx.Provider value={renderCtxValue}>
      <div style={shell}>
        {/* ============ 좌측: 페이지 트리 (접기 가능) ============ */}
        <aside style={{ ...leftPanel, width: treeOpen ? 250 : 44 }}>
          <div style={{ ...panelHeader, display: 'flex', alignItems: 'center', gap: 8, justifyContent: treeOpen ? 'space-between' : 'center' }}>
            {treeOpen ? <span>K-SOHO GLOBAL</span> : null}
            <button
              type="button"
              onClick={() => setTreeOpen((v) => !v)}
              title={treeOpen ? '페이지 목록 접기 (캔버스를 넓게)' : '페이지 목록 펼치기'}
              style={{
                background: 'none',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                padding: 2,
                opacity: 0.7,
              }}
            >
              {treeOpen ? '⟨' : '⟩'}
            </button>
          </div>
          {treeOpen ? <PageTree onError={setSaveError} /> : null}
        </aside>

        {/* ============ 중앙: 툴바 + Puck 캔버스 ============ */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <EditorToolbar
            getCurrentData={() => liveData.current ?? activePage.content}
            onReplaceData={replaceData}
            onSave={handleSave}
            newInquiries={newInquiries}
            wide={wide}
            onToggleWide={() => {
              // 넓게 볼 때는 페이지 목록도 함께 접는 편이 자연스럽다
              setWide((v) => {
                const next = !v;
                setTreeOpen(!next);
                return next;
              });
            }}
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

          <div
            ref={canvasRef}
            className={`ksoho-editor${wide ? ' ksoho-wide' : ''}`}
            style={{ flex: 1, position: 'relative', minHeight: 0 }}
          >
            <Puck
              key={`${activePage.id}:${dataVersion}`}
              config={puckConfig}
              data={puckData}
              onChange={(data) => {
                liveData.current = data as unknown as PuckPageData;
                commitContent(activePage.id, data as unknown as PuckPageData);
              }}
              onPublish={() => handleSave(true)}
              /* Puck 의 기본 헤더는 우리 툴바로 대체한다 */
              headerTitle={activePage.title}
              headerPath={activePage.path}
              /* 우측 사이드바 전체를 우리 패널로 교체한다.
                 children 이 곧 선택 요소의 스타일 인스펙터다. */
              overrides={{
                /* 캔버스 위에 자유 배치 조작 레이어를 얹는다.
                   preview 오버라이드 안이어야 usePuck 컨텍스트에 접근할 수 있다. */
                preview: ({ children }) => (
                  <>
                    {children}
                    <FreeTransformLayer containerRef={canvasRef} />
                  </>
                ),
                fields: ({ children, isLoading, itemSelector }) => (
                  <RightPanel
                    isLoading={isLoading}
                    hasSelection={Boolean(itemSelector)}
                    analytics={analytics}
                    tab={rightTab}
                    onTabChange={setRightTab}
                  >
                    {children}
                  </RightPanel>
                ),
              }}
            />

            {/* 히트맵은 Puck 캔버스 위에 겹치는 별도 레이어 */}
            {heatmapEnabled ? (
              <HeatmapOverlay containerRef={canvasRef} summary={analytics} />
            ) : null}
          </div>
        </div>

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

const panelHeader: React.CSSProperties = {
  padding: '14px 14px 10px',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: -0.3,
  borderBottom: '1px solid var(--ks-edge)',
};
