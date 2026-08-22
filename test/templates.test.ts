import { describe, expect, it } from 'vitest';
import { PAGE_TEMPLATES, getTemplate, suggestTemplate, templateSourceLocale, titleText } from '@/data/templates';
import { collectLocalizedFields, isLocalizedText } from '@/lib/translate/walk';
import { t } from '@/lib/i18n';
import type { PuckBlock } from '@/types/schema';

/* 템플릿은 시드 39페이지의 내용을 결정한다. 여기가 깨지면 사이트 전체가 깨진다. */

function allBlocks(data: ReturnType<(typeof PAGE_TEMPLATES)[number]['build']>): PuckBlock[] {
  return [...(data.content ?? []), ...Object.values(data.zones ?? {}).flat()];
}

describe.each(PAGE_TEMPLATES.map((t) => [t.id, t] as const))('템플릿: %s', (_id, template) => {
  const data = template.build({ title: '테스트', locale: 'ko' });

  it('루트와 섹션을 만든다', () => {
    expect(data.content.length).toBeGreaterThan(0);
    expect(data.root.props).toBeTruthy();
  });

  it('모든 블록에 고유 id 가 있다', () => {
    const ids = allBlocks(data).map((b) => b.props?.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('참조된 zone 의 부모 블록이 실제로 존재한다', () => {
    const ids = new Set(allBlocks(data).map((b) => String(b.props?.id)));
    for (const zone of Object.keys(data.zones ?? {})) {
      expect(ids.has(zone.split(':')[0])).toBe(true);
    }
  });

  it('빌드할 때마다 같은 결과를 낸다 (순수 함수)', () => {
    expect(JSON.stringify(template.build({ title: '테스트', locale: 'ko' }))).toBe(JSON.stringify(data));
  });
});

describe('템플릿 다국어', () => {
  /* 기본 문구에 영어가 없으면 언어를 바꿔도 화면이 그대로라, 방문자에게는
     다국어 기능이 없는 것처럼 보인다. 시드 문구는 한/영을 함께 갖춰야 한다. */
  const skip = new Set(['blank']);

  it.each(PAGE_TEMPLATES.filter((t) => !skip.has(t.id)).map((t) => [t.id, t] as const))(
    '%s: 템플릿이 쓴 문구는 영어를 함께 갖는다',
    (_id, template) => {
      const title = '테스트페이지';
      const data = template.build({ title, locale: 'ko' });
      const refs = collectLocalizedFields(data, 'ko');
      expect(refs.length).toBeGreaterThan(0);

      /* 페이지 제목에서 나온 문구는 제외한다 — 템플릿은 관리자가 정할 제목의
         번역을 알 수 없다(그건 자동번역 버튼이 채운다). 템플릿이 직접 쓴
         안내 문구·버튼 라벨만 한/영을 갖춰야 한다. */
      /* 한글이 없는 문구(브랜드명 'K-BEAUTY' 등)는 언어 중립이라 번역이 필요 없다.
         영어 슬롯을 억지로 채우면 번역 현황 패널에 불필요한 항목이 쌓인다. */
      const hasHangul = (v: string) => /[\uac00-\ud7a3]/.test(v);
      const authored = refs.filter((r) => !r.sourceText.includes(title) && hasHangul(r.sourceText));
      const withoutEnglish = authored.filter((r) => !r.value.en?.trim());
      expect(withoutEnglish.map((r) => `${r.blockType}.${r.propKey}: ${r.sourceText.slice(0, 30)}`)).toEqual([]);
    },
  );

  it('영어 로케일에서 실제로 영어가 나온다', () => {
    const data = getTemplate('brand-grid').build({ title: 'Test', locale: 'ko' });
    const cta = allBlocks(data).find((b) => b.type === 'Button');
    expect(isLocalizedText(cta?.props.label)).toBe(true);
    expect(t(cta?.props.label as never, 'en')).toBe('View brands');
    expect(t(cta?.props.label as never, 'ko')).toBe('브랜드 보기');
  });

  it('번역이 없는 언어는 한국어로 폴백한다', () => {
    const data = getTemplate('brand-grid').build({ title: 'Test', locale: 'ko' });
    const cta = allBlocks(data).find((b) => b.type === 'Button');
    expect(t(cta?.props.label as never, 'th')).toBe('브랜드 보기');
  });
});

describe('템플릿 선택', () => {
  it('IA 섹션에 맞는 템플릿을 추천한다', () => {
    expect(suggestTemplate('business.buyer-inquiry').id).toBe('inquiry');
    expect(suggestTemplate('video.shorts').id).toBe('video-gallery');
    expect(suggestTemplate('buy.products').id).toBe('product-carousel');
    expect(suggestTemplate('ceo-story.founder').id).toBe('story');
    expect(suggestTemplate('brand.beauty').id).toBe('brand-grid');
  });

  it('모르는 값은 기본 템플릿으로 떨어진다', () => {
    expect(suggestTemplate(undefined).id).toBe(PAGE_TEMPLATES[0].id);
    expect(suggestTemplate('없는섹션').id).toBe(PAGE_TEMPLATES[0].id);
    expect(getTemplate('없는템플릿').id).toBe(PAGE_TEMPLATES[0].id);
  });
});

/* -----------------------------------------------------------------------------
 * 편집 언어가 한/영이 아닐 때 (태국어 담당자가 새 페이지를 만드는 경우)
 * 템플릿 문구는 여전히 한국어다. 원문 언어를 편집 언어로 잡아 버리면 번역
 * 원문이 전부 비어 커버리지 0 / 자동 번역 무동작이 된다.
 * -------------------------------------------------------------------------- */
describe('원문 언어 결정', () => {
  const content = getTemplate('brand-grid');

  it('템플릿이 쓰는 언어면 편집 언어를 그대로 원문으로 삼는다', () => {
    expect(templateSourceLocale(content, 'ko')).toBe('ko');
    expect(templateSourceLocale(content, 'en')).toBe('en');
  });

  it('템플릿이 쓰지 않는 언어면 문구의 언어(ko)가 원문이 된다', () => {
    expect(templateSourceLocale(content, 'th')).toBe('ko');
    expect(templateSourceLocale(content, 'vi')).toBe('ko');
  });

  it('빈 페이지는 문구가 없으므로 편집 언어가 그대로 원문이다', () => {
    expect(templateSourceLocale(getTemplate('blank'), 'th')).toBe('th');
  });

  it('태국어로 만들어도 번역 대상 필드가 잡힌다', () => {
    const data = content.build({ title: 'ทดสอบ', locale: 'th' });
    const source = templateSourceLocale(content, 'th');
    expect(collectLocalizedFields(data, source).length).toBeGreaterThan(5);
  });

  it('입력한 제목은 원문·편집 언어 양쪽에 들어간다', () => {
    const data = content.build({ title: 'ทดสอบ', locale: 'th' });
    const hero = allBlocks(data).find((b) => b.props?.trackingId === 'hero-title');
    expect(hero?.props.html).toEqual({ ko: 'ทดสอบ', th: 'ทดสอบ' });
    /* 한국어 편집이면 슬롯이 하나뿐 — 기존 동작 그대로 */
    expect(titleText('테스트', 'ko', 'ko')).toEqual({ ko: '테스트' });
  });
});
