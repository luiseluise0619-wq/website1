import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0d0f14', color: '#e6ebf5' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 64, margin: 0, fontWeight: 800 }}>404</h1>
        <p style={{ color: '#8b95a7', marginTop: 8 }}>요청하신 페이지가 아직 발행되지 않았습니다.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <Link href="/" style={linkStyle}>홈으로</Link>
          <Link href="/admin/editor" style={{ ...linkStyle, background: '#3b82f6', color: '#fff', border: 0 }}>
            에디터에서 만들기
          </Link>
        </div>
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 999,
  border: '1px solid #262d3a',
  color: 'inherit',
  textDecoration: 'none',
  fontSize: 14,
};
