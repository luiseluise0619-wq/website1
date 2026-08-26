'use client';

import React from 'react';
import { Puck, usePuck } from '@puckeditor/core';
import '@puckeditor/core/puck.css';
import { puckConfig } from '@/puck/config';
import { RenderCtx } from '@/puck/blocks/shared';
import { useEditorStore } from '@/store/editorStore';
import { fetchJson } from '@/lib/fetchJson';
import { PageTree } from './PageTree';
import { EditorToolbar } from './EditorToolbar';
import { RightPanel } from './RightPanel';
import { NewPageDialog } from './NewPageDialog';
import { LayerTree } from './LayerTree';
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

/* -----------------------------------------------------------------------------
 * Puck 오버라이드는 반드시 '항상 같은 컴포넌트'여야 한다
 * -----------------------------------------------------------------------------
 * Puck 내부는 오버라이드를 컴포넌트 동일성으로 기억한다
 *   const CustomPreview = useMemo(() => overrides.preview, [overrides])
 * 그리고 캔버스를 <CustomPreview><Preview/></CustomPreview> 로 그린다.
 *
 * overrides 를 JSX 안에서 객체 리터럴로 만들면 EditorShell 이 다시 그려질 때마다
 * preview/fields 가 '새로운 컴포넌트 타입'이 된다. React 는 타입이 바뀐 자리를
 * 갱신이 아니라 언마운트→마운트로 처리하므로, 캔버스 문서의 내용이 통째로
 * 지워졌다 다시 그려진다. 화면에는 새로고침처럼 보이고, 스크롤은 맨 위로
 * 돌아간다 — 아래쪽 섹션을 편집하는 동안 계속.
 *
 * EditorShell 은 타이핑 한 번마다(onChange → commitContent) 다시 그려지므로
 * 그 빈도는 사실상 '편집할 때마다'였다. 그래서 오버라이드를 모듈 스코프에 두어
 * 동일성을 고정하고, 바뀌는 값은 스토어/컨텍스트에서 직접 읽는다.
 * ========================================================================== */

/** 자유 배치 레이어가 쓰는 캔버스 컨테이너 — props 대신 컨텍스트로 넘긴다 */
const CanvasRefCtx = React.createContext<React.RefObject<HTMLDivElement> | null>(null);

const PreviewOverride = ({ children }: { children: React.ReactNode }) => {
  const containerRef = React.useContext(CanvasRefCtx);
  return (
    <>
      {children}
      {containerRef ? <FreeTransformLayer containerRef={containerRef} /> : null}
    </>
  );
};

const FieldsOverride = ({
  children,
  isLoading,
  itemSelector,
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  itemSelector?: unknown;
}) => {
  /* 스토어에서 직접 읽는다 — props 로 받으면 다시 EditorShell 의 렌더에 묶인다 */
  const analytics = useEditorStore((s) => s.analytics);
  const tab = useEditorStore((s) => s.rightTab);
  const setRightTab = useEditorStore((s) => s.setRightTab);
  return (
    <RightPanel
      isLoading={isLoading}
      hasSelection={Boolean(itemSelector)}
      analytics={analytics}
      tab={tab}
      onTabChange={setRightTab}
    >
      {children}
    </RightPanel>
  );
};

/**
 * Puck 기본 헤더 자리 — 되돌리기/다시 실행만 남긴다.
 *
 * 기본 헤더는 페이지 제목·주소·[Publish] 를 그린다. 우리 상단 바가 이미 셋 다
 * 갖고 있어서, 화면 맨 위에 제목이 두 줄, 발행 버튼이 두 개 있었다. 둘 중
 * 어느 쪽을 눌러야 하는지 알 수 없고, 캔버스 높이만 50px 깎아 먹었다.
 * 남길 것은 되돌리기뿐이다 — Ctrl+Z 로도 되지만 눌러서 보이는 자리가 없으면
 * 되는지조차 알 수 없다.
 */
const HeaderOverride = () => {
  const { history } = usePuck();
  return (
    <div style={puckHeader}>
      <button
        type="button"
        onClick={history.back}
        disabled={!history.hasPast}
        title="되돌리기 (Ctrl+Z)"
        style={{ ...historyBtn, opacity: history.hasPast ? 1 : 0.3 }}
      >
        ↶ 되돌리기
      </button>
      <button
        type="button"
        onClick={history.forward}
        disabled={!history.hasFuture}
        title="다시 실행 (Ctrl+Shift+Z)"
        style={{ ...historyBtn, opacity: history.hasFuture ? 1 : 0.3 }}
      >
        ↷ 다시 실행
      </button>
    </div>
  );
};

