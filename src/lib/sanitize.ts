import DOMPurify from 'isomorphic-dompurify';

/* =============================================================================
 * HTML Sanitizer — 저장 시점 정화 (DOMPurify 기반)
 * -----------------------------------------------------------------------------
 * Text/Embed 블록은 인라인 서식을 위해 dangerouslySetInnerHTML 을 쓴다.
 * 입력 경로가 (1) 관리자 입력 (2) 외부 번역 API 응답 두 개이므로,
 * 서버 저장 시점에 한 번 정화한다. 클라이언트 정화는 우회 가능하므로
 * 신뢰 경계는 항상 서버다.
 *
 * 직접 만든 정규식 대신 DOMPurify 를 쓰는 이유: 실제 파서로 DOM 을 만들어
 * 검사하므로 mXSS(파서 차이를 이용한 우회)까지 막는다. 정규식은 원리상
 * 브라우저 파서와 해석이 어긋날 수 있다.
 * ========================================================================== */

/**
 * 인라인 서식에 필요한 최소 태그만 허용한다.
 * '#text' 를 반드시 포함해야 한다 — ALLOWED_TAGS 를 명시하면서 이를 빠뜨리면
 * DOMPurify 가 텍스트 노드까지 제거해 본문이 통째로 사라진다.
 */
const ALLOWED_TAGS = [
  '#text',
  'b', 'strong', 'i', 'em', 'u', 's', 'span', 'br', 'p', 'a',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'small', 'sup', 'sub', 'mark', 'code',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'style', 'class'];

/** style 속성에서 허용할 CSS 속성 */
const ALLOWED_CSS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'text-decoration', 'text-align', 'letter-spacing', 'line-height',
]);

/**
 * style 속성 필터.
 * DOMPurify 에는 CSS 속성 허용목록 옵션이 없으므로 훅으로 직접 처리한다.
 * url()/expression() 은 값 안에 스크립트를 숨길 수 있어 통째로 버린다.
 */
function sanitizeStyleAttribute(value: string): string {
  return value
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const idx = decl.indexOf(':');
      if (idx < 0) return false;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const val = decl.slice(idx + 1).trim().toLowerCase();
      if (!ALLOWED_CSS.has(prop)) return false;
      return !/url\s*\(|expression\s*\(|javascript:|@import|\\/.test(val);
    })
    .join('; ');
}

/* 훅은 전역이므로 모듈 로드 시 한 번만 등록한다 */
let hookRegistered = false;
function ensureHook(): void {
  if (hookRegistered) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as Element;
    if (typeof el.getAttribute !== 'function' || !el.hasAttribute?.('style')) return;
    const safe = sanitizeStyleAttribute(el.getAttribute('style') ?? '');
    if (safe) el.setAttribute('style', safe);
    else el.removeAttribute('style');
  });
  hookRegistered = true;
}

/** 공통 설정. USE_PROFILES 는 절대 함께 쓰지 않는다 —
 *  프로필이 ALLOWED_TAGS 를 덮어써 form/input 같은 태그가 통과한다. */
const BASE_CONFIG = {
  // javascript:, data: 등 실행 가능한 스킴 차단 (상대경로·http(s)·mailto·tel 만 허용)
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[/#])/i,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  // 태그를 지울 때 내용도 함께 지운다 (<script>alert()</script> → 텍스트 잔존 방지)
  KEEP_CONTENT: false,
} as const;

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  ensureHook();
  return DOMPurify.sanitize(input, { ...BASE_CONFIG, ALLOWED_TAGS, ALLOWED_ATTR });
}

/** Embed 블록용 — iframe 은 허용하되 출처를 화이트리스트로 제한한다 */
const EMBED_HOST_ALLOWLIST = [
  'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
  'player.vimeo.com', 'www.google.com', 'maps.google.com',
];

export function sanitizeEmbedHtml(input: string): string {
  if (!input) return '';

  ensureHook();
  const cleaned = DOMPurify.sanitize(input, {
    ...BASE_CONFIG,
    /* img 가 빠져 있으면 <a class="logo"><img></a> 같은 흔한 조각이 통째로
       사라진다 — 정화 뒤 남는 게 없어 블록이 하나도 만들어지지 않는다.
       그림은 embed 에서도 정상적인 내용물이다. */
    ALLOWED_TAGS: [...ALLOWED_TAGS, 'iframe', 'div', 'figure', 'figcaption', 'img', 'picture', 'source'],
    ALLOWED_ATTR: [
      ...ALLOWED_ATTR,
      'src', 'alt', 'srcset', 'sizes', 'width', 'height',
      'allow', 'allowfullscreen', 'title', 'loading', 'frameborder',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?:|[/#])/i,
  });

  // DOMPurify 는 iframe 태그만 허용할 뿐 출처는 모른다 — 호스트 검사는 우리가 한다
  return cleaned.replace(/<iframe\b[^>]*>(?:[\s\S]*?<\/iframe>)?/gi, (match) => {
    const src = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(match);
    const url = src?.[2] ?? src?.[3];
    if (!url) return '';
    try {
      const host = new URL(url, 'https://example.com').hostname;
      return EMBED_HOST_ALLOWLIST.includes(host) ? match : '';
    } catch {
      return '';
    }
  });
}
