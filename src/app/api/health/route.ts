import { NextResponse } from 'next/server';
import { storageStatus } from '@/lib/server/storage';
import { isAuthConfigured } from '@/lib/server/auth';
import { hasAnyProvider, providerStatus } from '@/lib/translate/providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — 배포 직후 설정 상태를 한눈에 확인한다.
 * "왜 저장이 안 되지?" 를 로그 없이 진단하기 위한 엔드포인트.
 */
export async function GET() {
  const storage = storageStatus();
  const translation = providerStatus();

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    /* 어느 커밋이 떠 있는지 — "고쳤는데 안 보인다"가 배포 지연인지 진짜 버그인지
       추측하지 않고 판별하기 위한 정보다. */
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split('\n')[0] ?? null,
    },
    storage,
    features: {
      adminAuth: isAuthConfigured(),
      deepl: translation.deepl,
      googleTranslate: translation.google,
      /* 키 없이 쓰는 무료 경로 — 하나라도 켜져 있으면 자동번역이 살아 있다 */
      libreTranslate: translation.libretranslate,
      ollama: translation.ollama,
      tolgee: translation.tolgee,
      posthog: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      ga4: Boolean(process.env.NEXT_PUBLIC_GA4_ID),
      umami: Boolean(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && process.env.NEXT_PUBLIC_UMAMI_URL),
    },
    /* 배포 후 가장 먼저 해야 할 일을 순서대로 알려준다 */
    /* DB 관련 환경 변수가 어떤 이름으로 존재하는지 — 값은 노출하지 않고 유무만 */
    envSeen: {
      POSTGRES_URL: Boolean(process.env.POSTGRES_URL),
      DATABASE_URL: Boolean(process.env.DATABASE_URL),
      POSTGRES_PRISMA_URL: Boolean(process.env.POSTGRES_PRISMA_URL),
    },
    todo: [
      !storage.pages.readOnly ? null : 'Postgres 를 연결하고 POSTGRES_URL 을 설정하세요 (저장 불가 상태).',
      isAuthConfigured() ? null : 'ADMIN_PASSWORD 를 설정하세요 (관리자 화면 보호).',
      hasAnyProvider()
        ? null
        : '자동번역이 꺼져 있습니다. 무료로 쓰려면 LibreTranslate 를 띄우고 LIBRETRANSLATE_URL 을 설정하세요.',
    ].filter(Boolean),
  });
}
