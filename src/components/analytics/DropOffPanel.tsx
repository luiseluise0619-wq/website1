'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { PageAnalyticsSummary } from '@/types/analytics';

/* =============================================================================
 * Drop-off & Scroll Funnel 패널
 * "어디서 나가는가"를 두 각도로 보여준다:
 *   · 스크롤 퍼널 — 20/50/80/100% 도달률과 단계별 유지율
 *   · 섹션별 이탈 — 이 섹션을 마지막으로 보고 떠난 세션 비율
 * ========================================================================== */

/** 기간 선택 — 스토어의 heatmapRange 를 바꾸면 히트맵과 이 패널이 함께 다시 불러온다 */
const RANGES: Array<{ label: string; days: number }> = [
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
];

function rangeOf(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function RangePicker() {
  const range = useEditorStore((s) => s.heatmapRange);
  const setRange = useEditorStore((s) => s.setHeatmapRange);

  /* 지금 선택된 기간이 몇 일짜리인지 되짚어 표시한다 */
  const spanDays = Math.round(
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000,
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, opacity: 0.6 }}>기간</span>
      {RANGES.map((r) => {
        const on = spanDays === r.days;
        return (
          <button
            key={r.days}
            type="button"
            onClick={() => setRange(rangeOf(r.days))}
            style={{
              padding: '3px 9px',
              borderRadius: 999,
              border: `1px solid ${on ? '#3b82f6' : 'var(--puck-color-grey-09, #d1d5db)'}`,
              background: on ? 'rgba(59,130,246,.18)' : 'transparent',
              color: 'inherit',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export function DropOffPanel({ summary }: { summary: PageAnalyticsSummary | null }) {
  if (!summary) {
    return (
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <RangePicker />
        <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>분석 데이터를 불러오면 이탈 지점이 표시됩니다.</p>
      </div>
    );
  }

  const worst = summary.dropOff.reduce<null | (typeof summary.dropOff)[number]>(
    (acc, d) => (!acc || d.exitRate > acc.exitRate ? d : acc),
    null,
  );

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <RangePicker />
        <span style={{ fontSize: 10, opacity: 0.5 }}>
          {summary.range.from} ~ {summary.range.to}
        </span>
      </div>

      {/* --- 핵심 지표 --- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <Metric label="세션" value={summary.sessions.toLocaleString()} />
        <Metric label="이탈률" value={`${(summary.bounceRate * 100).toFixed(1)}%`} />
        <Metric label="평균 체류" value={formatMs(summary.avgTimeOnPageMs)} />
        <Metric label="총 클릭" value={summary.totalClicks.toLocaleString()} />
      </div>

      {/* --- 스크롤 퍼널 --- */}
      <section>
        <h4 style={h4}>스크롤 도달률</h4>
        {summary.scrollFunnel.map((step) => (
          <div key={step.threshold} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span>{step.threshold}% 지점</span>
              <span>
                <strong>{(step.rate * 100).toFixed(0)}%</strong>
                <span style={{ opacity: 0.55 }}> · {step.reached.toLocaleString()}세션</span>
              </span>
            </div>
            <div style={barTrack}>
              <div style={{ ...barFill, width: `${step.rate * 100}%`, background: '#3b82f6' }} />
            </div>
            {/* 단계별 유지율이 급락하는 지점이 진짜 이탈 구간이다 */}
            {step.stepRetention < 0.7 ? (
              <div style={{ fontSize: 10, color: '#f97316', marginTop: 2 }}>
                ↓ 이전 단계 대비 {((1 - step.stepRetention) * 100).toFixed(0)}% 이탈
              </div>
            ) : null}
          </div>
        ))}
      </section>

      {/* --- 섹션별 이탈 --- */}
      <section>
        <h4 style={h4}>섹션별 이탈 지점</h4>
        {worst ? (
          <div style={{ fontSize: 11, background: '#fff7ed', color: '#9a3412', padding: '6px 8px', borderRadius: 6, marginBottom: 8 }}>
            가장 많이 이탈하는 지점: <strong>{worst.sectionName ?? worst.sectionId}</strong> ({(worst.exitRate * 100).toFixed(0)}%)
          </div>
        ) : null}
        {summary.dropOff.map((d) => (
          <div key={d.sectionId} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
                {d.sectionName ?? d.sectionId}
              </span>
              <span>
                <strong>{(d.exitRate * 100).toFixed(0)}%</strong>
                <span style={{ opacity: 0.55 }}> · {formatMs(d.avgDwellMs)}</span>
              </span>
            </div>
            <div style={barTrack}>
              <div
                style={{
                  ...barFill,
                  width: `${Math.min(100, d.exitRate * 100)}%`,
                  background: d.exitRate > 0.3 ? '#ef4444' : '#f59e0b',
                }}
              />
            </div>
          </div>
        ))}
      </section>

      {/* --- 언어별 분포 --- */}
      {summary.localeBreakdown.length ? (
        <section>
          <h4 style={h4}>언어별 방문</h4>
          {summary.localeBreakdown.map((l) => (
            <div key={l.locale} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
              <span>{l.locale.toUpperCase()}</span>
              <span>
                <strong>{(l.share * 100).toFixed(0)}%</strong>
                <span style={{ opacity: 0.55 }}> · {l.sessions.toLocaleString()}</span>
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f4f6fa', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

const h4: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6, margin: '0 0 8px' };
const barTrack: React.CSSProperties = { height: 6, background: '#e8ecf3', borderRadius: 3, overflow: 'hidden' };
const barFill: React.CSSProperties = { height: '100%', borderRadius: 3, transition: 'width .3s ease' };
