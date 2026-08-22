import { describe, expect, it } from 'vitest';
import {
  fallbackChain, hashText, localeFromSearch, parseAcceptLanguage, resolutionOf,
  setLocalized, t, translationState, withLocaleParam,
} from '@/lib/i18n';
import type { LocalizedText } from '@/types/schema';

describe('t() — 로케일 해석', () => {
  const text: LocalizedText = { ko: '안녕하세요', en: 'Hello' };

  it('요청한 언어를 그대로 돌려준다', () => {
    expect(t(text, 'ko')).toBe('안녕하세요');
    expect(t(text, 'en')).toBe('Hello');
  });

  it('없는 언어는 폴백 체인을 따른다', () => {
    expect(t(text, 'th')).toBe('안녕하세요'); // th 없음 → 기본(ko)
  });

  it('폴백 체인에도 없으면 존재하는 첫 값을 쓴다', () => {
    expect(t({ th: 'สวัสดี' }, 'ja')).toBe('สวัสดี');
  });

  it('빈 문자열은 값이 없는 것으로 취급한다', () => {
    expect(t({ ko: '안녕', en: '   ' }, 'en')).toBe('안녕');
  });

  it('undefined 와 순수 문자열을 모두 견딘다', () => {
    expect(t(undefined, 'ko')).toBe('');
    expect(t('그냥 문자열', 'ko')).toBe('그냥 문자열');
    expect(t({}, 'ko')).toBe('');
  });

  it('_meta 키를 텍스트로 잘못 반환하지 않는다', () => {
    const withMeta: LocalizedText = { _meta: { en: { source: 'auto' } } };
    expect(t(withMeta, 'en')).toBe('');
  });
});

describe('fallbackChain', () => {
  it('중복 없이 요청 → 기본 → ko → en 순서를 만든다', () => {
    expect(fallbackChain('th', 'ko')).toEqual(['th', 'ko', 'en']);
    expect(fallbackChain('ko', 'ko')).toEqual(['ko', 'en']);
  });
});

describe('resolutionOf — 폴백 여부 표시', () => {
  it('원본이면 isFallback=false', () => {
    expect(resolutionOf({ ko: 'ㄱ', en: 'g' }, 'en')).toMatchObject({ value: 'g', resolvedFrom: 'en', isFallback: false });
  });
  it('폴백이면 어느 언어에서 왔는지 알려준다', () => {
    expect(resolutionOf({ ko: 'ㄱ' }, 'th')).toMatchObject({ resolvedFrom: 'ko', isFallback: true });
  });
});

describe('translationState — 번역 상태 판정', () => {
  it('값이 없으면 missing', () => {
    expect(translationState({ ko: '원문' }, 'en', 'ko')).toBe('missing');
  });

  it('사람이 검수한 번역은 manual', () => {
    const v = setLocalized({ ko: '원문' }, 'en', 'source', { source: 'manual', reviewed: true });
    expect(translationState(v, 'en', 'ko')).toBe('manual');
  });

  it('미검수 자동번역은 auto', () => {
    const v = setLocalized({ ko: '원문' }, 'en', 'src', { source: 'auto', reviewed: false });
    expect(translationState(v, 'en', 'ko')).toBe('auto');
  });

  it('원문이 바뀌면 stale 로 뒤집힌다', () => {
    let v: LocalizedText = { ko: '원문' };
    v = setLocalized(v, 'en', 'original', { source: 'auto', sourceHash: hashText('원문') });
    expect(translationState(v, 'en', 'ko')).toBe('auto');

    v = { ...v, ko: '원문이 수정됨' }; // 원문만 변경
    expect(translationState(v, 'en', 'ko')).toBe('stale');
  });

  it('원문 로케일 자신은 항상 manual', () => {
    expect(translationState({ ko: '원문' }, 'ko', 'ko')).toBe('manual');
  });
});

describe('parseAcceptLanguage', () => {
  it('q 값 순서대로 우선순위를 정한다', () => {
    expect(parseAcceptLanguage('en;q=0.5,th;q=0.9')).toBe('th');
  });
  it('지역 변종을 기본 언어로 축약한다', () => {
    expect(parseAcceptLanguage('en-GB,en;q=0.9')).toBe('en');
    expect(parseAcceptLanguage('zh-TW')).toBe('zh');
  });
  it('지원하지 않는 언어만 있으면 null', () => {
    expect(parseAcceptLanguage('de-DE,fr')).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
  });
});

describe('localeFromSearch — ?lang= 처리', () => {
  /* hreflang 이 ?lang= 주소를 검색엔진에 알리므로, 그 주소가 실제로 해당 언어를
     보여주지 않으면 약속이 깨진다. */
  it('lang / locale 파라미터를 모두 인식한다', () => {
    expect(localeFromSearch('?lang=en')).toBe('en');
    expect(localeFromSearch('?locale=th')).toBe('th');
    expect(localeFromSearch('?utm_source=x&lang=ja')).toBe('ja');
  });

  it('지원하지 않는 값은 무시한다', () => {
    expect(localeFromSearch('?lang=de')).toBeNull();
    expect(localeFromSearch('?lang=')).toBeNull();
    expect(localeFromSearch('')).toBeNull();
  });

  it('허용 목록 밖의 언어는 거부한다', () => {
    expect(localeFromSearch('?lang=ja', ['ko', 'en'])).toBeNull();
    expect(localeFromSearch('?lang=en', ['ko', 'en'])).toBe('en');
  });
});

describe('withLocaleParam — 스위처가 주소를 갱신한다', () => {
  it('?lang= 이 없으면 붙인다', () => {
    expect(withLocaleParam('/brand/beauty', 'en')).toBe('/brand/beauty?lang=en');
  });

  it('기존 ?lang= 은 덮어쓴다 (다른 파라미터는 유지)', () => {
    expect(withLocaleParam('/x?lang=en&utm_source=ig', 'ko')).toBe('/x?lang=ko&utm_source=ig');
  });

  it('별칭 ?locale= 은 제거해 우선순위가 갈리지 않게 한다', () => {
    expect(withLocaleParam('/x?locale=en', 'th')).toBe('/x?lang=th');
  });

  it('절대 주소를 넣어도 상대 경로만 돌려준다 (해시 유지)', () => {
    expect(withLocaleParam('https://k-soho.com/global/japan?lang=ko#contact', 'ja')).toBe(
      '/global/japan?lang=ja#contact',
    );
  });

  it('결과를 localeFromSearch 로 되읽으면 같은 언어가 나온다', () => {
    const url = withLocaleParam('/x?lang=en', 'vi');
    expect(localeFromSearch(url.slice(url.indexOf('?')))).toBe('vi');
  });
});

describe('hashText — 원문 변경 감지', () => {
  it('같은 입력은 같은 해시', () => {
    expect(hashText('안녕하세요')).toBe(hashText('안녕하세요'));
  });
  it('다른 입력은 다른 해시', () => {
    expect(hashText('안녕하세요')).not.toBe(hashText('안녕하세요!'));
  });
});
