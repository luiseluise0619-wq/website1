'use client';

import { translateBatch } from './client';
import {
  applyTranslationPatches,
  autoMeta,
  collectLocalizedFields,
  pendingFields,
  type TranslationPatch,
} from './walk';
import type { LocaleCode, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 페이지 일괄 자동번역 파이프라인 (에디터 '자동 번역' 버튼의 본체)
 * -----------------------------------------------------------------------------
 * 설계 포인트
 *  · HTML 필드와 평문 필드를 분리해 호출한다 (DeepL 의 tag_handling 이 다름)
 *  · 언어 하나당 한 번의 요청으로 묶어 API 비용과 지연을 줄인다
 *  · 사람이 검수한 번역(manual)은 기본적으로 건드리지 않는다 (force 로 무시 가능)
 * ========================================================================== */

export interface TranslatePageOptions {
  data: PuckPageData;
  sourceLocale: LocaleCode;
  targets: LocaleCode[];
  /** 검수 완료된 번역까지 덮어쓸지 */
  force?: boolean;
  /** 진행률 콜백 — 언어 단위로 호출된다 */
  onProgress?: (done: number, total: number, locale: LocaleCode) => void;
}

export interface TranslatePageResult {
  data: PuckPageData;
  translatedCount: number;
  skipped: number;
  errors: Array<{ locale: LocaleCode; message: string }>;
}

export async function translatePage({
  data,
  sourceLocale,
  targets,
  force = false,
  onProgress,
}: TranslatePageOptions): Promise<TranslatePageResult> {
  const allRefs = collectLocalizedFields(data, sourceLocale);
  const errors: TranslatePageResult['errors'] = [];
  const patches: TranslationPatch[] = [];
  let skipped = 0;

  const workTargets = targets.filter((l) => l !== sourceLocale);

  for (const [i, locale] of workTargets.entries()) {
    const refs = pendingFields(allRefs, locale, sourceLocale, { force });
    skipped += allRefs.length - refs.length;
    if (!refs.length) {
      onProgress?.(i + 1, workTargets.length, locale);
      continue;
    }

    // HTML/평문을 나눠 각각 한 번씩 호출
    const groups: Array<{ html: boolean; items: typeof refs }> = [
      { html: false, items: refs.filter((r) => !r.isHtml) },
      { html: true, items: refs.filter((r) => r.isHtml) },
    ];

    for (const group of groups) {
      if (!group.items.length) continue;
      try {
        const result = await translateBatch({
          texts: group.items.map((r) => r.sourceText),
          source: sourceLocale,
          targets: [locale],
          html: group.html,
        });
        const translated = result[locale] ?? [];
        group.items.forEach((ref, idx) => {
          const text = translated[idx];
          if (typeof text !== 'string' || !text.trim()) return;
          patches.push({
            blockPath: ref.blockPath,
            propKey: ref.propKey,
            locale,
            text,
            meta: autoMeta(result._provider === 'none' ? undefined : result._provider, ref.sourceText),
          });
        });
      } catch (err) {
        errors.push({ locale, message: err instanceof Error ? err.message : String(err) });
      }
    }
    onProgress?.(i + 1, workTargets.length, locale);
  }

  return {
    data: applyTranslationPatches(data, patches),
    translatedCount: patches.length,
    skipped,
    errors,
  };
}
