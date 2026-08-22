import type { Metadata } from 'next';
import { fontVariables } from '@/lib/fonts';
import { siteUrl } from '@/lib/siteUrl';
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
  return (
    <html lang="ko" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
