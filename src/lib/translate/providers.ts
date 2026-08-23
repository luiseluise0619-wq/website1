import 'server-only';
import { LOCALES } from '@/lib/i18n';
import type { LocaleCode, ProviderName } from '@/types/schema';

/* =============================================================================
 * Translation Providers (서버 전용)
 * -----------------------------------------------------------------------------
 * 우선순위: DeepL → Google → LibreTranslate → Ollama → Tolgee → 실패
 *
 * 앞의 둘은 유료 API 다. 뒤의 둘은 오픈소스 엔진을 직접 띄워 쓰는 무료 경로로,
 * 키가 없거나 무료 한도가 끝나도 자동번역이 멈추지 않게 하는 안전망이다.
 *   - LibreTranslate (AGPL) : docker run -p 5000:5000 libretranslate/libretranslate
 *   - Ollama (MIT)          : ollama serve + ollama pull qwen2.5:7b
 * 둘 다 호출당 비용이 없고 원문이 외부로 나가지 않는다.
 *
 * DeepL 은 한국어/일본어/중국어 품질이 가장 좋지만 태국어·베트남어를 지원하지
 * 않는다. 그래서 언어별로 자동 폴백한다 (LOCALES[x].deeplCode === null).
 * ========================================================================== */

export type { ProviderName };

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
  '번역 제공자가 하나도 설정되지 않았습니다. 유료 키 없이 쓰려면 LibreTranslate 를 띄우고 ' +
  'LIBRETRANSLATE_URL 을 지정하세요 (docker run -p 5000:5000 libretranslate/libretranslate). ' +
  '유료 API 를 쓰려면 DEEPL_API_KEY 또는 GOOGLE_TRANSLATE_API_KEY 를 넣고 다시 배포하세요.';

/** 무료 경로 안내 — 미지원 언어 안내 문구에서도 재사용한다 */
const FREE_HINT = 'LIBRETRANSLATE_URL(무료·셀프호스팅) 또는 GOOGLE_TRANSLATE_API_KEY 를 설정하면 이 언어도 번역됩니다.';

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

/* ---- LibreTranslate (오픈소스·셀프호스팅) ---------------------------------- */

/**
 * LibreTranslate 는 Argos Translate 모델을 얹은 AGPL 번역 서버다.
 * 직접 띄우면 호출 한도도 비용도 없고 원문이 외부로 나가지 않는다.
 *
 *   docker run -d -p 5000:5000 libretranslate/libretranslate
 *   LIBRETRANSLATE_URL=http://localhost:5000
 *
 * 공개 인스턴스는 대부분 API 키를 요구하거나 분당 제한이 있으므로
 * LIBRETRANSLATE_API_KEY 도 선택적으로 보낸다.
 */
