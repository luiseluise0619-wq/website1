import { describe, expect, it } from 'vitest';
import {
  applyTranslationPatches, autoMeta, collectLocalizedFields,
  coverageReport, isLocalizedText, pendingFields,
} from '@/lib/translate/walk';
import { hashText, setLocalized } from '@/lib/i18n';
import type { PuckPageData } from '@/types/schema';

function doc(): PuckPageData {
  return {
    root: { props: {} },
    content: [
      { type: 'Section', props: { id: 'sec1' } },
      { type: 'Text', props: { id: 't1', html: { ko: '제목입니다' } } },
    ],
    zones: {
      'sec1:content': [
        { type: 'Text', props: { id: 't2', html: { ko: '<b>굵은</b> 본문' } } },
        { type: 'Button', props: { id: 'b1', label: { ko: '문의하기' }, action: { type: 'none' } } },
        { type: 'Shape', props: { id: 's1', kind: 'rect' } },
      ],
    },
  };
}

describe('isLocalizedText', () => {
  it('로케일 키로만 이루어진 객체를 인식한다', () => {
    expect(isLocalizedText({ ko: 'ㄱ', en: 'g' })).toBe(true);
    expect(isLocalizedText({ ko: 'ㄱ', _meta: {} })).toBe(true);
  });
  it('다른 객체는 오인하지 않는다', () => {
    expect(isLocalizedText({ type: 'navigate', value: '/x' })).toBe(false);
    expect(isLocalizedText('문자열')).toBe(false);
    expect(isLocalizedText(null)).toBe(false);
    expect(isLocalizedText([])).toBe(false);
    expect(isLocalizedText({})).toBe(false);
  });
});

describe('collectLocalizedFields', () => {
  it('중첩 zone 까지 훑어 번역 대상을 모은다', () => {
    const refs = collectLocalizedFields(doc(), 'ko');
    expect(refs.map((r) => r.blockId).sort()).toEqual(['b1', 't1', 't2']);
  });

  it('HTML 포함 여부를 표시한다 (tag_handling 결정용)', () => {
    const refs = collectLocalizedFields(doc(), 'ko');
    expect(refs.find((r) => r.blockId === 't2')?.isHtml).toBe(true);
    expect(refs.find((r) => r.blockId === 'b1')?.isHtml).toBe(false);
  });

  it('원문이 비어 있으면 대상에서 제외한다', () => {
    const d = doc();
    d.content[1].props.html = { ko: '   ' };
    expect(collectLocalizedFields(d, 'ko').map((r) => r.blockId)).not.toContain('t1');
  });

  it('번역 대상이 아닌 props 는 건드리지 않는다', () => {
    const refs = collectLocalizedFields(doc(), 'ko');
    expect(refs.some((r) => r.propKey === 'action' || r.propKey === 'kind')).toBe(false);
  });
});

describe('pendingFields — 무엇을 다시 번역할지', () => {
  const refs = () => collectLocalizedFields(doc(), 'ko');

  it('미번역은 대상이다', () => {
    expect(pendingFields(refs(), 'en', 'ko')).toHaveLength(3);
  });

  it('사람이 검수한 번역은 덮어쓰지 않는다', () => {
    const d = doc();
    d.content[1].props.html = setLocalized({ ko: '제목입니다' }, 'en', 'Title', { source: 'manual', reviewed: true });
    const pending = pendingFields(collectLocalizedFields(d, 'ko'), 'en', 'ko');
    expect(pending.map((r) => r.blockId)).not.toContain('t1');
  });

  it('force 면 검수본까지 다시 번역한다', () => {
    const d = doc();
    d.content[1].props.html = setLocalized({ ko: '제목입니다' }, 'en', 'Title', { source: 'manual', reviewed: true });
    expect(pendingFields(collectLocalizedFields(d, 'ko'), 'en', 'ko', { force: true })).toHaveLength(3);
  });

  it('원문이 바뀐 번역(stale)은 다시 대상이 된다', () => {
    const d = doc();
    d.content[1].props.html = {
      ko: '제목이 바뀜',
      en: 'Old title',
      _meta: { en: { source: 'manual', reviewed: true, sourceHash: hashText('제목입니다') } },
    };
    expect(pendingFields(collectLocalizedFields(d, 'ko'), 'en', 'ko').map((r) => r.blockId)).toContain('t1');
  });

  it('원문 로케일 자신은 번역하지 않는다', () => {
    expect(pendingFields(refs(), 'ko', 'ko')).toHaveLength(0);
  });
});

describe('applyTranslationPatches', () => {
  it('루트와 zone 양쪽에 결과를 되돌려 쓴다', () => {
    const d = doc();
    const refs = collectLocalizedFields(d, 'ko');
    const patches = refs.map((r) => ({
      blockPath: r.blockPath,
      propKey: r.propKey,
      locale: 'en' as const,
      text: `EN:${r.sourceText}`,
      meta: autoMeta('deepl', r.sourceText),
    }));

    const next = applyTranslationPatches(d, patches);
    expect((next.content[1].props.html as Record<string, string>).en).toBe('EN:제목입니다');
    expect((next.zones!['sec1:content'][1].props.label as Record<string, string>).en).toBe('EN:문의하기');
  });

  it('원본 문서를 변경하지 않는다 (불변)', () => {
    const d = doc();
    const before = JSON.stringify(d);
    applyTranslationPatches(d, [{
      blockPath: 'content.1', propKey: 'html', locale: 'en', text: 'X', meta: autoMeta('deepl', '제목입니다'),
    }]);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('기존 로케일 값을 보존한 채 새 언어만 추가한다', () => {
    const d = doc();
    const next = applyTranslationPatches(d, [{
      blockPath: 'content.1', propKey: 'html', locale: 'th', text: 'หัวข้อ', meta: autoMeta('google', '제목입니다'),
    }]);
    const html = next.content[1].props.html as Record<string, string>;
    expect(html.ko).toBe('제목입니다');
    expect(html.th).toBe('หัวข้อ');
  });

  it('존재하지 않는 경로는 조용히 건너뛴다', () => {
    const d = doc();
    expect(() => applyTranslationPatches(d, [{
      blockPath: 'content.99', propKey: 'html', locale: 'en', text: 'x', meta: autoMeta('deepl', 'y'),
    }])).not.toThrow();
  });

  it('번역 메타에 원문 해시를 남겨 이후 stale 판정이 가능하다', () => {
    const next = applyTranslationPatches(doc(), [{
      blockPath: 'content.1', propKey: 'html', locale: 'en', text: 'Title', meta: autoMeta('deepl', '제목입니다'),
    }]);
    const meta = (next.content[1].props.html as { _meta: Record<string, { sourceHash: string }> })._meta;
    expect(meta.en.sourceHash).toBe(hashText('제목입니다'));
  });
});

describe('coverageReport — 번역 현황', () => {
  it('언어별 미번역 건수를 센다', () => {
    const report = coverageReport(doc(), 'ko', ['ko', 'en']);
    expect(report.find((r) => r.locale === 'ko')).toMatchObject({ total: 3, done: 3, missing: 0 });
    expect(report.find((r) => r.locale === 'en')).toMatchObject({ total: 3, missing: 3 });
  });
});
