import { describe, expect, it } from 'vitest';
import { normalizePath, slugify } from '@/lib/id';

/* 경로 정규화가 조회 키다. 저장할 때와 요청할 때 서로 다른 문자열이 되면
   페이지는 존재하는데 404 가 난다(한글 경로에서 실제로 그랬다). */

describe('normalizePath', () => {
  it('선행 슬래시를 보장하고 후행 슬래시를 없앤다', () => {
    expect(normalizePath('brand/beauty')).toBe('/brand/beauty');
    expect(normalizePath('/brand/beauty/')).toBe('/brand/beauty');
  });

  it('중복 슬래시를 접는다', () => {
    expect(normalizePath('//brand///beauty')).toBe('/brand/beauty');
  });

  it('빈 값과 루트는 /', () => {
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });

  it('퍼센트 인코딩을 풀어 저장된 한글 경로와 맞춘다', () => {
    expect(normalizePath('/%EB%B6%80%EC%82%B0')).toBe('/부산');
    // 브라우저가 소문자로 보내는 경우도 같은 결과여야 한다
    expect(normalizePath('/%eb%b6%80%ec%82%b0')).toBe('/부산');
    expect(normalizePath('/부산')).toBe('/부산');
  });

  it('자모가 분리된 입력(NFD)도 같은 키가 된다', () => {
    const nfd = '/부산'.normalize('NFD');
    expect(nfd).not.toBe('/부산'); // 눈에는 같지만 다른 문자열
    expect(normalizePath(nfd)).toBe('/부산');
  });

  it('공백·기호가 인코딩된 경로도 푼다', () => {
    expect(normalizePath('/k%20beauty')).toBe('/k beauty');
  });

  it('깨진 인코딩은 원문을 유지한다 (던지지 않는다)', () => {
    expect(normalizePath('/100%')).toBe('/100%');
    expect(normalizePath('/%zz')).toBe('/%zz');
  });
});

describe('slugify', () => {
  it('공백은 하이픈, 대문자는 소문자', () => {
    expect(slugify('Buyer Inquiry')).toBe('buyer-inquiry');
    expect(slugify('THAILAND')).toBe('thailand');
  });

  it('한글은 그대로 남긴다', () => {
    expect(slugify('창업자 이야기')).toBe('창업자-이야기');
  });

  it('기호를 걷어내고 하이픈을 정리한다', () => {
    expect(slugify('  K-BEAUTY!! 브랜드  ')).toBe('k-beauty-브랜드');
    expect(slugify('--앞뒤--')).toBe('앞뒤');
  });
});
