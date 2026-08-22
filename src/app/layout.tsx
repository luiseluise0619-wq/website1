import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { fontVariables } from '@/lib/fonts';
import { siteUrl } from '@/lib/siteUrl';
import { DEFAULT_LOCALE, LOCALES, isLocale } from '@/lib/i18n';
import { LOCALE_HEADER } from '@/middleware';
import './globals.css';

export const metadata: Metadata = {
  /* canonical·hreflang·og:image 는 절대 URL 이어야 한다. 이 값을 지정하면
     각 페이지가 돌려주는 상대 경로를 Next 가 절대 URL 로 승격시킨다. */
  metadataBase: new URL(siteUrl()),
  title: { default: 'K-SOHO GLOBAL', template: '%s | K-SOHO GLOBAL' },
  description: '대한민국 소상공인 브랜드의 글로벌 커머스 플랫폼',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /* 미들웨어가 넣어 준 방문자 언어. 하드코딩하면 ?lang=en 페이지가
     <html lang="ko"> 로 나가 스크린리더·번역기·검색엔진이 언어를 잘못 읽는다. */
  const header = headers().get(LOCALE_HEADER);
  const locale = isLocale(header) ? header : DEFAULT_LOCALE;

  return (
    <html lang={LOCALES[locale].bcp47} className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
