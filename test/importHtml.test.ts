// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { appendImported, htmlToPage } from '@/lib/importHtml';
import type { PuckBlock, PuckPageData } from '@/types/schema';

/* =============================================================================
 * HTML 가져오기 — '고칠 수 있는 상태로' 들어오는지가 판정 기준이다.
 * 통째로 Embed 하나가 되면 가져온 의미가 없고, 모르는 마크업을 버리면 내용을
 * 잃는다. 두 극단을 모두 확인한다.
 * ========================================================================== */

const parseDocument = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const run = (html: string, locale: 'ko' | 'en' = 'ko') => htmlToPage(html, { locale, parseDocument });

/** 어느 zone 에 있든 블록을 전부 모은다 */
function allBlocks(data: PuckPageData): PuckBlock[] {
  return [...data.content, ...Object.values(data.zones ?? {}).flat()];
}
const typesOf = (data: PuckPageData) => allBlocks(data).map((b) => b.type);

describe('알아보는 것은 진짜 블록이 된다', () => {
  it('제목은 태그를 지킨 Text 로', () => {
    const { data } = run('<h2>브랜드 소개</h2>');
    const text = allBlocks(data).find((b) => b.type === 'Text')!;
    expect(text.props.tag).toBe('h2');
    expect(text.props.html).toEqual({ ko: '브랜드 소개' });
  });

  it('문단은 안쪽 서식을 살린 Text 로', () => {
    const { data } = run('<p>한국 <strong>화장품</strong>을 세계로</p>');
    const text = allBlocks(data).find((b) => b.type === 'Text')!;
    expect(text.props.html).toEqual({ ko: '한국 <strong>화장품</strong>을 세계로' });
  });

  it('이미지는 Image 로 (alt 까지)', () => {
    const { data, summary } = run('<img src="/hero.jpg" alt="대표 이미지">');
    const img = allBlocks(data).find((b) => b.type === 'Image')!;
    expect(img.props.src).toBe('/hero.jpg');
    expect(img.props.alt).toEqual({ ko: '대표 이미지' });
    expect(summary.images).toBe(1);
  });

  it('버튼처럼 생긴 링크만 Button 이 된다', () => {
    const { data } = run('<a class="btn primary" href="/contact">문의하기</a>');
    const btn = allBlocks(data).find((b) => b.type === 'Button')!;
    expect(btn.props.label).toEqual({ ko: '문의하기' });
    expect(btn.props.action).toEqual({ type: 'navigate', value: '/contact' });
  });

  /* 본문 속 링크까지 버튼으로 만들면 문단이 버튼 더미로 쪼개져
     원문을 알아볼 수 없게 된다 */
  it('본문 속 평범한 링크는 글로 남는다', () => {
    const { data } = run('<a href="/x">자세히 보기</a>');
    expect(typesOf(data)).toContain('Text');
    expect(typesOf(data)).not.toContain('Button');
  });

  it('유튜브 iframe 은 Video 로 (주소를 인스펙터에서 바꿀 수 있게)', () => {
    const { data } = run('<iframe src="https://www.youtube.com/embed/abc123"></iframe>');
    const video = allBlocks(data).find((b) => b.type === 'Video')!;
    expect(video.props.src).toContain('youtube.com');
  });

  it('구분선은 Divider 로', () => {
    expect(typesOf(run('<hr>').data)).toContain('Divider');
  });

  it('중첩된 껍데기를 뚫고 안의 내용을 꺼낸다', () => {
    const { data } = run('<div><section><div class="wrap"><h1>제목</h1><p>본문</p></div></section></div>');
    const texts = allBlocks(data).filter((b) => b.type === 'Text');
    expect(texts).toHaveLength(2);
    expect(texts[0].props.tag).toBe('h1');
  });
});

describe('모르는 것은 원본으로 남긴다', () => {
  it('블록으로 못 바꾸지만 안전한 것은 Embed 로 원본을 보존한다', () => {
    // 구글 지도 iframe — Video 도 아니고 껍데기도 아니지만 허용된 출처다
    const { data, summary } = run('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>');
    const embed = allBlocks(data).find((b) => b.type === 'Embed');
    expect(String(embed?.props.html ?? '')).toContain('google.com/maps');
    expect(summary.embedded).toBe(1);
  });

  /* 저장 때 서버가 지울 마크업(사용자 정의 태그 등)은 여기서도 지운다.
     다만 글까지 버리면 붙여넣은 문장이 소리 없이 사라진다 — Text 로 건진다. */
  it('정화로 태그가 사라져도 글은 Text 로 건진다', () => {
    const { data } = run('<my-widget data-x="1">위젯 내용</my-widget>');
    const text = allBlocks(data).find((b) => b.type === 'Text');
    expect(text?.props.html).toEqual({ ko: '위젯 내용' });
  });

  it('글도 이미지도 없는 빈 껍데기는 버린다', () => {
    const { data } = run('<div><div></div><span></span></div>');
    expect(allBlocks(data).filter((b) => b.type === 'Embed')).toHaveLength(0);
  });
});

