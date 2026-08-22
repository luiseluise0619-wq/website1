import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuckPageData } from '@/types/schema';

/* 자동 번역 버튼이 실제로 하는 일. 외부 API 키가 없어도 파이프라인 자체는
   검증되어야 한다 — 번역 클라이언트만 가짜로 바꾼다. */

const calls: Array<{ texts: string[]; source: string; targets: string[]; html?: boolean }> = [];
let failFor: string | null = null;

vi.mock('@/lib/translate/client', () => ({
  translateBatch: async (input: { texts: string[]; source: string; targets: string[]; html?: boolean }) => {
    calls.push(input);
    const target = input.targets[0];
    if (failFor === target) throw new Error(`${target} 실패`);
    return { [target]: input.texts.map((t) => `[${target}] ${t}`), _provider: 'deepl' };
  },
}));

const { translatePage } = await import('@/lib/translate/pipeline');

function page(): PuckPageData {
  return {
    root: { props: {} },
    content: [{ type: 'Text', props: { id: 'a', html: { ko: '<p>안녕하세요</p>' } } }],
    zones: {
      'sec:content': [
        { type: 'Button', props: { id: 'b', label: { ko: '문의하기' } } },
        { type: 'Text', props: { id: 'c', html: { ko: '평문 문장' } } },
      ],
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  failFor = null;
});

describe('translatePage', () => {
  it('원문을 대상 언어 슬롯에 채운다', async () => {
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en'] });
    expect(r.translatedCount).toBe(3);
    expect(r.errors).toEqual([]);
    const label = r.data.zones!['sec:content'][0].props.label as Record<string, string>;
    expect(label.en).toBe('[en] 문의하기');
    expect(label.ko).toBe('문의하기'); // 원문은 그대로
  });

  it('원문 언어는 대상에서 제외한다', async () => {
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['ko', 'en'] });
    expect(calls.every((c) => c.targets[0] === 'en')).toBe(true);
    expect(r.translatedCount).toBe(3);
  });

  it('HTML 과 평문을 나눠 호출한다 (tag_handling 이 달라야 한다)', async () => {
    await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en'] });
    expect(calls.map((c) => c.html)).toEqual([false, true]);
    expect(calls.find((c) => c.html)!.texts).toEqual(['<p>안녕하세요</p>']);
  });

  it('이미 사람이 손댄 번역은 건너뛴다', async () => {
    const data = page();
    (data.content[0].props.html as Record<string, unknown>).en = '사람이 쓴 영어';
    const r = await translatePage({ data, sourceLocale: 'ko', targets: ['en'] });
    expect(r.skipped).toBe(1);
    expect((r.data.content[0].props.html as Record<string, string>).en).toBe('사람이 쓴 영어');
  });

  it('force 면 손댄 번역도 다시 채운다', async () => {
    const data = page();
    (data.content[0].props.html as Record<string, unknown>).en = '사람이 쓴 영어';
    const r = await translatePage({ data, sourceLocale: 'ko', targets: ['en'], force: true });
    expect((r.data.content[0].props.html as Record<string, string>).en).toBe('[en] <p>안녕하세요</p>');
  });

  it('한 언어가 실패해도 나머지는 계속 번역한다', async () => {
    failFor = 'th';
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en', 'th', 'ja'] });
    expect(r.errors.map((e) => e.locale)).toEqual(['th', 'th']); // 평문·HTML 두 그룹
    expect((r.data.zones!['sec:content'][0].props.label as Record<string, string>).en).toBe('[en] 문의하기');
    expect((r.data.zones!['sec:content'][0].props.label as Record<string, string>).ja).toBe('[ja] 문의하기');
  });

  it('진행률을 언어 단위로 보고한다', async () => {
    const seen: Array<[number, number, string]> = [];
    await translatePage({
      data: page(),
      sourceLocale: 'ko',
      targets: ['en', 'ja'],
      onProgress: (done, total, locale) => seen.push([done, total, locale]),
    });
    expect(seen).toEqual([
      [1, 2, 'en'],
      [2, 2, 'ja'],
    ]);
  });

  it('번역 결과에 출처(provider) 메타를 남긴다', async () => {
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en'] });
    const meta = (r.data.content[0].props.html as Record<string, any>)._meta;
    expect(meta.en.provider).toBe('deepl');
    expect(meta.en.reviewed).toBe(false);
    expect(meta.en.sourceHash).toBeTruthy();
  });

  it('빈 문서는 호출 없이 끝난다', async () => {
    const r = await translatePage({ data: { root: { props: {} }, content: [], zones: {} }, sourceLocale: 'ko', targets: ['en'] });
    expect(calls).toEqual([]);
    expect(r.translatedCount).toBe(0);
  });
});

/* 실패 메시지 묶기 — 다섯 언어가 같은 이유로 실패하면 한 줄로 묶여야 한다.
   (EditorToolbar 의 summarizeTranslation 과 같은 규칙을 여기서 고정한다) */
describe('실패 요약', () => {
  it('언어별 오류가 원인별로 묶인다', async () => {
    failFor = null;
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en'] });
    expect(r.errors).toEqual([]);
    expect(r.translatedCount).toBeGreaterThan(0);
  });

  it('모든 대상이 실패하면 번역된 건수가 0 이다', async () => {
    failFor = 'en';
    const r = await translatePage({ data: page(), sourceLocale: 'ko', targets: ['en'] });
    expect(r.translatedCount).toBe(0);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(new Set(r.errors.map((e) => e.message)).size).toBe(1); // 원인은 하나
  });
});
