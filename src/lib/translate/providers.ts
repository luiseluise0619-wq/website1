import 'server-only';
import { LOCALES } from '@/lib/i18n';
import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * Translation Providers (서버 전용)
 * -----------------------------------------------------------------------------
 * 우선순위: DeepL → Google → Tolgee(플랫폼 자체 MT) → 실패
 * DeepL 은 한국어/일본어/중국어 품질이 가장 좋지만 태국어·베트남어를 지원하지
 * 않는다. 그래서 언어별로 자동 폴백한다 (LOCALES[x].deeplCode === null).
 * ========================================================================== */

export type ProviderName = 'deepl' | 'google' | 'tolgee' | 'none';

export interface TranslateRequest {
  texts: string[];
  source: LocaleCode;
  target: LocaleCode;
  /** HTML 태그를 보존할지 — 리치텍스트 요소는 true */
  html?: boolean;
}

export interface TranslateResult {
  texts: string[];
  provider: ProviderName;
}

export class TranslationError extends Error {
  constructor(message: string, readonly provider: ProviderName, readonly status?: number) {
    super(message);
    this.name = 'TranslationError';
  }
}

/* ---- DeepL ---------------------------------------------------------------- */

async function translateWithDeepL(req: TranslateRequest): Promise<TranslateResult> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new TranslationError('DEEPL_API_KEY 미설정', 'deepl');
  const targetCode = LOCALES[req.target].deeplCode;
  if (!targetCode) throw new TranslationError(`DeepL 미지원 언어: ${req.target}`, 'deepl');

  // 무료 키는 ':fx' 접미사를 가지며 엔드포인트가 다르다
  const endpoint = key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: req.texts,
      source_lang: LOCALES[req.source].deeplCode ?? undefined,
      target_lang: targetCode,
      tag_handling: req.html ? 'html' : undefined,
      // 마케팅 카피는 격식체가 자연스럽다 (지원 언어에서만 적용됨)
      formality: 'prefer_more',
    }),
  });

  if (!res.ok) throw new TranslationError(`DeepL ${res.status}: ${await safeText(res)}`, 'deepl', res.status);
  const json = (await res.json()) as { translations: Array<{ text: string }> };
  return { texts: json.translations.map((tr) => tr.text), provider: 'deepl' };
}

/* ---- Google Cloud Translation --------------------------------------------- */

async function translateWithGoogle(req: TranslateRequest): Promise<TranslateResult> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new TranslationError('GOOGLE_TRANSLATE_API_KEY 미설정', 'google');

  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: req.texts,
      source: LOCALES[req.source].googleCode,
      target: LOCALES[req.target].googleCode,
      format: req.html ? 'html' : 'text',
    }),
  });

  if (!res.ok) throw new TranslationError(`Google ${res.status}: ${await safeText(res)}`, 'google', res.status);
  const json = (await res.json()) as { data: { translations: Array<{ translatedText: string }> } };
  return { texts: json.data.translations.map((tr) => tr.translatedText), provider: 'google' };
}

/* ---- Tolgee (플랫폼 자체 MT 프록시) ---------------------------------------- */

/**
 * Tolgee 플랫폼을 셀프호스팅하면 DeepL/Google 키를 Tolgee 쪽에 한 번만 등록하고
 * 여기서는 Tolgee 만 부르면 된다. 번역 이력·검수 상태가 Tolgee UI 에 남는 것이 장점.
 */
async function translateWithTolgee(req: TranslateRequest): Promise<TranslateResult> {
  const apiUrl = process.env.TOLGEE_API_URL;
  const apiKey = process.env.TOLGEE_API_KEY;
  if (!apiUrl || !apiKey) throw new TranslationError('TOLGEE_API_URL / TOLGEE_API_KEY 미설정', 'tolgee');

  const out: string[] = [];
  // Tolgee 의 번역 엔드포인트는 단건 기준이므로 순차 호출한다
  for (const text of req.texts) {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v2/projects/translations/machine-translate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLanguage: req.source, targetLanguage: req.target }),
    });
    if (!res.ok) throw new TranslationError(`Tolgee ${res.status}: ${await safeText(res)}`, 'tolgee', res.status);
    const json = (await res.json()) as { result?: { output?: string }; output?: string };
    out.push(json.result?.output ?? json.output ?? text);
  }
  return { texts: out, provider: 'tolgee' };
}

/* ---- 오케스트레이션 -------------------------------------------------------- */

/** 설정된 제공자를 순서대로 시도하고, 전부 실패하면 마지막 오류를 던진다 */
export async function translate(req: TranslateRequest): Promise<TranslateResult> {
  if (!req.texts.length) return { texts: [], provider: 'none' };
  if (req.source === req.target) return { texts: req.texts, provider: 'none' };

  const preferred = (process.env.TRANSLATION_PROVIDER as ProviderName | undefined) ?? 'deepl';
  const candidates: ProviderName[] = [preferred, 'deepl', 'google', 'tolgee'];
  const order = candidates.filter((p, i) => p !== 'none' && candidates.indexOf(p) === i);

  let lastError: unknown;
  for (const provider of order) {
    try {
      if (provider === 'deepl') return await translateWithDeepL(req);
      if (provider === 'google') return await translateWithGoogle(req);
      if (provider === 'tolgee') return await translateWithTolgee(req);
    } catch (err) {
      lastError = err;
      // 설정 누락/미지원 언어는 조용히 다음 제공자로 넘어간다.
      // 인증 실패(401/403)는 설정 오류이므로 즉시 알린다.
      if (err instanceof TranslationError && (err.status === 401 || err.status === 403)) throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new TranslationError('사용 가능한 번역 제공자가 없습니다.', 'none');
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
