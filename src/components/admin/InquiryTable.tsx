'use client';

import React from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/fetchJson';
import type { InquiryRecord } from '@/lib/server/storage/types';

/* =============================================================================
 * 문의 관리 화면
 * -----------------------------------------------------------------------------
 * BUSINESS 폼(Buyer/Distribution/Partnership/Media)으로 들어온 접수를 읽고,
 * 처리 상태를 바꾸고, 영업팀에 넘길 CSV 로 내보낸다.
 * 접수만 받고 볼 곳이 없으면 폼은 있으나 마나다.
 * ========================================================================== */

type StatusFilter = 'all' | InquiryRecord['status'];

const STATUS_LABEL: Record<InquiryRecord['status'], string> = {
  new: '신규',
  read: '확인함',
  archived: '보관',
};

const STATUS_COLOR: Record<InquiryRecord['status'], string> = {
  new: '#3b82f6',
  read: '#22c55e',
  archived: '#6b7280',
};

export interface InquiryTableProps {
  initial: InquiryRecord[];
  storage: { inquiries: { driver: string; readOnly: boolean }; hint?: string };
}

export function InquiryTable({ initial, storage }: InquiryTableProps) {
  const [rows, setRows] = React.useState(initial);
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [formName, setFormName] = React.useState<string>('all');
  const [query, setQuery] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const forms = React.useMemo(
    () => [...new Set(rows.map((r) => r.formName))].sort(),
    [rows],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (formName !== 'all' && r.formName !== formName) return false;
      if (!q) return true;
      /* 회사명·담당자·이메일 어디에 들어 있든 찾히게 값 전체를 훑는다 */
      return Object.values(r.fields).some((v) => v.toLowerCase().includes(q)) || r.path.includes(q);
    });
  }, [rows, status, formName, query]);

  const counts = React.useMemo(
    () => ({
      all: rows.length,
      new: rows.filter((r) => r.status === 'new').length,
      read: rows.filter((r) => r.status === 'read').length,
      archived: rows.filter((r) => r.status === 'archived').length,
    }),
    [rows],
  );

  const changeStatus = async (id: string, next: InquiryRecord['status']) => {
    const before = rows;
    // 낙관적 반영 — 실패하면 되돌린다
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: next } : r)));
    setError(null);
    try {
      await fetchJson('/api/inquiry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
    } catch (err) {
      setRows(before);
      setError(err instanceof Error ? err.message : '상태를 바꾸지 못했습니다.');
    }
  };

  const exportCsv = () => {
    /* 필드 구성은 폼마다 다르므로 나타난 열을 모아 헤더를 만든다 */
    const keys = [...new Set(visible.flatMap((r) => Object.keys(r.fields)))];
    const header = ['접수일시', '폼', '상태', '국가', '언어', '경로', ...keys];
    const lines = visible.map((r) => [
      r.createdAt,
      r.formName,
      STATUS_LABEL[r.status],
      r.country ?? '',
      r.locale,
      r.path,
      ...keys.map((k) => r.fields[k] ?? ''),
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    // 엑셀이 UTF-8 을 알아보도록 BOM 을 붙인다 (없으면 한글이 깨진다)
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inquiries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={shell}>
      <header style={head}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong style={{ fontSize: 15 }}>문의 관리</strong>
          <span style={{ fontSize: 12, color: 'var(--ks-muted)' }}>
            {storage.inquiries.driver}
            {storage.inquiries.readOnly ? ' · 읽기 전용' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={exportCsv} style={btn} disabled={!visible.length}>
            CSV 내보내기 ({visible.length})
          </button>
          <Link href="/admin/editor" style={{ ...btn, textDecoration: 'none' }}>
            에디터로
          </Link>
        </div>
      </header>

      {storage.inquiries.readOnly ? (
        <p style={banner}>
          <strong>읽기 전용 배포</strong> — {storage.hint ?? '데이터베이스가 연결되지 않아 접수가 저장되지 않습니다.'}
        </p>
      ) : null}
      {error ? <p style={{ ...banner, borderColor: '#7f1d1d', color: '#fecaca' }}>{error}</p> : null}

      <div style={filters}>
        {(['all', 'new', 'read', 'archived'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            style={{
              ...chip,
              background: status === key ? 'var(--ks-accent)' : 'transparent',
              color: status === key ? '#fff' : 'inherit',
            }}
          >
            {key === 'all' ? '전체' : STATUS_LABEL[key]} {counts[key]}
          </button>
        ))}

        <select value={formName} onChange={(e) => setFormName(e.target.value)} style={select}>
          <option value="all">모든 폼</option>
          {forms.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="회사명·담당자·이메일 검색"
          style={input}
        />
      </div>

      {visible.length === 0 ? (
        <p style={{ padding: 32, textAlign: 'center', color: 'var(--ks-muted)', fontSize: 13 }}>
          {rows.length ? '조건에 맞는 문의가 없습니다.' : '아직 접수된 문의가 없습니다.'}
        </p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              {['접수', '폼', '요약', '국가', '경로', '상태'].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <React.Fragment key={r.id}>
                <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={tr}>
                  <td style={td}>{formatDate(r.createdAt)}</td>
                  <td style={td}>{r.formName}</td>
                  <td style={{ ...td, maxWidth: 380 }}>{summarize(r)}</td>
                  <td style={td}>{r.country ?? '-'}</td>
                  <td style={{ ...td, color: 'var(--ks-muted)' }}>{r.path}</td>
                  <td style={td}>
                    <span style={{ ...badge, background: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  </td>
                </tr>
                {openId === r.id ? (
                  <tr>
                    <td colSpan={6} style={detailCell}>
                      <dl style={detailList}>
                        {Object.entries(r.fields).map(([k, v]) => (
                          <React.Fragment key={k}>
                            <dt style={dt}>{k}</dt>
                            <dd style={dd}>{v}</dd>
                          </React.Fragment>
                        ))}
                        {r.utm ? (
                          <>
                            <dt style={dt}>utm</dt>
                            <dd style={dd}>{Object.entries(r.utm).map(([k, v]) => `${k}=${v}`).join(' · ')}</dd>
                          </>
                        ) : null}
                      </dl>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        {(['new', 'read', 'archived'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={r.status === s || storage.inquiries.readOnly}
                            onClick={() => changeStatus(r.id, s)}
                            style={{ ...chip, opacity: r.status === s ? 0.4 : 1 }}
                          >
                            {STATUS_LABEL[s]}(으)로
                          </button>
                        ))}
                        {r.fields.email ? (
                          <a href={`mailto:${r.fields.email}`} style={{ ...chip, textDecoration: 'none' }}>
                            메일 회신
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 목록 한 줄에 보여 줄 대표 값 — 폼마다 필드 이름이 다르므로 우선순위로 고른다 */
function summarize(r: InquiryRecord): string {
  const preferred = ['company', 'name', 'email', 'message'];
  const picked = preferred.map((k) => r.fields[k]).filter(Boolean);
  const rest = picked.length ? picked : Object.values(r.fields);
  return rest.join(' · ').slice(0, 90);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---- 스타일 ----------------------------------------------------------------- */

const shell: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--ks-ink)',
  color: '#e5e7eb',
  fontSize: 13,
};
const head: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel)',
};
const banner: React.CSSProperties = {
  margin: '12px 16px 0',
  padding: '10px 12px',
  border: '1px solid #92400e',
  borderRadius: 8,
  background: 'rgba(146,64,14,.15)',
  color: '#fcd34d',
  fontSize: 12,
};
const filters: React.CSSProperties = { display: 'flex', gap: 8, padding: 16, flexWrap: 'wrap', alignItems: 'center' };
const btn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel2)',
  color: '#e5e7eb',
  fontSize: 12,
  cursor: 'pointer',
};
const chip: React.CSSProperties = { ...btn, padding: '5px 10px' };
const select: React.CSSProperties = { ...btn, padding: '6px 8px' };
const input: React.CSSProperties = { ...btn, minWidth: 220, cursor: 'text' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid var(--ks-edge)',
  color: 'var(--ks-muted)',
  fontSize: 11,
  fontWeight: 600,
};
const tr: React.CSSProperties = { cursor: 'pointer', borderBottom: '1px solid rgba(38,45,58,.6)' };
const td: React.CSSProperties = { padding: '9px 12px', verticalAlign: 'top' };
const badge: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 11, color: '#fff' };
const detailCell: React.CSSProperties = { padding: '12px 16px 16px', background: 'var(--ks-panel)' };
const detailList: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '6px 16px',
  margin: 0,
};
const dt: React.CSSProperties = { color: 'var(--ks-muted)', fontSize: 12 };
const dd: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap' };
