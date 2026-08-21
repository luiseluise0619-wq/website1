import { Inter, Noto_Sans_JP, Noto_Sans_KR, Noto_Sans_SC, Noto_Sans_Thai } from 'next/font/google';

/* =============================================================================
 * 폰트 로딩
 * -----------------------------------------------------------------------------
 * 스타일 인스펙터의 폰트 목록이 실제로 동작하려면 폰트가 로드돼 있어야 한다.
 * 특히 태국어·일본어·중국어는 한국어 폰트에 글리프가 없어, 로드하지 않으면
 * 시스템 기본 폰트로 떨어지며 자간·굵기가 디자인과 달라진다.
 *
 * CJK 폰트는 용량이 크므로:
 *   · variable 로 CSS 변수만 심고, 실제 사용은 로케일별 body 클래스가 결정한다
 *   · display: 'swap' 으로 폰트 대기 중에도 텍스트가 보이게 한다
 * ========================================================================== */

export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const notoKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-noto-kr',
  preload: true,
});

export const notoThai = Noto_Sans_Thai({
  subsets: ['thai'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-noto-thai',
  // 태국어 방문자에게만 필요하므로 기본 프리로드는 하지 않는다
  preload: false,
});

export const notoJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-noto-jp',
  preload: false,
});

export const notoSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-noto-sc',
  preload: false,
});

/** <body> 에 붙일 클래스 — 모든 폰트의 CSS 변수를 한 번에 심는다 */
export const fontVariables = [
  inter.variable,
  notoKR.variable,
  notoThai.variable,
  notoJP.variable,
  notoSC.variable,
].join(' ');
