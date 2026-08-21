import type { LocaleCode, LocalizedText, PuckBlock, PuckPageData } from '@/types/schema';

/* =============================================================================
 * 페이지 템플릿
 * -----------------------------------------------------------------------------
 * 관리자가 새 페이지를 만들 때 고르는 시작점. 백지에서 시작하면 무엇을 놓을지
 * 막막하므로, 섹션 구조가 이미 짜인 상태에서 내용만 바꾸도록 한다.
 *
 * 각 템플릿은 순수 함수다 — 같은 입력이면 같은 JSON 을 만든다.
 * 요소 id 는 페이지 안에서만 유일하면 되므로 빌드마다 새로 센다.
 * ========================================================================== */

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  /** 어떤 IA 섹션에 어울리는지 — 페이지 생성 시 기본값 추천에 쓴다 */
  suggestedFor?: string[];
  build: (input: { title: string; locale: LocaleCode }) => PuckPageData;
}

/** 페이지 단위 id 생성기 */
function makeIds(prefix: string) {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
}

const loc = (ko: string, en?: string): LocalizedText => (en ? { ko, en } : { ko });

/* ---- 공통 조각 -------------------------------------------------------------- */

interface Ctx {
  id: () => string;
  title: string;
  locale: LocaleCode;
}

/** 자유 배치 히어로 — 큰 제목·부제·CTA·장식 도형 */
function heroCanvas(ctx: Ctx, opts: { subtitle: string; cta: string; ctaTarget: string; dark?: boolean }) {
  const sectionId = ctx.id();
  const canvasId = ctx.id();
  const fg = opts.dark === false ? '#111827' : '#ffffff';
  const sub = opts.dark === false ? '#4b5563' : '#a8b1c2';

  return {
    section: { type: 'Section', props: { id: sectionId } } as PuckBlock,
    zones: {
      [`${sectionId}:content`]: [{ type: 'FreeCanvas', props: { id: canvasId } }],
      [`${canvasId}:layers`]: [
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: 'Hero 제목', trackingId: 'hero-title',
            html: loc(ctx.title), tag: 'h1',
            placement: { x: 64, y: 170, z: 2 },
            style: { width: 760, color: fg, typography: { fontSize: 60, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1.5 } },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: 'Hero 부제', trackingId: 'hero-sub',
            html: loc(opts.subtitle), tag: 'p',
            placement: { x: 64, y: 296, z: 2 },
            style: { width: 560, color: sub, typography: { fontSize: 18, lineHeight: 1.7 } },
          },
        },
        {
          type: 'Button',
          props: {
            id: ctx.id(), name: 'Hero CTA', trackingId: 'hero-cta', conversionGoal: 'hero_cta',
            label: loc(opts.cta), action: { type: 'scrollTo', value: opts.ctaTarget, target: '_self' },
            placement: { x: 64, y: 396, z: 3 },
            style: {
              width: 200, height: 54, color: '#0d0f14', background: { color: '#ffffff' },
              border: { radius: 999, style: 'none' },
              typography: { fontSize: 15, fontWeight: 700, textAlign: 'center' },
              flex: { direction: 'row', justify: 'center', align: 'center' },
              cursor: 'pointer', transition: 'all .18s ease',
            },
            states: { hover: { background: { color: '#3b82f6' }, color: '#fff', transform: { scale: 1.03 } } },
          },
        },
        {
          type: 'Shape',
          props: {
            id: ctx.id(), name: '장식 원', trackingDisabled: true,
            kind: 'circle', fill: 'rgba(59,130,246,.22)',
            placement: { x: 900, y: 110, z: 1 },
            style: { width: 360, height: 360 },
          },
        },
      ],
    },
    sectionStyle: { height: 560, background: { color: opts.dark === false ? '#f8fafc' : '#0d0f14' } },
  };
}