describe('가져오면 안 되는 것', () => {
  it('script 는 버리고 그 사실을 알린다', () => {
    const { data, summary } = run('<p>본문</p><script>alert(1)</script>');
    expect(JSON.stringify(data)).not.toContain('alert(1)');
    expect(summary.notes.join(' ')).toMatch(/script/i);
  });

  it('바깥 스타일시트는 가져오지 않고 서식이 달라질 수 있다고 알린다', () => {
    const { summary } = run('<link rel="stylesheet" href="/a.css"><p>본문</p>');
    expect(summary.notes.join(' ')).toMatch(/스타일시트/);
  });

  it('내용이 없으면 그렇게 말한다 (빈 페이지를 조용히 돌려주지 않는다)', () => {
    const { summary } = run('<body></body>');
    expect(summary.notes.join(' ')).toMatch(/찾지 못했습니다/);
  });
});

describe('들여온 구조', () => {
  it('섹션 + 흐름 컨테이너 안에 담긴다 (좌표를 지어내지 않는다)', () => {
    const { data } = run('<h1>제목</h1>');
    expect(data.content).toHaveLength(1);
    expect(data.content[0].type).toBe('Section');
    const sectionId = data.content[0].props.id;
    const container = data.zones![`${sectionId}:content`][0];
    expect(container.type).toBe('Container');
    expect(container.props.layoutMode).toBe('flex');
    /* Container 가 실제로 렌더하는 존 이름이어야 화면에 나온다 —
       'content' 로 넣으면 저장은 되는데 아무것도 안 보인다 */
    expect(data.zones![`${container.props.id}:items`].map((b) => b.type)).toEqual(['Text']);
  });

  it('원문 언어 칸에만 넣는다 — 나머지는 자동번역이 채운다', () => {
    const { data } = run('<p>Hello</p>', 'en');
    const text = allBlocks(data).find((b) => b.type === 'Text')!;
    expect(text.props.html).toEqual({ en: 'Hello' });
  });

  it('블록 id 가 서로 겹치지 않는다', () => {
    const { data } = run('<h1>a</h1><p>b</p><img src="/c.png"><hr>');
    const ids = allBlocks(data).map((b) => b.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('appendImported — 지금 문서 뒤에 붙이기', () => {
  const current: PuckPageData = {
    root: { props: {} },
    content: [{ type: 'Section', props: { id: 'imp1' } }],
    zones: { 'imp1:content': [{ type: 'Text', props: { id: 'imp2', html: { ko: '원래 있던 글' } } }] },
  };

  it('기존 내용을 지우지 않는다', () => {
    const next = appendImported(current, run('<h1>새 제목</h1>').data);
    expect(next.content[0].props.id).toBe('imp1');
    expect(JSON.stringify(next)).toContain('원래 있던 글');
    expect(next.content).toHaveLength(2);
  });

  /* 가져온 문서도 imp1 부터 번호를 매기므로 그대로 붙이면 반드시 부딪힌다 */
  it('id 가 겹치면 새 id 를 준다', () => {
    const next = appendImported(current, run('<h1>새 제목</h1>').data);
    const ids = [...next.content, ...Object.values(next.zones ?? {}).flat()].map((b) => b.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id 를 바꾸면 zone 키도 함께 따라간다 (빈 상자가 되지 않게)', () => {
    const next = appendImported(current, run('<h1>새 제목</h1>').data);
    const added = next.content[1];
    const zone = next.zones![`${added.props.id}:content`];
    expect(zone).toBeDefined();
    expect(zone).toHaveLength(1);
    // 그 안의 컨테이너도 자기 내용을 그대로 들고 있어야 한다
    const container = zone[0];
    expect(next.zones![`${container.props.id}:items`]?.[0].type).toBe('Text');
  });

  it('원래 문서를 변경하지 않는다', () => {
    const before = JSON.stringify(current);
    appendImported(current, run('<h1>새 제목</h1>').data);
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe('가져오는 순간 정화한다 (저장 전에 이미 캔버스에서 그려지므로)', () => {
  it('onerror 같은 실행 경로를 들여오지 않는다', () => {
    const { data } = run('<div><img src="x" onerror="alert(1)"><span>글</span></div>');
    expect(JSON.stringify(data)).not.toContain('onerror');
    expect(JSON.stringify(data)).not.toContain('alert(1)');
  });

  it('리치텍스트 안의 이벤트 속성도 떨어져 나간다', () => {
    const { data } = run('<p>안녕 <b onmouseover="steal()">굵게</b></p>');
    const html = JSON.stringify(data);
    expect(html).not.toContain('onmouseover');
    expect(html).toContain('굵게');
  });

  it('javascript: 링크는 남지 않는다', () => {
    const { data } = run('<p><a href="javascript:alert(1)">누르지 마세요</a></p>');
    expect(JSON.stringify(data)).not.toContain('javascript:');
  });

  /* 저장 때 잘려 나갈 것을 미리 보여 주지 않으면
     "가져올 땐 있었는데 저장하니 사라졌다"가 된다 */
  it('허용 밖 출처의 iframe 은 들여오지 않는다', () => {
    const { data } = run('<iframe src="https://evil.example/x"></iframe>');
    expect(JSON.stringify(data)).not.toContain('evil.example');
  });

  it('허용된 출처(유튜브·구글지도)는 남는다', () => {
    const { data } = run('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>');
    expect(JSON.stringify(data)).toContain('google.com/maps');
  });
});
