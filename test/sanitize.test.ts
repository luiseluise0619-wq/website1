import { describe, expect, it } from 'vitest';
import { sanitizeEmbedHtml, sanitizeHtml } from '@/lib/sanitize';

/* 캔버스 HTML 은 관리자 입력과 외부 번역 API 응답 두 경로로 들어온다.
   저장 시점 정화가 유일한 신뢰 경계이므로 여기서 확실히 막혀야 한다. */

describe('sanitizeHtml — 공격 차단', () => {
  it('script 태그와 그 내용을 제거한다', () => {
    const out = sanitizeHtml('<script>alert(1)</script><b>안녕</b>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('<b>안녕</b>');
  });

  it('이벤트 핸들러 속성을 제거한다', () => {
    expect(sanitizeHtml('<b onclick="steal()">굵게</b>')).not.toContain('onclick');
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).not.toContain('onerror');
  });

  it('javascript: 링크를 제거한다', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('data: URI 링크를 제거한다', () => {
    const out = sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>');
    expect(out).not.toContain('data:');
  });

  it('style 속성의 url() 을 제거한다', () => {
    const out = sanitizeHtml('<span style="color:red;background:url(javascript:1)">빨강</span>');
    expect(out).not.toMatch(/url\s*\(/i);
    expect(out).toContain('red');
  });

  it('허용되지 않은 태그(iframe/form)를 제거한다', () => {
    expect(sanitizeHtml('<iframe src="https://evil.com"></iframe>')).not.toContain('iframe');
    expect(sanitizeHtml('<form action="/steal"><input name="pw"></form>')).not.toContain('form');
  });

  it('svg 기반 우회를 막는다', () => {
    const out = sanitizeHtml('<svg><animate onbegin=alert(1) attributeName=x></svg>');
    expect(out).not.toContain('onbegin');
    expect(out).not.toContain('<svg');
  });
});

describe('sanitizeHtml — 정상 서식 보존', () => {
  it('인라인 서식을 유지한다', () => {
    const out = sanitizeHtml('<strong>굵게</strong> <em>기울임</em> <u>밑줄</u>');
    expect(out).toContain('<strong>굵게</strong>');
    expect(out).toContain('<em>기울임</em>');
  });

  it('내부 링크와 색상 지정을 유지한다', () => {
    const out = sanitizeHtml('<a href="/brand">이동</a>');
    expect(out).toContain('href="/brand"');
    expect(sanitizeHtml('<span style="color: #ff0000">빨강</span>')).toContain('color');
  });

  it('다국어 텍스트를 훼손하지 않는다', () => {
    for (const text of ['안녕하세요', 'สวัสดี', 'こんにちは', '你好', 'Xin chào']) {
      expect(sanitizeHtml(`<p>${text}</p>`)).toContain(text);
    }
  });

  it('빈 입력을 안전하게 처리한다', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeEmbedHtml — iframe 출처 제한', () => {
  it('허용 목록의 iframe 은 남긴다', () => {
    const out = sanitizeEmbedHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>');
    expect(out).toContain('youtube.com/embed/abc');
  });

  it('허용되지 않은 출처의 iframe 은 제거한다', () => {
    const out = sanitizeEmbedHtml('<iframe src="https://evil.example.com/x"></iframe>');
    expect(out).not.toContain('evil.example.com');
  });

  it('src 없는 iframe 은 제거한다', () => {
    expect(sanitizeEmbedHtml('<iframe></iframe>')).not.toContain('iframe');
  });
});