/** 제목 + 설명 한 쌍 */
function heading(ctx: Ctx, text: string, body: string): PuckBlock[] {
  return [
    {
      type: 'Text',
      props: {
        id: ctx.id(), name: '섹션 제목', html: loc(text), tag: 'h2',
        style: { color: '#111827', typography: { fontSize: 34, fontWeight: 700, lineHeight: 1.3 } },
      },
    },
    {
      type: 'Text',
      props: {
        id: ctx.id(), name: '섹션 설명', html: loc(body), tag: 'p',
        style: { maxWidth: 720, color: '#4b5563', typography: { fontSize: 17, lineHeight: 1.8 } },
      },
    },
  ];
}

function card(ctx: Ctx, title: string, body: string, image: string): { block: PuckBlock; zone: [string, PuckBlock[]] } {
  const id = ctx.id();
  return {
    block: { type: 'Container', props: { id } },
    zone: [
      `${id}:items`,
      [
        {
          type: 'Image',
          props: {
            id: ctx.id(), name: '카드 이미지', src: image, alt: loc(title), objectFit: 'cover',
            style: { width: '100%', height: 200, border: { radius: 12 }, overflow: 'hidden' },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: '카드 제목', html: loc(title), tag: 'h3',
            style: { color: '#111827', typography: { fontSize: 20, fontWeight: 700, lineHeight: 1.4 } },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: '카드 본문', html: loc(body), tag: 'p',
            style: { color: '#6b7280', typography: { fontSize: 14, lineHeight: 1.7 } },
          },
        },
      ],
    ],
  };
}

const PHOTO = {
  beauty: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800&q=80',
  food: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80',
  living: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
  factory: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80',
};

const ROOT_PROPS = { background: '#ffffff', fontFamily: 'var(--font-noto-kr), sans-serif' };

