'use client';

import React from 'react';
import { usePuck } from '@puckeditor/core';
import { SeoPanel } from './SeoPanel';
import { FieldRenderer } from './FieldRenderer';
import { DropOffPanel } from '@/components/analytics/DropOffPanel';
import { useEditorStore, type RightTab } from '@/store/editorStore';
import { puckConfig } from '@/puck/config';
import type { PageAnalyticsSummary } from '@/types/analytics';

/* =============================================================================
 * 통합 우측 패널
 * -----------------------------------------------------------------------------
 * Puck 의 `fields` 오버라이드로 주입된다. 즉 이 컴포넌트가 곧 Puck 의 우측
 * 사이드바 전체이며, 스타일 인스펙터(children)와 SEO/분석 탭이 한 컬럼에 모인다.
 * (별도 aside 를 두면 "진짜 편집기"가 가운데로 밀려 보이지 않는다)
 * ========================================================================== */

export type { RightTab };

export interface RightPanelProps {
  /** Puck 이 렌더한 선택 요소의 필드들 = 스타일 인스펙터 */
  children: React.ReactNode;
  isLoading?: boolean;
  /** 선택된 요소가 없으면 null — 안내 문구를 대신 보여준다 */
  hasSelection: boolean;
  analytics: PageAnalyticsSummary | null;
  /* 탭 상태는 바깥이 쥔다: '분석' 을 열었을 때 EditorShell 이 집계를 불러와야 하는데,
     여기에 가둬 두면 그 사실을 알 방법이 없어 패널이 영원히 빈 채로 남는다. */
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
}

export function RightPanel({ children, isLoading, hasSelection, analytics, tab, onTabChange }: RightPanelProps) {

  return (
    <div style={shell}>
      <div style={tabBar}>
        {(
          [
            ['style', '스타일'],
            ['seo', 'SEO'],
            ['analytics', '분석'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            style={{
              ...tabBtn,
              color: tab === key ? 'var(--puck-color-black, #111827)' : 'var(--puck-color-grey-05, #6b7280)',
              borderBottomColor: tab === key ? 'var(--puck-color-azure-05, #3b82f6)' : 'transparent',
              fontWeight: tab === key ? 700 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={body}>
        {/* 스타일 탭은 항상 마운트를 유지한다 — 탭을 옮겨도 편집 중이던
            필드의 포커스/스크롤 위치가 날아가지 않게 하기 위함 */}
        <div style={{ display: tab === 'style' ? 'block' : 'none' }}>
          {/* 아무것도 선택하지 않았을 때 Puck 이 children 으로 주는 것은
              '페이지 전체 설정'(배경색·기본 폰트)이다. 예전에는 그것을 통째로
              가리고 안내문만 띄워, 페이지 설정을 바꿀 방법이 아예 없었다. */}
          <FreeElementInspector
            fallback={
              hasSelection ? (
                children
              ) : (
                <>
                  <PageSettingsHeader />
                  {children}
                  <EmptyState isLoading={isLoading} />
                </>
              )
            }
          />
        </div>

        {tab === 'seo' ? <SeoPanel /> : null}
        {tab === 'analytics' ? <AnalyticsTab summary={analytics} /> : null}
      </div>
    </div>
  );
}

/**
 * 분석 탭 — 불러오는 중과 실패를 구분해 보여 준다.
 * 예전에는 둘 다 "데이터를 불러오면…" 이라고만 떠서, 401 이나 DB 오류가
 * 나도 그냥 데이터가 없는 것처럼 보였다.
 */
function AnalyticsTab({ summary }: { summary: PageAnalyticsSummary | null }) {
  const loading = useEditorStore((s) => s.analyticsLoading);
  const error = useEditorStore((s) => s.analyticsError);

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#b91c1c', lineHeight: 1.6 }}>
        <strong>분석 데이터를 불러오지 못했습니다</strong>
        <p style={{ margin: '6px 0 0', color: '#7f1d1d' }}>{error}</p>
      </div>
    );
  }

  if (loading && !summary) {
    return <div style={{ padding: 16, fontSize: 12, opacity: 0.6 }}>분석 데이터를 불러오는 중…</div>;
  }

  return <DropOffPanel summary={summary} />;
}

/**
 * 자유 배치 요소가 선택돼 있으면 그 요소의 필드를 직접 그린다.
 * Puck 인스펙터는 중첩 항목을 표시하지 못해 부모 캔버스를 계속 보여주기 때문이다.
 */
function FreeElementInspector({ fallback }: { fallback: React.ReactNode }) {
  const pickedId = useEditorStore((s) => s.pickedElementId);
  const { getItemById, getSelectorForId, dispatch, appState } = usePuck();

  const item = React.useMemo(
    () => (pickedId ? getItemById(pickedId) : undefined),
    // appState 를 의존성에 두어야 값이 바뀔 때 다시 읽는다
    [pickedId, getItemById, appState.data],
  );

  const update = React.useCallback(
    (key: string, value: unknown) => {
      if (!pickedId || !item) return;
      const selector = getSelectorForId(pickedId);
      if (!selector) return;
      dispatch({
        type: 'replace',
        destinationIndex: selector.index,
        destinationZone: selector.zone,
        data: { ...item, props: { ...item.props, [key]: value } },
      });
    },
    [pickedId, item, getSelectorForId, dispatch],
  );

  if (!pickedId || !item) return <>{fallback}</>;

  const config = puckConfig.components[item.type as keyof typeof puckConfig.components];
  if (!config?.fields) return <>{fallback}</>;

  return (
    <div>
      <div style={selectedHeader}>
        <span style={{ fontWeight: 700 }}>{String(item.type)}</span>
        <span style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: 10 }}>{pickedId}</span>
      </div>
      <FieldRenderer
        fields={config.fields as never}
        values={item.props as Record<string, unknown>}
        onChange={update}
      />
    </div>
  );
}

const selectedHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '9px 14px',
  fontSize: 12,
  borderBottom: '1px solid var(--puck-color-grey-09, #e5e7eb)',
  background: 'var(--puck-color-azure-11, #eff6ff)',
  color: 'var(--puck-color-azure-04, #1d4ed8)',
};

/** 선택이 없을 때 아래 필드가 '페이지 전체' 설정임을 알려 준다 */
function PageSettingsHeader() {
  return (
    <div style={{ padding: '12px 14px 0' }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--puck-color-black, #111827)' }}>
        페이지 전체 설정
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.65 }}>
        배경색과 기본 폰트는 이 페이지의 모든 블록에 적용됩니다.
      </p>
    </div>
  );
}

