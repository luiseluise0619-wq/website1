'use client';

import { create } from 'zustand';
import { newPageId, normalizePath } from '@/lib/id';
import { setLocalized, DEFAULT_LOCALE } from '@/lib/i18n';
import { getTemplate, templateSourceLocale, titleText } from '@/data/templates';
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
  heatmapMetric: 'clicks' | 'ctr' | 'rage' | 'dead';
  heatmapRange: { from: string; to: string };
  analytics: PageAnalyticsSummary | null;
  analyticsLoading: boolean;
  analyticsError: string | null;

  dirty: boolean;
  /** 저장이 필요한 페이지 id — 저장은 '지금 보고 있는 페이지'만이 아니다 */
  dirtyPageIds: string[];
  /** 편집을 시작할 때(불러오기·마지막 저장) 본 판 — 남의 저장을 덮어쓰지 않기 위한 기준 */
  baseRevisions: Record<string, number>;
  saving: boolean;
  lastSavedAt: string | null;

  /**
   * 자유 배치 캔버스에서 선택된 요소의 Puck 인스턴스 id.
   * Puck 은 중첩 DropZone 안의 항목을 선택 대상으로 받아주지 않으므로,
   * 조작 레이어(FreeTransformLayer)와 인스펙터(RightPanel)가 이 값을 공유한다.
   */
  pickedElementId: string | null;
}

export interface EditorActions {
  loadPages: (pages: PageDocument[]) => void;
  setActivePage: (pageId: string) => void;
  createPage: (input: { path: string; title: string; navId?: string; templateId?: string }) => string;
  /** 기존 페이지를 통째로 복제한다 (국가별 랜딩처럼 같은 구성을 여러 벌 만들 때) */
  duplicatePage: (pageId: string) => string | null;
  /** 현재 페이지 내용을 템플릿으로 교체한다 */
  applyTemplate: (pageId: string, templateId: string) => void;
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
  setHeatmapMetric: (metric: 'clicks' | 'ctr' | 'rage' | 'dead') => void;
  setHeatmapRange: (range: { from: string; to: string }) => void;
  setAnalytics: (summary: PageAnalyticsSummary | null) => void;
  setAnalyticsLoading: (v: boolean) => void;
  setAnalyticsError: (message: string | null) => void;

  setSaving: (v: boolean) => void;
  markSaved: (saved?: Array<{ id: string; revision: number }>) => void;
  setPickedElement: (id: string | null) => void;

  activePage: () => PageDocument | null;
}

export type EditorStore = EditorState & EditorActions;

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export const useEditorStore = create<EditorStore>((set, get) => {
  /** 바뀐 페이지를 저장 대기 목록에 넣는다 (중복 없이) */
  const markDirty = (ids: string[], pageId: string) => (ids.includes(pageId) ? ids : [...ids, pageId]);

  const patchPage = (pageId: string, fn: (page: PageDocument) => PageDocument) =>
    set((s) => {
      const index = s.pages.findIndex((p) => p.id === pageId);
      if (index === -1) return {};
      const pages = [...s.pages];
      pages[index] = { ...fn(pages[index]), updatedAt: new Date().toISOString() };
      return { pages, dirty: true, dirtyPageIds: markDirty(s.dirtyPageIds, pageId) };
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
    dirtyPageIds: [],
    baseRevisions: {},
    saving: false,
    lastSavedAt: null,
    pickedElementId: null,

    loadPages: (pages) =>
      set({
        pages,
        activePageId: pages[0]?.id ?? null,
        dirty: false,
        dirtyPageIds: [],
        baseRevisions: Object.fromEntries(pages.map((p) => [p.id, p.revision])),
      }),

    setActivePage: (activePageId) => set({ activePageId, analytics: null, analyticsError: null }),

    createPage: ({ path, title, navId, templateId }) => {
      const id = newPageId();
      const now = new Date().toISOString();
      const locale = get().editingLocale;
      const template = templateId ? getTemplate(templateId) : null;
      /* 템플릿 문구가 쓰인 언어가 곧 이 페이지의 번역 원문이다 (templateSourceLocale 주석 참고) */
      const source = template ? templateSourceLocale(template, locale) : locale;
      const page: PageDocument = {
        id,
        path: normalizePath(path),
        title,
        navId,
        status: 'draft',
        seo: { title: titleText(title, locale, source) },
        content: template ? template.build({ title, locale }) : emptyPuckData(),
        canvasWidth: 1440,
        sourceLocale: source,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };
      set((s) => ({ pages: [...s.pages, page], activePageId: id, dirty: true, dirtyPageIds: markDirty(s.dirtyPageIds, id) }));
      return id;
    },

    duplicatePage: (pageId) => {
      const source = get().pages.find((p) => p.id === pageId);
      if (!source) return null;

      /* 경로는 페이지의 신원이다 — 겹치면 저장이 거부되므로 비어 있는 번호를 찾는다 */
      const taken = new Set(get().pages.map((p) => p.path));
      let path = `${source.path}-copy`;
      for (let n = 2; taken.has(path); n += 1) path = `${source.path}-copy-${n}`;

      const id = newPageId();
      const now = new Date().toISOString();
      const page: PageDocument = {
        ...source,
        id,
        path,
        title: `${source.title} 사본`,
        /* 사본은 초안에서 시작한다 — 복제하자마자 공개되면 사고다 */
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        revision: 1,
        // 깊은 복사: 얕게 두면 원본과 캔버스를 공유해 한쪽 수정이 양쪽에 반영된다
        content: JSON.parse(JSON.stringify(source.content)) as PageDocument['content'],
        seo: JSON.parse(JSON.stringify(source.seo)) as PageDocument['seo'],
      };
      set((s) => ({ pages: [...s.pages, page], activePageId: id, dirty: true, dirtyPageIds: markDirty(s.dirtyPageIds, id) }));
      return id;
    },

    applyTemplate: (pageId, templateId) =>
      patchPage(pageId, (p) => {
        const template = getTemplate(templateId);
        const locale = get().editingLocale;
        return {
          ...p,
          content: template.build({ title: p.title, locale }),
          /* 본문을 통째로 갈아끼우므로 원문 언어도 새 문구의 언어를 따라간다 */
          sourceLocale: templateSourceLocale(template, locale),
          revision: p.revision + 1,
        };
      }),

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
        return {
          pages,
          activePageId: s.activePageId === pageId ? pages[0]?.id ?? null : s.activePageId,
          dirty: true,
          // 지워진 페이지는 저장 대기 목록에서도 빠져야 한다(서버에는 이미 없다)
          dirtyPageIds: s.dirtyPageIds.filter((id) => id !== pageId),
        };
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

    setPickedElement: (pickedElementId) => set({ pickedElementId }),

    setSaving: (saving) => set({ saving }),
    markSaved: (saved = []) =>
      set((s) => ({
        dirty: false,
        dirtyPageIds: [],
        saving: false,
        lastSavedAt: new Date().toISOString(),
        /* 방금 저장한 판이 다음 저장의 기준이 된다 */
        baseRevisions: { ...s.baseRevisions, ...Object.fromEntries(saved.map((p) => [p.id, p.revision])) },
      })),

    activePage: () => {
      const { pages, activePageId } = get();
      return pages.find((p) => p.id === activePageId) ?? null;
    },
  };
});
