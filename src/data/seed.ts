import { flattenNav } from '@/data/navigation';
import type { LocalizedText, PageDocument, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 시드 데이터 — 네비게이션의 모든 경로에 대응하는 페이지를 미리 만들어 둔다.
 * 관리자는 빈 화면이 아니라 "편집 가능한 초안"에서 시작한다.
 * ========================================================================== */

import { getTemplate, suggestTemplate } from '@/data/templates';

/** IA 섹션에 맞는 템플릿으로 초안을 만든다 (BUSINESS→문의폼, VIDEO→갤러리 …) */
function contentFor(title: string, navId?: string): PuckPageData {
  return suggestTemplate(navId).build({ title, locale: 'ko' });
}

const now = new Date().toISOString();

/** 네비게이션의 모든 리프 경로 + 루트 경로에 대해 초안 페이지를 생성한다 */
export const SEED_PAGES: PageDocument[] = [
  {
    id: 'page_home',
    path: '/',
    title: 'K-SOHO GLOBAL',
    status: 'published',
    seo: {
      title: { ko: 'K-SOHO GLOBAL — 대한민국 브랜드의 글로벌 커머스', en: 'K-SOHO GLOBAL' },
      description: {
        ko: 'K-BEAUTY, K-FOOD, K-LIFESTYLE 브랜드의 해외 진출 플랫폼',
        en: 'Global commerce platform for Korean SOHO brands',
      },
    },
    content: getTemplate('brand-grid').build({ title: 'K-SOHO GLOBAL', locale: 'ko' }),
    canvasWidth: 1440,
    sourceLocale: 'ko',
    createdAt: now,
    updatedAt: now,
    revision: 1,
  },
  ...flattenNav()
    .filter((item) => item.path)
    .map((item, i) => ({
      id: `page_${item.id.replace(/\./g, '_')}`,
      path: item.path as string,
      title: item.label,
      navId: item.id,
      status: (item.depth === 0 ? 'published' : 'published') as PageDocument['status'],
      seo: {
        title: { ko: item.label } as LocalizedText,
        description: { ko: `K-SOHO GLOBAL ${item.label} 페이지` } as LocalizedText,
      },
      content: contentFor(item.label, item.id),
      canvasWidth: 1440,
      sourceLocale: 'ko' as const,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      _order: i,
    }))
    .map(({ _order, ...page }) => page),
];