function EmptyState({ isLoading }: { isLoading?: boolean }) {
  if (isLoading) return <div style={hint}>불러오는 중…</div>;
  return (
    <div style={hint}>
      <p style={{ margin: '0 0 12px', fontWeight: 600, color: 'var(--puck-color-black, #111827)' }}>
        요소를 선택하세요
      </p>
      <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.9 }}>
        <li>캔버스에서 요소를 클릭하면 여기에 <b>스타일 인스펙터</b>가 열립니다 (색상·폰트·여백·테두리).</li>
        <li>왼쪽 블록 목록에서 캔버스로 <b>드래그</b>해 새 요소를 추가합니다.</li>
        <li><b>자유 캔버스</b> 안에서는 X/Y/Z 좌표로 자유 배치됩니다.</li>
        <li>텍스트는 언어별로 저장됩니다. 상단에서 편집 언어를 바꾸세요.</li>
        <li><b>추적 ID</b> 를 지정하면 요소를 옮겨도 히트맵 기록이 이어집니다.</li>
      </ul>
    </div>
  );
}

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: 'var(--puck-color-white, #fff)',
};

const tabBar: React.CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  borderBottom: '1px solid var(--puck-color-grey-09, #e5e7eb)',
  background: 'var(--puck-color-grey-12, #fafafa)',
};

const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: '11px 6px',
  border: 0,
  borderBottom: '2px solid transparent',
  background: 'transparent',
  fontSize: 12,
  cursor: 'pointer',
};

const body: React.CSSProperties = { flex: 1, overflowY: 'auto', minHeight: 0 };

const hint: React.CSSProperties = {
  padding: '18px 16px',
  fontSize: 12,
  color: 'var(--puck-color-grey-04, #6b7280)',
  lineHeight: 1.8,
};
