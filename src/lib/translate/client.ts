'use client';

import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * 번역 API 클라이언트 (브라우저 → /api/translate)
 * API 키는 절대 클라이언트로 내려오지 않는다 — 서버 라우트가 대신 호출한다.
 * ========================================================================== */

export interface TranslateBatchInput {
  texts: string[];
  source: LocaleCode;
  targets: LocaleCode[];
  html?: boolean;
}

export type TranslateBatchOutput = Partial<Record<LocaleCode, string[]>> & {
  _provider: 'deepl' | 'google' | 'tolgee' | 'none';
};

export async function translateBatch(input: TranslateBatchInput): Promise<TranslateBatchOutput> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `번역 요청 실패 (${res.status})`);
  }
  return (await res.json()) as TranslateBatchOutput;
}