async function translateWithLibreTranslate(req: TranslateRequest): Promise<TranslateResult> {
  const base = process.env.LIBRETRANSLATE_URL;
  if (!base) throw new TranslationError('LIBRETRANSLATE_URL 미설정', 'libretranslate', undefined, true);

  const res = await fetch(`${base.replace(/\/$/, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // q 가 배열이면 응답 translatedText 도 같은 길이의 배열로 돌아온다
      q: req.texts,
      source: LOCALES[req.source].libreCode,
      target: LOCALES[req.target].libreCode,
      format: req.html ? 'html' : 'text',
      api_key: process.env.LIBRETRANSLATE_API_KEY || undefined,
    }),
  });

  if (!res.ok) {
    /* 인스턴스에 그 언어 모델이 안 깔려 있으면 400 을 준다. 설정 오류가 아니라
       '이 제공자는 이 언어를 못 한다' 이므로 unsupported 로 표시해 다음으로 넘긴다. */
    const body = await safeText(res);
    const missingLang = res.status === 400 && /language|not supported/i.test(body);
    throw new TranslationError(
      `LibreTranslate ${res.status}: ${body}`,
      'libretranslate',
      res.status,
      false,
      missingLang,
    );
  }

  const json = (await res.json()) as { translatedText: string | string[] };
  const texts = Array.isArray(json.translatedText) ? json.translatedText : [json.translatedText];
  if (texts.length !== req.texts.length) {
    throw new TranslationError(
      `LibreTranslate 응답 개수 불일치 (요청 ${req.texts.length}, 응답 ${texts.length})`,
      'libretranslate',
    );
  }
  return { texts, provider: 'libretranslate' };
}

/* ---- Ollama (로컬 LLM) ------------------------------------------------------ */

/**
 * 로컬에 띄운 오픈소스 LLM으로 번역한다. 마케팅 카피처럼 문맥이 중요한 문장은
 * 전용 MT 엔진보다 자연스러운 경우가 많고, 역시 비용이 0 이다.
 *
 *   ollama serve && ollama pull qwen2.5:7b
 *   OLLAMA_URL=http://localhost:11434
 *
 * OpenAI 호환 서버(vLLM, LM Studio, llama.cpp)도 /api/chat 대신 쓰고 싶다면
 * OLLAMA_URL 을 그쪽 주소로 두고 프록시하면 된다.
 */
async function translateWithOllama(req: TranslateRequest): Promise<TranslateResult> {
  const base = process.env.OLLAMA_URL;
  if (!base) throw new TranslationError('OLLAMA_URL 미설정', 'ollama', undefined, true);
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  const endpoint = `${base.replace(/\/$/, '')}/api/chat`;

  const system =
    `You are a professional translator for marketing copy. ` +
    `Translate from ${LOCALES[req.source].englishName} to ${LOCALES[req.target].englishName}. ` +
    (req.html
      ? 'The input is an HTML fragment: keep every tag and attribute exactly as-is and translate only the visible text. '
      : '') +
    `Reply with the translation only — no quotes, no explanation, no preamble.`;

  /* 문장을 한 번에 몰아 넣으면 모델이 순서를 섞거나 합쳐 버린다.
     한 건씩 보내야 텍스트-결과 대응이 깨지지 않는다. */
  const out: string[] = [];
  for (const text of req.texts) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        // 번역은 창작이 아니다 — 매번 같은 결과가 나오도록 온도를 0 으로 둔다
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) throw new TranslationError(`Ollama ${res.status}: ${await safeText(res)}`, 'ollama', res.status);
    const json = (await res.json()) as { message?: { content?: string }; error?: string };
    if (json.error) throw new TranslationError(`Ollama: ${json.error}`, 'ollama');
    out.push(cleanLlmOutput(json.message?.content ?? '', text));
  }
  return { texts: out, provider: 'ollama' };
}

/**
 * LLM 은 지시해도 코드펜스나 따옴표를 두르는 일이 있다. 원문에 없던 껍데기만
 * 벗기고, 결과가 비면 원문을 돌려준다(빈 문자열로 덮어써 화면이 비는 것보다 낫다).
 */
export function cleanLlmOutput(raw: string, original: string): string {
  let out = raw.trim();
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n?```$/i);
  if (fence) out = fence[1].trim();
  for (const [open, close] of [['"', '"'], ["'", "'"], ['「', '」'], ['“', '”']]) {
    if (out.length > 1 && out.startsWith(open) && out.endsWith(close) && !original.startsWith(open)) {
      out = out.slice(open.length, out.length - close.length).trim();
    }
  }
  return out || original;
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
  /* 유료 → 무료(셀프호스팅) 순. 설정 안 된 제공자는 네트워크를 타지 않고
     바로 다음으로 넘어가므로 목록에 늘 넣어 둬도 비용이 없다. */
  const candidates: ProviderName[] = [preferred, 'deepl', 'google', 'libretranslate', 'ollama', 'tolgee'];
  const order = candidates.filter((p, i) => p !== 'none' && candidates.indexOf(p) === i);

  /* 마지막 오류가 아니라 '진짜 실패한' 오류를 기억한다. 뒤쪽 제공자가 대개
     미설정이라, 그냥 마지막 것을 던지면 Ollama 가 모델이 없어 실패했는데
     화면에는 "Tolgee 미설정"이 뜬다 — 엉뚱한 곳을 고치게 된다. */
  let lastError: unknown;
  let lastRealError: unknown;
  let allUnconfigured = true;
  /* 이 언어를 아예 지원하지 않는 제공자가 있었는가 — 안내 문구가 달라진다 */
  let unsupportedBy: ProviderName | null = null;
  for (const provider of order) {
    try {
      if (provider === 'deepl') return await translateWithDeepL(req);
      if (provider === 'google') return await translateWithGoogle(req);
      if (provider === 'libretranslate') return await translateWithLibreTranslate(req);
      if (provider === 'ollama') return await translateWithOllama(req);
      if (provider === 'tolgee') return await translateWithTolgee(req);
    } catch (err) {
      lastError = err;
      if (err instanceof TranslationError && err.unsupported) {
        unsupportedBy = err.provider;
        // '미지원'은 설정 문제가 아니므로 allUnconfigured 판정에서 제외한다
      } else if (!(err instanceof TranslationError) || !err.unconfigured) {
        allUnconfigured = false;
        lastRealError = err;
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
        `${LOCALES[req.target].koName}는 ${PROVIDER_LABEL[unsupportedBy]}이(가) 지원하지 않습니다. ${FREE_HINT}`,
        'none',
        undefined,
        true,
      );
    }
    throw new TranslationError(NO_PROVIDER_MESSAGE, 'none', undefined, true);
  }

  const surfaced = lastRealError ?? lastError;
  throw surfaced instanceof Error
    ? surfaced
    : new TranslationError('사용 가능한 번역 제공자가 없습니다.', 'none');
}

/** 오류 문구에 쓰는 사람이 읽는 이름 */
const PROVIDER_LABEL: Record<ProviderName, string> = {
  deepl: 'DeepL',
  google: 'Google 번역',
  libretranslate: 'LibreTranslate',
  ollama: 'Ollama',
  tolgee: 'Tolgee',
  none: '번역 제공자',
};

/**
 * 어떤 제공자가 설정돼 있는지 — /api/health 와 관리자 안내가 같은 판정을 쓰도록
 * 여기 한 곳에서만 결정한다. 값은 노출하지 않고 유무만 돌려준다.
 */
export function providerStatus(): Record<Exclude<ProviderName, 'none'>, boolean> {
  return {
    deepl: Boolean(process.env.DEEPL_API_KEY),
    google: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY),
    libretranslate: Boolean(process.env.LIBRETRANSLATE_URL),
    ollama: Boolean(process.env.OLLAMA_URL),
    tolgee: Boolean(process.env.TOLGEE_API_URL && process.env.TOLGEE_API_KEY),
  };
}

/** 자동번역이 조금이라도 가능한 상태인가 */
export function hasAnyProvider(): boolean {
  return Object.values(providerStatus()).some(Boolean);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