/* ---- 템플릿 정의 ------------------------------------------------------------ */

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'hero-intro',
    name: '히어로 + 소개',
    description: '자유 배치 히어로와 본문 한 단락. 가장 단순한 시작점.',
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: `${title} 페이지의 히어로 문구를 입력하세요.`, cta: '자세히 보기', ctaTarget: 'body' });
      const bodyId = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: bodyId } },
        ],
        zones: {
          ...hero.zones,
          [`${bodyId}:content`]: heading(ctx, `${title} 소개`, 'K-SOHO GLOBAL은 대한민국 중소기업 브랜드의 해외 진출을 지원합니다. 이 문단을 클릭해 내용을 수정하고, 우측 패널에서 색상·폰트·여백을 자유롭게 조정하세요.'),
        },
      };
    },
  },

  {
    id: 'brand-grid',
    name: '브랜드 카드 3열',
    description: '히어로 + 이미지 카드 3개 그리드. BRAND·MARKET 카테고리 소개용.',
    suggestedFor: ['brand', 'market'],
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: '대한민국 브랜드를 세계 시장으로.', cta: '브랜드 보기', ctaTarget: 'grid' });
      const gridSection = ctx.id();
      const gridId = ctx.id();
      const cards = [
        card(ctx, 'K-BEAUTY', '화장품·스킨케어 브랜드', PHOTO.beauty),
        card(ctx, 'K-FOOD', '식품·가공식품 브랜드', PHOTO.food),
        card(ctx, 'K-LIVING', '생활용품·리빙 브랜드', PHOTO.living),
      ];
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: gridSection } },
        ],
        zones: {
          ...hero.zones,
          [`${gridSection}:content`]: [
            ...heading(ctx, `${title} 브랜드`, '카드를 클릭해 이미지와 문구를 바꾸세요. 카드를 더 넣으려면 컨테이너 안으로 블록을 끌어다 놓습니다.'),
            { type: 'Container', props: { id: gridId, layoutMode: 'grid', name: '카드 그리드', style: { width: '100%', grid: { columns: 3, gap: 24 } } } },
          ],
          [`${gridId}:items`]: cards.map((c) => c.block),
          ...Object.fromEntries(cards.map((c) => c.zone)),
        },
      };
    },
  },

  {
    id: 'product-carousel',
    name: '제품 캐러셀',
    description: '히어로 + 좌우로 넘기는 제품 슬라이더. BUY 카테고리용.',
    suggestedFor: ['buy'],
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: '전 세계에서 만나는 대한민국 브랜드.', cta: '제품 보기', ctaTarget: 'products' });
      const section = ctx.id();
      const carouselId = ctx.id();
      const slides = [
        card(ctx, '제품 1', '제품 설명을 입력하세요.', PHOTO.beauty),
        card(ctx, '제품 2', '제품 설명을 입력하세요.', PHOTO.food),
        card(ctx, '제품 3', '제품 설명을 입력하세요.', PHOTO.living),
        card(ctx, '제품 4', '제품 설명을 입력하세요.', PHOTO.factory),
      ];
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: section } },
        ],
        zones: {
          ...hero.zones,
          [`${section}:content`]: [
            ...heading(ctx, '제품 보기', '슬라이드를 좌우로 넘겨 제품을 소개합니다. 우측 패널에서 한 화면에 보일 개수와 자동 재생을 조절하세요.'),
            { type: 'Carousel', props: { id: carouselId, slidesPerView: 3, gap: 24, loop: true, showArrows: true, showDots: true, autoplayMs: 0, name: '제품 캐러셀', style: { width: '100%' } } },
          ],
          [`${carouselId}:slides`]: slides.map((s) => s.block),
          ...Object.fromEntries(slides.map((s) => s.zone)),
        },
      };
    },
  },

  {
    id: 'story',
    name: '스토리 (이미지 + 글)',
    description: '큰 이미지와 긴 본문. CEO STORY·제조 이야기용.',
    suggestedFor: ['ceo-story'],
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: '브랜드가 만들어지기까지의 이야기.', cta: '이야기 읽기', ctaTarget: 'story', dark: true });
      const section = ctx.id();
      const rowId = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: section } },
        ],
        zones: {
          ...hero.zones,
          [`${section}:content`]: [
            ...heading(ctx, title, '창업의 계기, 제품에 담은 철학, 해외 진출에서 겪은 어려움을 이야기로 풀어 주세요.'),
            { type: 'Container', props: { id: rowId, layoutMode: 'flex', name: '이미지 + 글', style: { width: '100%', flex: { direction: 'row', gap: 32, align: 'flex-start', wrap: 'wrap' } } } },
          ],
          [`${rowId}:items`]: [
            {
              type: 'Image',
              props: {
                id: ctx.id(), name: '스토리 이미지', src: PHOTO.factory, alt: loc(title), objectFit: 'cover',
                style: { width: 460, height: 340, border: { radius: 16 }, overflow: 'hidden', flexItem: { grow: 0, shrink: 0, basis: 460 } },
              },
            },
            {
              type: 'Text',
              props: {
                id: ctx.id(), name: '스토리 본문',
                html: loc('여기에 이야기를 적어 주세요. 문단을 나누고, 중요한 문장은 굵게 강조하면 읽기 좋습니다.'),
                tag: 'p',
                style: { color: '#374151', typography: { fontSize: 17, lineHeight: 1.9 }, flexItem: { grow: 1, basis: 320 } },
              },
            },
          ],
        },
      };
    },
  },

  {
    id: 'inquiry',
    name: '문의 폼',
    description: '히어로 + 문의 접수 폼. BUSINESS(바이어·유통·제휴) 페이지용.',
    suggestedFor: ['business'],
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: '문의를 남겨 주시면 확인 후 연락드리겠습니다.', cta: '문의하기', ctaTarget: 'form' });
      const section = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: section } },
        ],
        zones: {
          ...hero.zones,
          [`${section}:content`]: [
            ...heading(ctx, title, '아래 항목을 채워 보내 주세요. 접수 내역은 관리자 화면에서 확인할 수 있습니다.'),
            {
              type: 'Form',
              props: {
                id: ctx.id(), name: '문의 폼', formName: 'buyer-inquiry', conversionGoal: 'inquiry_submit',
                fields: [
                  { name: 'company', label: loc('회사명', 'Company'), type: 'text', required: true },
                  { name: 'name', label: loc('담당자명', 'Contact name'), type: 'text', required: true },
                  { name: 'email', label: loc('이메일', 'Email'), type: 'email', required: true },
                  { name: 'country', label: loc('국가', 'Country'), type: 'select', required: false, options: 'Thailand\nJapan\nVietnam\nSingapore\nUSA\nOther' },
                  { name: 'message', label: loc('문의 내용', 'Message'), type: 'textarea', required: true },
                ],
                submitLabel: loc('문의하기', 'Send inquiry'),
                successMessage: loc('문의가 접수되었습니다. 확인 후 연락드리겠습니다.', 'Thank you. We will get back to you shortly.'),
                consentLabel: loc('개인정보 수집 및 이용에 동의합니다.', 'I agree to the collection and use of my personal data.'),
                style: {
                  width: '100%', maxWidth: 620,
                  padding: { top: 32, right: 32, bottom: 32, left: 32 },
                  background: { color: '#f8fafc' },
                  border: { radius: 16, style: 'solid', width: 1, color: '#e2e8f0' },
                },
              },
            },
          ],
        },
      };
    },
  },

  {
    id: 'video-gallery',
    name: '비디오 갤러리',
    description: '영상 3개 그리드. VIDEO(K-SOHO TV·인터뷰·Shorts)용.',
    suggestedFor: ['video'],
    build: ({ title, locale }) => {
      const ctx: Ctx = { id: makeIds('el'), title, locale };
      const hero = heroCanvas(ctx, { subtitle: '영상으로 만나는 K-SOHO GLOBAL.', cta: '영상 보기', ctaTarget: 'videos' });
      const section = ctx.id();
      const gridId = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: section } },
        ],
        zones: {
          ...hero.zones,
          [`${section}:content`]: [
            ...heading(ctx, title, '각 영상 블록의 우측 패널에서 YouTube 주소나 영상 ID 를 붙여 넣으세요. Shorts 도 지원합니다.'),
            { type: 'Container', props: { id: gridId, layoutMode: 'grid', name: '영상 그리드', style: { width: '100%', grid: { columns: 3, gap: 24 } } } },
          ],
          [`${gridId}:items`]: [1, 2, 3].map((n) => ({
            type: 'Video',
            props: {
              id: ctx.id(), name: `영상 ${n}`, provider: 'youtube', source: 'dQw4w9WgXcQ',
              controls: true, muted: true,
              style: { width: '100%', height: 220, border: { radius: 12 }, overflow: 'hidden' },
            },
          })),
        },
      };
    },
  },

  {
    id: 'blank',
    name: '빈 페이지',
    description: '섹션 하나만. 처음부터 직접 구성할 때.',
    build: () => {
      const ctx: Ctx = { id: makeIds('el'), title: '', locale: 'ko' };
      const section = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [{ type: 'Section', props: { id: section, style: { padding: { top: 80, right: 24, bottom: 80, left: 24 } } } }],
        zones: { [`${section}:content`]: [] },
      };
    },
  },
];

export function getTemplate(id: string): PageTemplate {
  return PAGE_TEMPLATES.find((t) => t.id === id) ?? PAGE_TEMPLATES[0];
}

/** IA 섹션에 어울리는 템플릿을 추천한다 (없으면 기본) */
export function suggestTemplate(navId?: string): PageTemplate {
  if (!navId) return PAGE_TEMPLATES[0];
  const root = navId.split('.')[0];
  return PAGE_TEMPLATES.find((t) => t.suggestedFor?.includes(root)) ?? PAGE_TEMPLATES[0];
}
