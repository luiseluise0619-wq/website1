import type { NavNode, SiteConfig } from '@/types/schema';

/* =============================================================================
 * K-SOHO GLOBAL — Information Architecture
 * 이 트리 하나가 (1) 글로벌 네비게이션 (2) 에디터 좌측 Page Tree
 * (3) 신규 페이지 생성 시 경로 제안 — 세 곳의 단일 진실 공급원(SSOT)이다.
 * ========================================================================== */

export const NAVIGATION: NavNode[] = [
  {
    id: 'brand',
    label: 'BRAND',
    path: '/brand',
    order: 1,
    visible: true,
    children: [
      { id: 'brand.beauty', label: 'BEAUTY', path: '/brand/beauty' },
      { id: 'brand.food', label: 'FOOD', path: '/brand/food' },
      { id: 'brand.living', label: 'LIVING', path: '/brand/living' },
      { id: 'brand.fashion', label: 'FASHION', path: '/brand/fashion' },
      { id: 'brand.craft', label: 'CRAFT', path: '/brand/craft' },
      { id: 'brand.local', label: 'LOCAL', path: '/brand/local' },
    ],
  },
  {
    id: 'ceo-story',
    label: 'CEO STORY',
    path: '/ceo-story',
    order: 2,
    visible: true,
    children: [
      { id: 'ceo-story.founder', label: '창업자', path: '/ceo-story/founder' },
      { id: 'ceo-story.philosophy', label: '브랜드철학', path: '/ceo-story/philosophy' },
      { id: 'ceo-story.manufacturing', label: '제조 이야기', path: '/ceo-story/manufacturing' },
      { id: 'ceo-story.challenge', label: '성공 도전 스토리', path: '/ceo-story/challenge' },
    ],
  },
  {
    id: 'global',
    label: 'GLOBAL',
    path: '/global',
    order: 3,
    visible: true,
    children: [
      { id: 'global.thailand', label: 'THAILAND', path: '/global/thailand' },
      { id: 'global.japan', label: 'JAPAN', path: '/global/japan' },
      { id: 'global.vietnam', label: 'VIETNAM', path: '/global/vietnam' },
      { id: 'global.singapore', label: 'SINGAPORE', path: '/global/singapore' },
      { id: 'global.usa', label: 'USA', path: '/global/usa' },
    ],
  },
  {
    id: 'market',
    label: 'MARKET',
    path: '/market',
    order: 4,
    visible: true,
    children: [
      { id: 'market.k-beauty', label: 'K-BEAUTY', path: '/market/k-beauty' },
      { id: 'market.k-food', label: 'K-FOOD', path: '/market/k-food' },
      { id: 'market.k-lifestyle', label: 'K-LIFESTYLE', path: '/market/k-lifestyle' },
      { id: 'market.ecommerce', label: '해외시장 이커머스', path: '/market/ecommerce' },
      { id: 'market.export-policy', label: '수출정책', path: '/market/export-policy' },
    ],
  },
  {
    id: 'video',
    label: 'VIDEO',
    path: '/video',
    order: 5,
    visible: true,
    children: [
      { id: 'video.ksoho-tv', label: 'K-SOHO TV', path: '/video/ksoho-tv' },
      { id: 'video.ceo-interview', label: 'CEO interview', path: '/video/ceo-interview' },
      { id: 'video.shorts', label: 'Shorts', path: '/video/shorts' },
      { id: 'video.broadcast', label: '방송', path: '/video/broadcast' },
    ],
  },
  {
    id: 'buy',
    label: 'BUY',
    path: '/buy',
    order: 6,
    visible: true,
    children: [
      { id: 'buy.products', label: '제품보기', path: '/buy/products' },
      { id: 'buy.domestic', label: '국내판매처', path: '/buy/domestic' },
      { id: 'buy.overseas', label: '해외판매처', path: '/buy/overseas' },
    ],
  },
  {
    id: 'business',
    label: 'BUSINESS',
    path: '/business',
    order: 7,
    visible: true,
    children: [
      { id: 'business.buyer-inquiry', label: 'Buyer Inquiry', path: '/business/buyer-inquiry' },
      { id: 'business.distribution', label: 'Distribution', path: '/business/distribution' },
      { id: 'business.partnership', label: 'Partnership', path: '/business/partnership' },
      { id: 'business.media-inquiry', label: 'Media Inquiry', path: '/business/media-inquiry' },
    ],
  },
];

export const SITE_CONFIG: SiteConfig = {
  title: 'K-SOHO GLOBAL',
  defaultLocale: 'ko',
  locales: ['ko', 'en', 'th', 'ja', 'vi'],
  navigation: NAVIGATION,
};

/* ---- 트리 유틸 ------------------------------------------------------------ */

/** 네비게이션 트리를 평탄화 — { id, label, path, depth, parentId } */
export interface FlatNavItem {
  id: string;
  label: string;
  path: string | null;
  depth: number;
  parentId: string | null;
}

export function flattenNav(nodes: NavNode[] = NAVIGATION, depth = 0, parentId: string | null = null): FlatNavItem[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.label, path: node.path, depth, parentId },
    ...flattenNav(node.children ?? [], depth + 1, node.id),
  ]);
}

export function findNavByPath(path: string, nodes: NavNode[] = NAVIGATION): NavNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const hit = node.children && findNavByPath(path, node.children);
    if (hit) return hit;
  }
  return undefined;
}

export function findNavById(id: string, nodes: NavNode[] = NAVIGATION): NavNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children && findNavById(id, node.children);
    if (hit) return hit;
  }
  return undefined;
}

/** '/global/thailand' → [BRAND루트..., 자신] 형태의 breadcrumb */
export function navBreadcrumb(path: string, nodes: NavNode[] = NAVIGATION, trail: NavNode[] = []): NavNode[] {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.path === path) return next;
    if (node.children) {
      const hit = navBreadcrumb(path, node.children, next);
      if (hit.length) return hit;
    }
  }
  return [];
}

/** 네비게이션이 기대하는 전체 경로 목록 — 미생성 페이지 진단에 사용 */
export function allNavPaths(): string[] {
  return flattenNav().map((i) => i.path).filter((p): p is string => Boolean(p));
}
