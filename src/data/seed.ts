import { flattenNav } from '@/data/navigation';
import type { LocalizedText, PageDocument, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 시드 데이터 — 네비게이션의 모든 경로에 대응하는 페이지를 미리 만들어 둔다.
 * 관리자는 빈 화면이 아니라 "편집 가능한 초안"에서 시작한다.
 * ========================================================================== */

let seq = 0;
const bid = (prefix: string) => `${prefix}-${(seq += 1).toString(36)}`;

function loc(ko: string, en?: string): LocalizedText {
  return en ? { ko, en } : { ko };
}

/** 히어로 + 본문 2단 구성의 기본 페이지 */
function starterContent(title: string, subtitle: string, navLabel: string): PuckPageData {
  const heroId = bid('sec-hero');
  const bodyId = bid('sec-body');
  const canvasId = bid('canvas');

  return {
    root: { props: { background: '#ffffff', fontFamily: 'var(--font-noto-kr), sans-serif' } },
    content: [
      { type: 'Section', props: { id: heroId } },
      { type: 'Section', props: { id: bodyId } },
    ],
    zones: {
      /* --- HERO 섹션: 자유 캔버스로 X/Y 자유 배치 --- */
      [`${heroId}:content`]: [{ type: 'FreeCanvas', props: { id: canvasId } }],
      [`${canvasId}:layers`]: [
        {
          type: 'Text',
          props: {
            id: bid('t'),
            name: 'Hero 제목',
            trackingId: `hero-title-${navLabel.toLowerCase()}`,
            html: loc(title),
            tag: 'h1',
            placement: { x: 64, y: 180, z: 2 },
            style: {
              width: 720,
              color: '#ffffff',
              typography: { fontSize: 60, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1.5 },
            },
          },
        },
        {
          type: 'Text',
          props: {
            id: bid('t'),
            name: 'Hero 부제',
            trackingId: `hero-sub-${navLabel.toLowerCase()}`,
            html: loc(subtitle),
            tag: 'p',
            placement: { x: 64, y: 300, z: 2 },
            style: { width: 560, color: '#a8b1c2', typography: { fontSize: 18, lineHeight: 1.7 } },
          },
        },
        {
          type: 'Button',
          props: {
            id: bid('b'),
            name: 'Hero CTA',
            trackingId: `hero-cta-${navLabel.toLowerCase()}`,
            conversionGoal: 'hero_cta',
            label: loc('자세히 보기', 'Learn more'),
            action: { type: 'scrollTo', value: bodyId, target: '_self' },
            placement: { x: 64, y: 400, z: 3 },
            style: {
              width: 190,
              height: 54,
              color: '#0d0f14',
              background: { color: '#ffffff' },
              border: { radius: 999, style: 'none' },
              typography: { fontSize: 15, fontWeight: 700, textAlign: 'center' },
              flex: { direction: 'row', justify: 'center', align: 'center' },
              cursor: 'pointer',
              transition: 'all .18s ease',
            },
            states: { hover: { background: { color: '#3b82f6' }, color: '#ffffff', transform: { scale: 1.03 } } },
          },
        },
        {
          type: 'Shape',
          props: {
            id: bid('s'),
            name: '장식 원',
            trackingDisabled: true,
            kind: 'circle',
            fill: 'rgba(59,130,246,.22)',
            placement: { x: 880, y: 120, z: 1 },
            style: { width: 380, height: 380 },
          },
        },
      ],

      /* --- 본문 섹션: Flex 컨테이너 --- */
      [`${bodyId}:content`]: [
        {
          type: 'Text',
          props: {
            id: bid('t'),
            name: '본문 제목',
            html: loc(`${navLabel} 소개`),
            tag: 'h2',
            style: { color: '#111827', typography: { fontSize: 34, fontWeight: 700, lineHeight: 1.3 } },
          },
        },
        {
          type: 'Text',
          props: {
            id: bid('t'),
            name: '본문',
            html: loc(
              'K-SOHO GLOBAL은 대한민국 중소기업 브랜드의 해외 진출을 지원합니다. 이 문단을 클릭해 내용을 수정하고, 우측 패널에서 색상·폰트·여백을 자유롭게 조정하세요.',
            ),
            tag: 'p',
            style: { maxWidth: 720, color: '#4b5563', typography: { fontSize: 17, lineHeight: 1.8 } },
          },
        },
      ],
    },
  };
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
    content: starterContent(
      'K-SOHO GLOBAL',
      '대한민국 소상공인 브랜드를 세계 시장으로. BEAUTY · FOOD · LIVING · FASHION · CRAFT',
      'home',
    ),
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
      content: starterContent(item.label, `${item.label} 페이지의 히어로 문구를 입력하세요.`, item.id.replace(/\./g, '-')),
      canvasWidth: 1440,
      sourceLocale: 'ko' as const,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      _order: i,
    }))
    .map(({ _order, ...page }) => page),
];
