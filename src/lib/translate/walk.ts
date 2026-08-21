import { hashText, translationState } from '@/lib/i18n';
import type { LocaleCode, LocalizedText, PuckBlock, PuckPageData, TranslationMeta } from '@/types/schema';

/* =============================================================================
 * Puck 문서 다국어 워커
 * -----------------------------------------------------------------------------
 * "페이지 전체 자동번역" 은 결국 세 단계다:
 *   1) collectLocalizedFields  — 문서를 훑어 번역 대상 필드를 모두 찾는다
 *   2) (서버 호출)             — 원문 배열을 언어별로 한 번에 번역한다
 *   3) applyTranslations       — 결과를 같은 경로에 다시 써넣는다
 * 경로(path)를 문자열로 들고 다니기 때문에 중첩 zone 도 안전하게 왕복한다.
 * ========================================================================== */

/** LocalizedText 로 취급할 props 키 — 블록이 늘어나도 여기만 갱신하면 된다 */
const LOCALIZED_KEYS = ['html', 'label', 'alt', 'title', 'description', 'caption'] as const;

/** 값이 LocalizedText 모양인지 판별 (문자열 맵 + 로케일 키) */
export function isLocalizedText(v: unknown): v is LocalizedText {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v as object).filter((k) => k !== '_meta');
  return keys.length > 0 && keys.every((k) => /^(ko|en|th|vi|ja|zh)$/.test(k));
}

export interface LocalizedFieldRef {
  /** 'content.0' / 'zones.abc:content.2' 형태의 블록 경로 */
  blockPath: string;
  blockId: string;
  blockType: string;
  propKey: string;
  value: LocalizedText;
  /** 원문(sourceLocale) 텍스트 */
  sourceText: string;
  /** HTML 태그를 포함하는가 → 번역 시 tag_handling 활성화 */
  isHtml: boolean;
}

/** 문서 전체에서 번역 대상 필드를 수집한다 */
export function collectLocalizedFields(data: PuckPageData, sourceLocale: LocaleCode): LocalizedFieldRef[] {
  const refs: LocalizedFieldRef[] = [];

  const visitBlock = (block: PuckBlock, blockPath: string) => {
    for (const [key, value] of Object.entries(block.props ?? {})) {
      if (!LOCALIZED_KEYS.includes(key as (typeof LOCALIZED_KEYS)[number])) continue;
      if (!isLocalizedText(value)) continue;
      const sourceText = value[sourceLocale] ?? '';
      if (!sourceText.trim()) continue;
      refs.push({
        blockPath,
        blockId: String(block.props?.id ?? ''),
        blockType: block.type,
        propKey: key,
        value,
        sourceText,
        isHtml: /<[a-z][\s\S]*>/i.test(sourceText),
      });
    }
  };

  (data.content ?? []).forEach((block, i) => visitBlock(block, `content.${i}`));
  for (const [zone, blocks] of Object.entries(data.zones ?? {})) {
    blocks.forEach((block, i) => visitBlock(block, `zones.${zone}.${i}`));
  }
  return refs;
}

/** 아직 번역이 필요한 항목만 추리기 (미번역 + 원문 변경분) */
export function pendingFields(
  refs: LocalizedFieldRef[],
  target: LocaleCode,
  sourceLocale: LocaleCode,
  { force = false }: { force?: boolean } = {},
): LocalizedFieldRef[] {
  if (force) return refs.filter((r) => target !== sourceLocale);
  return refs.filter((r) => {
    if (target === sourceLocale) return false;
    const state = translationState(r.value, target, sourceLocale);
    // 'manual'(사람이 검수한 번역)은 덮어쓰지 않는다 — 자동번역이 검수 결과를 지우면 안 된다
    return state === 'missing' || state === 'stale';
  });
}

export interface TranslationPatch {
  blockPath: string;
  propKey: string;
  locale: LocaleCode;
  text: string;
  meta: TranslationMeta;
}

/** 번역 결과를 문서에 반영한 새 PuckPageData 반환 (불변) */
export function applyTranslationPatches(data: PuckPageData, patches: TranslationPatch[]): PuckPageData {
  if (!patches.length) return data;

  const next: PuckPageData = {
    root: data.root,
    content: [...(data.content ?? [])],
    zones: Object.fromEntries(Object.entries(data.zones ?? {}).map(([k, v]) => [k, [...v]])),
  };

  for (const patch of patches) {
    const parts = patch.blockPath.split('.');
    let list: PuckBlock[] | undefined;
    let index: number;

    if (parts[0] === 'content') {
      list = next.content;
      index = Number(parts[1]);
    } else {
      // zones.<zoneId>.<index> — zoneId 자체에 '.' 이 없다는 보장은 없으므로 뒤에서 자른다
      index = Number(parts[parts.length - 1]);
      const zoneKey = parts.slice(1, -1).join('.');
      list = next.zones?.[zoneKey];
    }
    if (!list || !Number.isInteger(index) || !list[index]) continue;

    const block = list[index];
    const currentValue = block.props?.[patch.propKey];
    if (!isLocalizedText(currentValue)) continue;

    list[index] = {
      ...block,
      props: {
        ...block.props,
        [patch.propKey]: {
          ...currentValue,
          [patch.locale]: patch.text,
          _meta: { ...(currentValue._meta ?? {}), [patch.locale]: patch.meta },
        },
      },
    };
  }
  return next;
}

/** 자동번역 메타 생성 헬퍼 */
export function autoMeta(provider: TranslationMeta['provider'], sourceText: string): TranslationMeta {
  return {
    source: 'auto',
    provider,
    sourceHash: hashText(sourceText),
    translatedAt: new Date().toISOString(),
    reviewed: false,
  };
}

/** 번역 커버리지 리포트 — 에디터 상단 '번역 현황' 표시용 */
export function coverageReport(
  data: PuckPageData,
  sourceLocale: LocaleCode,
  targets: LocaleCode[],
): Array<{ locale: LocaleCode; total: number; done: number; auto: number; missing: number; stale: number }> {
  const refs = collectLocalizedFields(data, sourceLocale);
  return targets.map((locale) => {
    let done = 0;
    let auto = 0;
    let missing = 0;
    let stale = 0;
    for (const ref of refs) {
      const state = translationState(ref.value, locale, sourceLocale);
      if (state === 'manual') done += 1;
      else if (state === 'auto') auto += 1;
      else if (state === 'stale') stale += 1;
      else missing += 1;
    }
    return { locale, total: refs.length, done, auto, missing, stale };
  });
}
