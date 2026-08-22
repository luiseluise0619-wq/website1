import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_ORDER, isLocale, parseAcceptLanguage } from '@/lib/i18n';

/* =============================================================================
 * /admin 보호 + 방문자 언어 헤더
 * -----------------------------------------------------------------------------
 * 미들웨어는 Edge 런타임이라 node:crypto 를 쓸 수 없다. 그래서 여기서는
 * "세션 쿠키가 있는가"만 저렴하게 확인하고, 서명 검증은 실제 페이지/라우트가
 * (Node 런타임에서) 수행한다. 이 계층은 인증이 아니라 리다이렉트 편의다.
 * ========================================================================== */

const SESSION_COOKIE = 'ksoho_admin';

/** 루트 레이아웃이 <html lang> 을 서버에서 정하도록 방문자 언어를 실어 준다 */
export const LOCALE_HEADER = 'x-ksoho-locale';

/**
 * 레이아웃에서는 ?lang= 을 볼 수 없다(searchParams 는 페이지에만 전달된다).
 * 그래서 미들웨어가 대신 읽어 헤더로 넘긴다. 이게 없으면 ?lang=en 으로 들어온
 * 영어 페이지가 <html lang="ko"> 로 나가, hreflang 이 약속한 언어와 어긋난다.
 * 판정 순서는 app/[[...slug]]/page.tsx 의 resolveLocale 과 같아야 한다.
 *
 * 한계: 여기서는 페이지별 노출 언어(enabledLocales)를 알 수 없다(Edge 라 DB 를
 * 읽지 못한다). 그래서 제한된 페이지에 ?lang= 으로 들어오면 페이지 쪽에서 보여
 * 줄 언어로 307 을 보낸다. 쿠키·Accept-Language 로 어긋난 경우는 본문이 폴백
 * 언어로 나가고 <html lang> 은 하이드레이션 뒤 PageRenderer 가 맞춘다.
 */
function visitorLocale(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('lang') ?? request.nextUrl.searchParams.get('locale');
  if (isLocale(param)) return param;
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return parseAcceptLanguage(request.headers.get('accept-language'), LOCALE_ORDER) ?? DEFAULT_LOCALE;
}

function withLocaleHeader(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, visitorLocale(request));
  return NextResponse.next({ request: { headers } });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return withLocaleHeader(request);
  }

  /* 로컬 개발(비밀번호 미설정)에서는 인증이 면제된다.
     이 조건을 빠뜨리면 로그인 페이지는 "면제니까 에디터로", 미들웨어는
     "쿠키 없으니 로그인으로" 를 반복해 무한 리다이렉트가 된다.
     lib/server/auth.ts 의 authDisabledForDev() 와 같은 판정을 유지해야 한다. */
  const authConfigured = Boolean(process.env.ADMIN_PASSWORD);
  const isProduction = process.env.NODE_ENV === 'production';
  if (!authConfigured && !isProduction) return withLocaleHeader(request);

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return withLocaleHeader(request);

  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  /* 정적 파일과 API 를 뺀 모든 페이지 — 언어 헤더가 페이지 전부에 필요하다.
     (/api 는 요청을 스스로 파싱하므로 제외해 오버헤드를 줄인다) */
  matcher: ['/((?!api|_next/static|_next/image|favicon.svg|robots.txt|sitemap.xml).*)'],
};
