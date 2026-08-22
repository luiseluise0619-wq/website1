'use client';

import React from 'react';
import Link from 'next/link';

/* =============================================================================
 * 런타임 오류 화면
 * -----------------------------------------------------------------------------
 * 이 파일이 없으면 Next 의 기본 오류 페이지가 뜬다 — 영어에, 방문자가 할 수
 * 있는 일이 없다. 대부분의 원인은 저장소 연결(POSTGRES_URL)이므로 그 힌트를
 * 함께 보여 주고, 다시 시도할 방법을 준다.
 * ========================================================================== */

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // 서버 로그에만 남는 digest 와 짝을 맞추기 위해 브라우저 콘솔에도 남긴다
    console.error('[k-soho] 페이지 오류', error.digest ?? '', error.message);
  }, [error]);

  return (
    <div style={shell}>
      <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
        <h1 style={{ fontSize: 42, margin: 0, fontWeight: 800 }}>문제가 생겼습니다</h1>
        <p style={{ color: '#8b95a7', marginTop: 10, lineHeight: 1.7 }}>
          페이지를 불러오는 중 오류가 발생했습니다.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>

        {error.digest ? (
          <p style={{ color: '#4b5563', fontSize: 12, marginTop: 8 }}>오류 코드: {error.digest}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22 }}>
          <button type="button" onClick={reset} style={{ ...linkStyle, background: '#1d4ed8', color: '#fff', border: 0, cursor: 'pointer' }}>
            다시 시도
          </button>
          <Link href="/" style={linkStyle}>
            홈으로
          </Link>
        </div>

        <p style={{ color: '#4b5563', fontSize: 12, marginTop: 24, lineHeight: 1.6 }}>
          관리자라면 <code style={code}>/api/health</code> 에서 저장소 연결 상태를 확인하세요.
        </p>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: '#0d0f14',
  color: '#e6ebf5',
};

const linkStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 999,
  border: '1px solid #262d3a',
  color: 'inherit',
  textDecoration: 'none',
  fontSize: 14,
};

const code: React.CSSProperties = {
  background: '#151922',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 11,
};
