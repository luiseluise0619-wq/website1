import { describe, expect, it } from 'vitest';
import { sanitizePage, sanitizePageContent } from '@/lib/server/sanitizePage';
import type { PageDocument, PuckPageData } from '@/types/schema';

/* 저장 경로(/api/pages)는 캔버스 JSON 이 서버로 들어오는 유일한 문이다.
   여기서 놓친 스크립트는 모든 방문자 브라우저에서 실행된다. */

function data(partial: Partial<PuckPageData>): PuckPageData {
  return { root: { props: {} }, content: [], zones: {}, ...partial };
}

describe('sanitizePageContent', () => {
  it('다국어 슬롯마다 스크립트를 제거한다', () => {
    const out = sanitizePageContent(
      data({
        content: [
          {
            type: 'Text',
            props: {
              id: 'a',
              html: { ko: '<p>안녕<script>alert(1)</script></p>', en: '<p>Hi<img src=x onerror=alert(1)></p>' },
            },
          },
        ],
      }),
    );
    const html = out.content[0].props.html as Record<string, string>;
    expect(html.ko).toContain('안녕');
    expect(html.ko).not.toContain('script');
    expect(html.en).not.toContain('onerror');
  });

  it('중첩 zone 의 블록도 빠뜨리지 않는다', () => {
    const out = sanitizePageContent(
      data({
        zones: {
          'sec1:content': [{ type: 'Text', props: { id: 'b', html: { ko: '<b>굵게</b><script>bad()</script>' } } }],
        },
      }),
    );
    const html = out.zones!['sec1:content'][0].props.html as Record<string, string>;
    expect(html.ko).toBe('<b>굵게</b>');
  });

  it('번역 메타(_meta)는 문자열이 아니므로 건드리지 않는다', () => {
    const meta = { en: { source: 'ko', provider: 'deepl', sourceHash: 'h', translatedAt: 't', reviewed: false } };
    const out = sanitizePageContent(
      data({ content: [{ type: 'Text', props: { id: 'c', html: { ko: '<p>본문</p>', _meta: meta } } }] }),
    );
    expect((out.content[0].props.html as Record<string, unknown>)._meta).toEqual(meta);
  });

  it('Embed 의 raw HTML 도 정화한다', () => {
    const out = sanitizePageContent(
      data({ content: [{ type: 'Embed', props: { id: 'd', html: '<script>steal()</script><iframe src="https://evil.example"></iframe>' } }] }),
    );
    const html = out.content[0].props.html as string;
    expect(html).not.toContain('script');
    expect(html).not.toContain('evil.example');
  });

  it('허용된 임베드(YouTube)는 살린다', () => {
    const out = sanitizePageContent(
      data({ content: [{ type: 'Embed', props: { id: 'e', html: '<iframe src="https://www.youtube.com/embed/abc"></iframe>' } }] }),
    );
    expect(out.content[0].props.html as string).toContain('youtube.com/embed/abc');
  });

  it('블록 구조와 다른 props 는 그대로 둔다', () => {
    const out = sanitizePageContent(
      data({ content: [{ type: 'Image', props: { id: 'f', src: 'https://cdn.example/a.png', style: { width: 100 } } }] }),
    );
    expect(out.content[0].props.src).toBe('https://cdn.example/a.png');
    expect(out.content[0].props.style).toEqual({ width: 100 });
  });
});

describe('sanitizePage', () => {
  it('본문만 바꾸고 메타데이터는 보존한다', () => {
    const page = {
      id: 'p1',
      path: '/x',
      title: '제목',
      status: 'draft',
      revision: 3,
      sourceLocale: 'ko',
      seo: { title: { ko: '제목' } },
      createdAt: 'c',
      updatedAt: 'u',
      content: data({ content: [{ type: 'Text', props: { id: 'a', html: { ko: '<p>글<script>x()</script></p>' } } }] }),
    } as unknown as PageDocument;

    const out = sanitizePage(page);
    expect(out.id).toBe('p1');
    expect(out.revision).toBe(3);
    expect(JSON.stringify(out.content)).not.toContain('script');
  });
});
