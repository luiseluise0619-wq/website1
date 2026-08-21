'use client';

import { create } from 'zustand';
import { newPageId, normalizePath } from '@/lib/id';
import { setLocalized, DEFAULT_LOCALE } from '@/lib/i18n';
import type {
  LocaleCode,
  PageDocument,
  PuckPageData,
  SeoMeta,
} from '@/types/schema';
import type { PageAnalyticsSummary } from '@/types/analytics';

/* =============================================================================
 * Editor Shell Store (Zustand)
 * -----------------------------------------------------------------------------
 * 역할 분담이 중요하다:
 *   · 캔버스 요소 트리(추가/이동/스타일)  → Puck 이 자체 상태로 소유한다.
 *   · 그 바깥의 모든 것                    → 이 스토어가 소유한다.
 *       페이지 문서 CRUD, 라우트/SEO, 편집 로케일, 히트맵 토글, 분석 데이터.
 * Puck 은 onChange 로 JSON 을 넘겨주고, 우리는 그것을 activePage.content 에 커밋한다.
 * ========================================================================== */

const emptyPuckData = (): PuckPageData => ({ root: { props: {} }, content: [], zones: {} });

export interface EditorState {
  pages: PageDocument[];
  activePageId: string | null;

  /** i18n — 에디터가 지금 편집 중인 언어 */
  editingLocale: LocaleCode;
  /** 번역 상태 뱃지(미번역/자동/원문변경) 표시 */
  showTranslationBadges: boolean;
  translating: boolean;
  translationProgress: { done: number; total: number } | null;

  /** Analytics — 히트맵 오버레이 */
  heatmapEnabled: boolean;
  heatmapMetric: 'clicks' | 'ctr' | 'rage';
  heatmapRange: { from: string; to: string };
  analytics: PageAnalyticsSummary | null;
  analyticsLoading: boolean;
  analyticsError: string | null;

  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
}

export interface EditorActions {
  loadPages: (pages: PageDocument[]) => void;
  setActivePage: (pageId: string) => void;
  createPage: (input: { path: string; title: string; navId?: string }) => string;
  updatePageMeta: (
    pageId: string,
    patch: Partial<Pick<PageDocument, 'title' | 'path' | 'status' | 'navId' | 'enabledLocales' | 'canvasWidth'>>,
  ) => void;
  updateSeoText: (pageId: string, field: 'title' | 'description' | 'ogTitle' | 'ogDescription', value: string) => void;
  updateSeo: (pageId: string, patch: Partial<SeoMeta>) => void;
  deletePage: (pageId: string) => void;

  /** Puck onChange → 페이지 문서에 커밋 */
  commitContent: (pageId: string, content: PuckPageData) => void;

  setEditingLocale: (locale: LocaleCode) => void;
  toggleTranslationBadges: () => void;
  setTranslating: (v: boolean, progress?: { done: number; total: number } | null) => void;

  toggleHeatmap: () => void;
  setHeatmapMetric: (metric: 'clicks' | 'ctr' | 'rage') => void;
  setHeatmapRange: (range: { from: string; to: string }) => void;
  setAnalytics: (summary: PageAnalyticsSummary | null) => void;
  setAnalyticsLoading: (v: boolean) => void;
  setAnalyticsError: (message: string | null) => void;

  setSaving: (v: boolean) => void;
  markSaved: () => void;

  activePage: () => PageDocument | null;
}

export type EditorStore = EditorState & EditorActions;

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export const useEditorStore = create<EditorStore>((set, get) => {
  const patchPage = (pageId: string, fn: (page: PageDocument) => PageDocument) =>
    set((s) => {
      const index = s.pages.findIndex((p) => p.id === pageId);
      if (index === -1) return {};
      const pages = [...s.pages];
      pages[index] = { ...fn(pages[index]), updatedAt: new Date().toISOString() };
      return { pages, dirty: true };
    });

  return {
    pages: [],
    activePageId: null,
    editingLocale: DEFAULT_LOCALE,
    showTranslationBadges: true,
    translating: false,
    translationProgress: null,
    heatmapEnabled: false,
    heatmapMetric: 'clicks',
    heatmapRange: defaultRange(),
    analytics: null,
    analyticsLoading: false,
    analyticsError: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,

    loadPages: (pages) => set({ pages, activePageId: pages[0]?.id ?? null, dirty: false }),

    setActivePage: (activePageId) => set({ activePageId, analytics: null, analyticsError: null }),

    createPage: ({ path, title, navId }) => {
      const id = newPageId();
      const now = new Date().toISOString();
      const locale = get().editingLocale;
      const page: PageDocument = {
        id,
        path: normalizePath(path),
        title,
        navId,
        status: 'draft',
        seo: { title: { [locale]: title } },
        content: emptyPuckData(),
        canvasWidth: 1440,
        sourceLocale: locale,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };
      set((s) => ({ pages: [...s.pages, page], activePageId: id, dirty: true }));
      return id;
    },

    updatePageMeta: (pageId, patch) =>
      patchPage(pageId, (p) => ({ ...p, ...patch, ...(patch.path ? { path: normalizePath(patch.path) } : {}) })),

    updateSeoText: (pageId, field, value) => {
      const locale = get().editingLocale;
      patchPage(pageId, (p) => ({
        ...p,
        seo: { ...p.seo, [field]: setLocalized(p.seo[field], locale, value, { source: 'manual', reviewed: true }) },
      }));
    },

    updateSeo: (pageId, patch) => patchPage(pageId, (p) => ({ ...p, seo: { ...p.seo, ...patch } })),

    deletePage: (pageId) =>
      set((s) => {
        const pages = s.pages.filter((p) => p.id !== pageId);
        return { pages, activePageId: s.activePageId === pageId ? pages[0]?.id ?? null : s.activePageId, dirty: true };
      }),

    commitContent: (pageId, content) =>
      patchPage(pageId, (p) => (p.content === content ? p : { ...p, content, revision: p.revision + 1 })),

    setEditingLocale: (editingLocale) => set({ editingLocale }),
    toggleTranslationBadges: () => set((s) => ({ showTranslationBadges: !s.showTranslationBadges })),
    setTranslating: (translating, translationProgress = null) => set({ translating, translationProgress }),

    toggleHeatmap: () => set((s) => ({ heatmapEnabled: !s.heatmapEnabled })),
    setHeatmapMetric: (heatmapMetric) => set({ heatmapMetric }),
    setHeatmapRange: (heatmapRange) => set({ heatmapRange, analytics: null }),
    setAnalytics: (analytics) => set({ analytics, analyticsLoading: false, analyticsError: null }),
    setAnalyticsLoading: (analyticsLoading) => set({ analyticsLoading }),
    setAnalyticsError: (analyticsError) => set({ analyticsError, analyticsLoading: false }),

    setSaving: (saving) => set({ saving }),
    markSaved: () => set({ dirty: false, saving: false, lastSavedAt: new Date().toISOString() }),

    activePage: () => {
      const { pages, activePageId } = get();
      return pages.find((p) => p.id === activePageId) ?? null;
    },
  };
});
