'use client';

import { fetchJson } from '@/lib/fetchJson';
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
  return fetchJson<TranslateBatchOutput>('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
