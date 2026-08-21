import { NextResponse, type NextRequest } from 'next/server';

/* =============================================================================
 * /admin 보호
 * -----------------------------------------------------------------------------
 * 미들웨어는 Edge 런타임이라 node:crypto 를 쓸 수 없다. 그래서 여기서는
 * "세션 쿠키가 있는가"만 저렴하게 확인하고, 서명 검증은 실제 페이지/라우트가
 * (Node 런타임에서) 수행한다. 이 계층은 인증이 아니라 리다이렉트 편의다.
 * ========================================================================== */

const SESSION_COOKIE = 'ksoho_admin';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*'],
};
