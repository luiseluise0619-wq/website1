'use client';

import React from 'react';

export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? '로그인에 실패했습니다.');
      // 쿠키가 심어진 뒤 서버 컴포넌트를 새로 받아야 하므로 전체 이동
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={card}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.4 }}>K-SOHO GLOBAL</h1>
        <p style={{ fontSize: 13, color: '#8b95a7', margin: '6px 0 20px' }}>관리자 에디터에 접속합니다.</p>

        {!configured ? (
          <div style={warn}>
            <strong>ADMIN_PASSWORD 가 설정되지 않았습니다.</strong>
            <br />
            배포 환경 변수에 관리자 비밀번호를 추가한 뒤 다시 시도하세요.
          </div>
        ) : null}

        <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>비밀번호</label>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          disabled={!configured || busy}
          style={input}
        />

        {error ? <div style={errBox}>{error}</div> : null}

        <button type="submit" disabled={!configured || busy || !password} style={button}>
          {busy ? '확인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#0d0f14',
  color: '#e6ebf5',
  padding: 24,
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  background: '#151922',
  border: '1px solid #262d3a',
  borderRadius: 14,
  padding: 28,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #262d3a',
  background: '#1b2029',
  color: 'inherit',
  fontSize: 14,
  marginBottom: 14,
};

const button: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 8,
  border: 0,
  background: '#3b82f6',
  color: '#fff',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const errBox: React.CSSProperties = {
  background: 'rgba(239,68,68,.12)',
  color: '#fca5a5',
  border: '1px solid rgba(239,68,68,.35)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 12,
  marginBottom: 12,
};

const warn: React.CSSProperties = {
  background: 'rgba(245,158,11,.12)',
  color: '#fcd34d',
  border: '1px solid rgba(245,158,11,.35)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 12,
  lineHeight: 1.6,
  marginBottom: 16,
};
