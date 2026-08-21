'use client';

import React from 'react';
import { SeoPanel } from './SeoPanel';
import { DropOffPanel } from '@/components/analytics/DropOffPanel';
import type { PageAnalyticsSummary } from '@/types/analytics';

/* =============================================================================
 * 통합 우측 패널
 * -----------------------------------------------------------------------------
 * Puck 의 `fields` 오버라이드로 주입된다. 즉 이 컴포넌트가 곧 Puck 의 우측
 * 사이드바 전체이며, 스타일 인스펙터(children)와 SEO/분석 탭이 한 컬럼에 모인다.
 * (별도 aside 를 두면 "진짜 편집기"가 가운데로 밀려 보이지 않는다)
 * ========================================================================== */

export type RightTab = 'style' | 'seo' | 'analytics';

export interface RightPanelProps {
  /** Puck 이 렌더한 선택 요소의 필드들 = 스타일 인스펙터 */
  children: React.ReactNode;
  isLoading?: boolean;
  /** 선택된 요소가 없으면 null — 안내 문구를 대신 보여준다 */
  hasSelection: boolean;
  analytics: PageAnalyticsSummary | null;
}

export function RightPanel({ children, isLoading, hasSelection, analytics }: RightPanelProps) {
  const [tab, setTab] = React.useState<RightTab>('style');

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
            onClick={() => setTab(key)}
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
          {hasSelection ? (
            children
          ) : (
            <EmptyState isLoading={isLoading} />
          )}
        </div>

        {tab === 'seo' ? <SeoPanel /> : null}
        {tab === 'analytics' ? <DropOffPanel summary={analytics} /> : null}
      </div>
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
