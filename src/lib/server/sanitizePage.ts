import 'server-only';
import { sanitizeEmbedHtml, sanitizeHtml } from '@/lib/sanitize';
import { isLocalizedText } from '@/lib/translate/walk';
import type { PageDocument, PuckBlock, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 저장 직전 정화 — 신뢰 경계
 * 캔버스 JSON 안의 모든 HTML 문자열(다국어 슬롯 포함)을 훑어 정화한다.
 * ========================================================================== */

function sanitizeBlock(block: PuckBlock): PuckBlock {
  const props = { ...block.props };

  // 1) 다국어 리치텍스트 (html/label/alt/…) — 로케일 슬롯마다 정화
  for (const [key, value] of Object.entries(props)) {
    if (!isLocalizedText(value)) continue;
    const next: Record<string, unknown> = { ...value };
    for (const [locale, text] of Object.entries(value)) {
      if (locale === '_meta' || typeof text !== 'string') continue;
      next[locale] = sanitizeHtml(text);
    }
    props[key] = next;
  }

  // 2) Embed 블록의 raw HTML — iframe 출처 화이트리스트 적용
  if (block.type === 'Embed' && typeof props.html === 'string') {
    props.html = sanitizeEmbedHtml(props.html);
  }

  return { ...block, props: props as PuckBlock['props'] };
}

export function sanitizePageContent(data: PuckPageData): PuckPageData {
  return {
    root: data.root,
    content: (data.content ?? []).map(sanitizeBlock),
    zones: Object.fromEntries(Object.entries(data.zones ?? {}).map(([zone, blocks]) => [zone, blocks.map(sanitizeBlock)])),
  };
}

export function sanitizePage(page: PageDocument): PageDocument {
  return { ...page, content: sanitizePageContent(page.content) };
}
