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
  constructor(
    message: string,
    readonly provider: ProviderName,
    readonly status?: number,
    /** 키가 없어서 못 쓴 것인가 (호출은 해봤지만 실패한 것과 구분한다) */
    readonly unconfigured = false,
    /** 제공자가 그 언어를 아예 지원하지 않는가 (DeepL 의 태국어·베트남어) */
    readonly unsupported = false,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

/** 설정이 하나도 없을 때 관리자가 무엇을 해야 하는지 한 줄로 알려 준다 */
const NO_PROVIDER_MESSAGE =
  '번역 API 키가 설정되지 않았습니다. DEEPL_API_KEY 또는 GOOGLE_TRANSLATE_API_KEY ' +
  '(혹은 TOLGEE_API_URL + TOLGEE_API_KEY)를 환경 변수에 넣고 다시 배포하세요.';

/* ---- DeepL ---------------------------------------------------------------- */

async function translateWithDeepL(req: TranslateRequest): Promise<TranslateResult> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new TranslationError('DEEPL_API_KEY 미설정', 'deepl', undefined, true);
  const targetCode = LOCALES[req.target].deeplCode;
  if (!targetCode) throw new TranslationError(`DeepL 미지원 언어: ${req.target}`, 'deepl', undefined, false, true);

  /* 무료 키는 ':fx' 접미사를 가지며 엔드포인트가 다르다.
     DEEPL_API_URL 을 주면 그쪽으로 보낸다 — 사내 프록시를 거치거나
     테스트용 목 서버로 돌릴 때 쓴다. */
  const endpoint =
    process.env.DEEPL_API_URL ||
    (key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');

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
  if (!key) throw new TranslationError('GOOGLE_TRANSLATE_API_KEY 미설정', 'google', undefined, true);

  /* DEEPL_API_URL 과 같은 이유로 엔드포인트를 바꿀 수 있게 둔다 */
  const base = process.env.GOOGLE_TRANSLATE_API_URL || 'https://translation.googleapis.com/language/translate/v2';
  const res = await fetch(`${base}?key=${encodeURIComponent(key)}`, {
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
  if (!apiUrl || !apiKey) throw new TranslationError('TOLGEE_API_URL / TOLGEE_API_KEY 미설정', 'tolgee', undefined, true);

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
  let allUnconfigured = true;
  /* 이 언어를 아예 지원하지 않는 제공자가 있었는가 — 안내 문구가 달라진다 */
  let unsupportedBy: ProviderName | null = null;
  for (const provider of order) {
    try {
      if (provider === 'deepl') return await translateWithDeepL(req);
      if (provider === 'google') return await translateWithGoogle(req);
      if (provider === 'tolgee') return await translateWithTolgee(req);
    } catch (err) {
      lastError = err;
      if (err instanceof TranslationError && err.unsupported) {
        unsupportedBy = err.provider;
        // '미지원'은 설정 문제가 아니므로 allUnconfigured 판정에서 제외한다
      } else if (!(err instanceof TranslationError) || !err.unconfigured) {
        allUnconfigured = false;
      }
      // 설정 누락/미지원 언어는 조용히 다음 제공자로 넘어간다.
      // 인증 실패(401/403)는 설정 오류이므로 즉시 알린다.
      if (err instanceof TranslationError && (err.status === 401 || err.status === 403)) throw err;
    }
  }

  if (allUnconfigured) {
    /* DeepL 은 있는데 그 언어만 지원하지 않는 경우가 흔하다(태국어·베트남어).
       "Tolgee 미설정" 이라고 말하면 엉뚱한 곳을 보게 된다. */
    if (unsupportedBy) {
      throw new TranslationError(
        `${LOCALES[req.target].koName}는 ${unsupportedBy === 'deepl' ? 'DeepL' : unsupportedBy}이 지원하지 않습니다. ` +
          'GOOGLE_TRANSLATE_API_KEY 를 설정하면 이 언어도 번역됩니다.',
        'none',
        undefined,
        true,
      );
    }
    throw new TranslationError(NO_PROVIDER_MESSAGE, 'none', undefined, true);
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
