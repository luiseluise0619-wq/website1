/* =============================================================================
 * HTML Sanitizer — 저장 시점 정화
 * -----------------------------------------------------------------------------
 * Text 블록은 인라인 서식을 위해 dangerouslySetInnerHTML 을 쓴다.
 * 입력 경로가 (1) 관리자 입력 (2) 외부 번역 API 응답 두 개이므로,
 * 서버 저장 시점에 허용 목록 기반으로 한 번 정화한다.
 * 클라이언트 정화는 우회 가능하므로 신뢰 경계는 항상 서버다.
 * ========================================================================== */

/** 인라인 서식에 필요한 최소 태그만 허용한다 */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'span', 'br', 'p', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'small', 'sup', 'sub',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'style']),
  span: new Set(['style']),
  p: new Set(['style']),
  '*': new Set(['style']),
};

/** style 속성 안에서 허용할 CSS 속성 — url()/expression() 차단 */
const ALLOWED_CSS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-align', 'letter-spacing', 'line-height',
]);

function sanitizeStyle(value: string): string {
  return value
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [prop, ...rest] = decl.split(':');
      const val = rest.join(':').trim().toLowerCase();
      if (!ALLOWED_CSS.has(prop.trim().toLowerCase())) return false;
      // url(), expression(), javascript: 등 실행 가능한 값 차단
      return !/url\s*\(|expression\s*\(|javascript:|@import/i.test(val);
    })
    .join('; ');
}

function sanitizeHref(value: string): string | null {
  const v = value.trim();
  // 상대 경로, http(s), mailto, tel 만 허용 — javascript:/data: 차단
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[/#]/.test(v)) return v;
  return null;
}

/**
 * 정규식 기반 정화기 — 의존성 없이 동작한다.
 * DOM 이 있는 환경(브라우저/jsdom)이라면 DOMPurify 로 교체하는 것이 더 안전하다.
 * 여기서는 허용 목록이 매우 좁아(인라인 서식만) 실용적으로 충분하다.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';

  let out = input
    /* 실행 가능한 요소는 내용까지 통째로 제거 */
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)[^>]*\/?>/gi, '')
    /* HTML 주석 안에 숨긴 페이로드 제거 */
    .replace(/<!--[\s\S]*?-->/g, '');

  out = out.replace(/<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (match, closing, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (closing) return `</${tag}>`;

    const attrs: string[] = [];
    const attrPattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = attrPattern.exec(String(rawAttrs))) !== null) {
      const name = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? m[5] ?? '';
      // on* 이벤트 핸들러는 무조건 제거
      if (name.startsWith('on')) continue;
      const allowed = ALLOWED_ATTRS[tag] ?? ALLOWED_ATTRS['*'];
      if (!allowed.has(name)) continue;

      if (name === 'style') {
        const safe = sanitizeStyle(value);
        if (safe) attrs.push(`style="${escapeAttr(safe)}"`);
      } else if (name === 'href') {
        const safe = sanitizeHref(value);
        if (safe) attrs.push(`href="${escapeAttr(safe)}"`);
      } else if (name === 'target') {
        attrs.push(`target="${value === '_blank' ? '_blank' : '_self'}"`);
      } else if (name === 'rel') {
        attrs.push(`rel="${escapeAttr(value)}"`);
      }
    }
    // 새 창 링크에는 항상 noopener 를 붙인다 (reverse tabnabbing 방지)
    if (tag === 'a' && attrs.some((a) => a.startsWith('target="_blank"')) && !attrs.some((a) => a.startsWith('rel='))) {
      attrs.push('rel="noopener noreferrer"');
    }
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  });

  return out;
}

function escapeAttr(v: string): string {
  return v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Embed 블록용 — iframe 은 허용하되 출처를 화이트리스트로 제한한다 */
const EMBED_HOST_ALLOWLIST = [
  'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
  'player.vimeo.com', 'www.google.com', 'maps.google.com',
];

export function sanitizeEmbedHtml(input: string): string {
  if (!input) return '';
  // iframe 은 src 호스트가 허용 목록에 있을 때만 남긴다
  const withCheckedFrames = input.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>|<iframe([^>]*)\/?>/gi, (match, attrsA, _inner, attrsB) => {
    const attrs = String(attrsA ?? attrsB ?? '');
    const src = /src\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
    const url = src?.[2] ?? src?.[3];
    if (!url) return '';
    try {
      const host = new URL(url, 'https://example.com').hostname;
      return EMBED_HOST_ALLOWLIST.includes(host) ? match : '';
    } catch {
      return '';
    }
  });

  // iframe 을 제외한 나머지는 일반 규칙으로 정화하고, 검증된 iframe 을 되돌린다
  const frames: string[] = [];
  const stashed = withCheckedFrames.replace(/<iframe[\s\S]*?(<\/iframe>|\/>)/gi, (m) => {
    frames.push(m);
    return `__KSOHO_FRAME_${frames.length - 1}__`;
  });
  const cleaned = sanitizeHtml(stashed);
  return cleaned.replace(/__KSOHO_FRAME_(\d+)__/g, (_m, i) => frames[Number(i)] ?? '');
}
