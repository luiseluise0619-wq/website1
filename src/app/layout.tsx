import type { Metadata } from 'next';
import { fontVariables } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'K-SOHO GLOBAL', template: '%s | K-SOHO GLOBAL' },
  description: '대한민국 소상공인 브랜드의 글로벌 커머스 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
