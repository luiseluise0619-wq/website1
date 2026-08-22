import type { LocaleCode, LocalizedText, TranslationMeta } from '@/types/schema';

/* =============================================================================
 * i18n Core — 로케일 정의 / 폴백 해석 / 브라우저 감지 / 번역 상태 진단
 * ========================================================================== */

export interface LocaleDefinition {
  code: LocaleCode;
  /** 해당 언어로 표기한 이름 (언어 선택 드롭다운용) */
  nativeName: string;
  englishName: string;
  /** 관리자 화면(한국어)에서 부르는 이름 — 오류 문구가 '태국어' 라고 말해야 한다 */
  koName: string;
  flag: string;
  dir: 'ltr' | 'rtl';
  /** <html lang=""> 및 hreflang 에 쓰이는 BCP-47 태그 */
  bcp47: string;
  /** DeepL 대상 언어 코드 (미지원이면 null → Google 로 폴백) */
  deeplCode: string | null;
  /** Google Cloud Translation 대상 코드 */
  googleCode: string;
}

export const LOCALES: Record<LocaleCode, LocaleDefinition> = {
  ko: { code: 'ko', nativeName: '한국어',   englishName: 'Korean',     koName: '한국어',   flag: '🇰🇷', dir: 'ltr', bcp47: 'ko-KR', deeplCode: 'KO',    googleCode: 'ko' },
  en: { code: 'en', nativeName: 'English',  englishName: 'English',    koName: '영어',     flag: '🇺🇸', dir: 'ltr', bcp47: 'en-US', deeplCode: 'EN-US', googleCode: 'en' },
  th: { code: 'th', nativeName: 'ไทย',       englishName: 'Thai',       koName: '태국어',   flag: '🇹🇭', dir: 'ltr', bcp47: 'th-TH', deeplCode: null,    googleCode: 'th' },
  vi: { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', koName: '베트남어', flag: '🇻🇳', dir: 'ltr', bcp47: 'vi-VN', deeplCode: null,   googleCode: 'vi' },
  ja: { code: 'ja', nativeName: '日本語',    englishName: 'Japanese',   koName: '일본어',   flag: '🇯🇵', dir: 'ltr', bcp47: 'ja-JP', deeplCode: 'JA',    googleCode: 'ja' },
  zh: { code: 'zh', nativeName: '中文',      englishName: 'Chinese',    koName: '중국어',   flag: '🇨🇳', dir: 'ltr', bcp47: 'zh-CN', deeplCode: 'ZH',    googleCode: 'zh-CN' },
};

export const LOCALE_ORDER: LocaleCode[] = ['ko', 'en', 'th', 'vi', 'ja', 'zh'];
export const DEFAULT_LOCALE: LocaleCode = 'ko';

export function isLocale(v: unknown): v is LocaleCode {
  return typeof v === 'string' && v in LOCALES;
}

/* ---- 폴백 해석 ------------------------------------------------------------ */

/**
 * 로케일 폴백 체인. 요청 → 사이트 기본 → ko → en.
 * 지역 변종('en-GB')은 기본 언어('en')로 축약해 받아들인다.
 */
export function fallbackChain(locale: LocaleCode, siteDefault: LocaleCode = DEFAULT_LOCALE): LocaleCode[] {
  const chain: LocaleCode[] = [locale, siteDefault, 'ko', 'en'];
  return chain.filter((l, i) => chain.indexOf(l) === i);
}

/**
 * LocalizedText → 실제 표시 문자열.
 * 어떤 로케일에도 값이 없으면 존재하는 첫 값을 쓰고, 그마저 없으면 빈 문자열.
 * 렌더러는 절대 undefined 를 만나지 않는다.
 */
export function t(
  text: LocalizedText | string | undefined,
  locale: LocaleCode,
  siteDefault: LocaleCode = DEFAULT_LOCALE,
): string {
  if (text === undefined || text === null) return '';
  if (typeof text === 'string') return text;
  for (const code of fallbackChain(locale, siteDefault)) {
    const v = text[code];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  for (const [key, v] of Object.entries(text)) {
    if (key === '_meta') continue;
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
}

/** 표시값이 요청 로케일 원본인지, 폴백된 값인지 — 에디터 뱃지 표시에 사용 */
export function resolutionOf(
  text: LocalizedText | undefined,
  locale: LocaleCode,
): { value: string; resolvedFrom: LocaleCode | null; isFallback: boolean } {
  if (!text) return { value: '', resolvedFrom: null, isFallback: true };
  for (const code of fallbackChain(locale)) {
    const v = text[code];
    if (typeof v === 'string' && v.trim() !== '') {
      return { value: v, resolvedFrom: code, isFallback: code !== locale };
    }
  }
  return { value: '', resolvedFrom: null, isFallback: true };
}

export function setLocalized(
  text: LocalizedText | undefined,
  locale: LocaleCode,
  value: string,
  meta?: TranslationMeta,
): LocalizedText {
  const next: LocalizedText = { ...(text ?? {}) };
  next[locale] = value;
  if (meta) next._meta = { ...(next._meta ?? {}), [locale]: meta };
  return next;
}

/** 문자열의 짧은 안정 해시 — 원문 변경 감지(stale 번역 판정)용 (djb2) */
export function hashText(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type TranslationState = 'missing' | 'stale' | 'auto' | 'manual';

/** 해당 로케일 번역의 상태 판정 — 번역 관리 패널의 색상 뱃지 근거 */
export function translationState(
  text: LocalizedText | undefined,
  locale: LocaleCode,
  sourceLocale: LocaleCode = DEFAULT_LOCALE,
): TranslationState {
  if (!text) return 'missing';
  const value = text[locale];
  if (!value || !value.trim()) return 'missing';
  if (locale === sourceLocale) return 'manual';
  const meta = text._meta?.[locale];
  const sourceValue = text[sourceLocale];
  if (meta?.sourceHash && sourceValue && hashText(sourceValue) !== meta.sourceHash) return 'stale';
  return meta?.source === 'auto' && !meta.reviewed ? 'auto' : 'manual';
}

/* ---- 브라우저 / 요청 로케일 감지 ------------------------------------------- */

/**
 * Accept-Language 헤더 파싱 (q-value 정렬).
 * 서버 컴포넌트/미들웨어에서 첫 렌더부터 올바른 언어를 내보내기 위해 사용한다.
 */
export function parseAcceptLanguage(header: string | null | undefined, supported: LocaleCode[] = LOCALE_ORDER): LocaleCode | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number.parseFloat(q.split('=')[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    // 중국어 번체/간체 모두 zh 로 수렴
    const candidate = (base === 'zh' ? 'zh' : base) as LocaleCode;
    if (supported.includes(candidate)) return candidate;
  }
  return null;
}

export const LOCALE_COOKIE = 'ksoho_locale';

/**
 * 클라이언트 측 감지: URL(?lang=) → 저장된 선택 → navigator.languages → 기본.
 * ?lang= 를 가장 앞에 두는 이유: hreflang 으로 그 주소를 검색엔진에 알리고 있어,
 * 링크를 타고 들어온 사람에게 해당 언어가 보이지 않으면 약속이 깨진다.
 */
export function detectClientLocale(supported: LocaleCode[] = LOCALE_ORDER): LocaleCode {
  if (typeof window !== 'undefined') {
    const fromUrl = localeFromSearch(window.location.search, supported);
    if (fromUrl) return fromUrl;
  }
  if (typeof document !== 'undefined') {
    const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    const saved = cookie?.split('=')[1];
    if (isLocale(saved) && supported.includes(saved)) return saved;
  }
  if (typeof navigator !== 'undefined') {
    const fromNav = parseAcceptLanguage(navigator.languages?.join(','), supported);
    if (fromNav) return fromNav;
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: LocaleCode): void {
  if (typeof document === 'undefined') return;
  // 1년 유지, 사이트 전역 적용
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * 현재 주소의 ?lang= 을 주어진 언어로 맞춘 상대 URL 을 만든다.
 * 서버가 ?lang= 을 쿠키보다 우선하므로, 스위처가 URL 을 갱신하지 않으면
 * /x?lang=en 으로 들어온 방문자의 한국어 선택이 새로고침에서 되돌아간다.
 */
export function withLocaleParam(url: string, locale: LocaleCode): string {
  // 상대 주소도 파싱하기 위한 더미 origin — 결과에는 남지 않는다
  const u = new URL(url, 'http://localhost');
  u.searchParams.set('lang', locale);
  // 같은 뜻의 별칭이 남아 있으면 어느 쪽이 이겼는지 읽는 사람이 알 수 없다
  u.searchParams.delete('locale');
  return `${u.pathname}${u.search}${u.hash}`;
}

/** URL 에서 ?lang= 또는 /{locale}/ 접두사를 읽는다 */
export function localeFromSearch(search: string, supported: LocaleCode[] = LOCALE_ORDER): LocaleCode | null {
  const params = new URLSearchParams(search);
  const v = params.get('lang') ?? params.get('locale');
  return isLocale(v) && supported.includes(v) ? v : null;
}
