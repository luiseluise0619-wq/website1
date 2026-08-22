'use client';

import React from 'react';

/* =============================================================================
 * 루트 레이아웃 자체가 실패했을 때의 최후 화면.
 * error.tsx 는 레이아웃 안에서 렌더되므로 레이아웃이 깨지면 쓸 수 없다.
 * 이 컴포넌트는 <html>/<body> 를 직접 그린다.
 * ========================================================================== */

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error('[k-soho] 전역 오류', error.digest ?? '', error.message);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#0d0f14', color: '#e6ebf5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
          <div>
            <h1 style={{ fontSize: 36, margin: 0 }}>사이트를 불러오지 못했습니다</h1>
            <p style={{ color: '#8b95a7', marginTop: 10 }}>
              잠시 후 다시 시도해 주세요.
              {error.digest ? <><br />오류 코드: {error.digest}</> : null}
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 18, padding: '10px 18px', borderRadius: 999, border: 0, background: '#1d4ed8', color: '#fff', fontSize: 14, cursor: 'pointer' }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