/** 위 세 컴포넌트를 담은 객체도 한 번만 만든다 (Puck 이 객체 동일성도 본다) */
const PUCK_OVERRIDES = { preview: PreviewOverride, fields: FieldsOverride, header: HeaderOverride };

const puckHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderBottom: '1px solid var(--puck-color-grey-09, #e5e7eb)',
  background: 'var(--puck-color-grey-12, #fafafa)',
};

const historyBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--puck-color-grey-09, #e5e7eb)',
  background: 'var(--puck-color-white, #fff)',
  color: 'var(--puck-color-black, #111827)',
  fontSize: 11.5,
  cursor: 'pointer',
};

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
  const rightTab = useEditorStore((s) => s.rightTab);
  /* 새 페이지 대화상자는 여기서 그린다 — 좌측 목록 안에서 그리면 목록을
     접었을 때([넓게]) 상단 [＋ 추가 → 새 페이지] 가 아무 일도 하지 않는다. */
  const newPage = useEditorStore((s) => s.newPage);
  const setNewPage = useEditorStore((s) => s.setNewPage);
  const createPage = useEditorStore((s) => s.createPage);

  const [saveError, setSaveError] = React.useState<string | null>(null);
  /* 좌측 페이지 트리는 접을 수 있다.
     Puck 자체 좌측 패널(블록 목록)과 합치면 화면 폭을 크게 잡아먹어
     캔버스가 심하게 축소된다(1600px 화면에서 캔버스가 600px 이하). */
  const [treeOpen, setTreeOpen] = React.useState(true);
  /* 좌측 패널이 두 가지를 보여 준다: 어떤 페이지를 볼지(페이지),
     그 페이지 안에서 무엇을 고를지(레이어). 둘 다 '고르기'라 한 자리에 둔다. */
  const [leftTab, setLeftTab] = React.useState<'pages' | 'layers'>('pages');
  /* 블록 목록까지 접어 캔버스를 최대로 넓히는 모드 */
  const [wide, setWide] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  /** Puck 캔버스는 iframe 안에서 렌더된다 — 히트맵 측정 대상 */
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
          {treeOpen ? (
            <>
              <div style={leftTabBar}>
                {(
                  [
                    ['pages', '페이지'],
                    ['layers', '레이어'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLeftTab(key)}
                    style={{
                      ...leftTabBtn,
                      color: leftTab === key ? '#e6ebf5' : '#8b95a7',
                      borderBottomColor: leftTab === key ? '#3b82f6' : 'transparent',
                      fontWeight: leftTab === key ? 700 : 500,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* 두 목록 다 마운트를 유지한다 — 탭을 옮길 때마다 스크롤 위치와
                  접어 둔 상태가 날아가면 깊은 페이지에서 매번 다시 찾아야 한다. */}
              <div style={{ display: leftTab === 'pages' ? 'contents' : 'none' }}>
                <PageTree onError={setSaveError} />
              </div>
              <div style={{ display: leftTab === 'layers' ? 'contents' : 'none' }}>
                <LayerTree />
              </div>
            </>
          ) : null}
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
            <CanvasRefCtx.Provider value={canvasRef}>
              <Puck
                key={`${activePage.id}:${dataVersion}`}
                config={puckConfig}
                data={puckData}
                onChange={(data) => {
                  liveData.current = data as unknown as PuckPageData;
                  commitContent(activePage.id, data as unknown as PuckPageData);
                }}
                onPublish={() => handleSave(true)}
                /* 우측 사이드바 전체를 우리 패널(fields)로, 기본 헤더를 되돌리기
                   줄(header)로 바꾸고, 캔버스 위에 자유 배치 조작 레이어(preview)를
                   얹는다. 반드시 고정된 참조여야 한다 — 위 주석 참고. */
                overrides={PUCK_OVERRIDES}
              />
            </CanvasRefCtx.Provider>

            {/* 히트맵은 Puck 캔버스 위에 겹치는 별도 레이어 */}
            {heatmapEnabled ? (
              <HeatmapOverlay containerRef={canvasRef} summary={analytics} />
            ) : null}
          </div>
        </div>

      </div>

      {newPage ? (
        <NewPageDialog
          preset={newPage.preset}
          existingPaths={pages.map((p) => p.path)}
          onCancel={() => setNewPage(null)}
          onCreate={(result) => {
            setNewPage(null);
            createPage(result);
          }}
        />
      ) : null}
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

const leftTabBar: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--ks-edge)',
  flexShrink: 0,
};

const leftTabBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 0',
  background: 'none',
  border: 0,
  borderBottom: '2px solid transparent',
  color: '#8b95a7',
  fontSize: 12,
  cursor: 'pointer',
};

const panelHeader: React.CSSProperties = {
  padding: '14px 14px 10px',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: -0.3,
  borderBottom: '1px solid var(--ks-edge)',
};
