import { NextResponse } from 'next/server';
import { storageStatus } from '@/lib/server/storage';
import { isAuthConfigured } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — 배포 직후 설정 상태를 한눈에 확인한다.
 * "왜 저장이 안 되지?" 를 로그 없이 진단하기 위한 엔드포인트.
 */
export async function GET() {
  const storage = storageStatus();

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    storage,
    features: {
      adminAuth: isAuthConfigured(),
      deepl: Boolean(process.env.DEEPL_API_KEY),
      googleTranslate: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY),
      tolgee: Boolean(process.env.TOLGEE_API_KEY),
      posthog: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      ga4: Boolean(process.env.NEXT_PUBLIC_GA4_ID),
      umami: Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID),
    },
    /* 배포 후 가장 먼저 해야 할 일을 순서대로 알려준다 */
    todo: [
      !storage.pages.readOnly ? null : 'Postgres 를 연결하고 POSTGRES_URL 을 설정하세요 (저장 불가 상태).',
      isAuthConfigured() ? null : 'ADMIN_PASSWORD 를 설정하세요 (관리자 화면 보호).',
      process.env.DEEPL_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY ? null : '번역 API 키가 없어 자동번역이 비활성화됩니다.',
    ].filter(Boolean),
  });
}
