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

  /* 로컬 개발(비밀번호 미설정)에서는 인증이 면제된다.
     이 조건을 빠뜨리면 로그인 페이지는 "면제니까 에디터로", 미들웨어는
     "쿠키 없으니 로그인으로" 를 반복해 무한 리다이렉트가 된다.
     lib/server/auth.ts 의 authDisabledForDev() 와 같은 판정을 유지해야 한다. */
  const authConfigured = Boolean(process.env.ADMIN_PASSWORD);
  const isProduction = process.env.NODE_ENV === 'production';
  if (!authConfigured && !isProduction) return NextResponse.next();

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
