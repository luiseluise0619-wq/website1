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
  /** 이 템플릿의 문구가 실제로 쓰여 있는 언어. 첫 번째가 번역 원문이 된다. */
  copyLocales?: LocaleCode[];
  build: (input: { title: string; locale: LocaleCode }) => PuckPageData;
}

/** 템플릿 문구는 한국어로 쓰고 영어를 함께 담는다 */
const COPY_LOCALES: LocaleCode[] = ['ko', 'en'];

/**
 * 이 템플릿으로 만든 페이지의 원문 언어.
 * 태국어로 편집을 시작해도 템플릿 문구는 한국어이므로, 원문을 'th' 로 잡으면
 * 번역 원문이 전부 빈 문자열이 되어 커버리지가 0 이 되고 자동 번역이 할 일을
 * 찾지 못한다. 그래서 템플릿이 쓰지 않는 언어면 문구의 언어를 원문으로 삼는다.
 */
export function templateSourceLocale(template: PageTemplate, editing: LocaleCode): LocaleCode {
  const copy = template.copyLocales;
  if (!copy?.length || copy.includes(editing)) return editing;
  return copy[0];
}

/** 사용자가 입력한 제목 — 원문 슬롯과 편집 언어 슬롯 양쪽에 넣어야 번역 대상이 된다 */
export function titleText(title: string, locale: LocaleCode, sourceLocale: LocaleCode): LocalizedText {
  return sourceLocale === locale ? { [locale]: title } : { [sourceLocale]: title, [locale]: title };
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
  /** 편집자가 지금 보고 있는 언어 — 사용자가 입력한 제목이 이 언어로 들어온다 */
  locale: LocaleCode;
  /** 템플릿 문구의 언어 (= 번역 원문) */
  sourceLocale: LocaleCode;
  /** 제목을 원문·편집 언어 양쪽에 담은 값 */
  title$: LocalizedText;
}

function makeCtx(title: string, locale: LocaleCode, copyLocales?: LocaleCode[]): Ctx {
  const copy = copyLocales ?? COPY_LOCALES;
  const sourceLocale = copy.includes(locale) ? locale : copy[0];
  return { id: makeIds('el'), title, locale, sourceLocale, title$: titleText(title, locale, sourceLocale) };
}

/** 자유 배치 히어로 — 큰 제목·부제·CTA·장식 도형 */
function heroCanvas(
  ctx: Ctx,
  opts: { subtitle: LocalizedText; cta: LocalizedText; ctaTarget: string; dark?: boolean },
) {
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
            html: ctx.title$, tag: 'h1',
            placement: { x: 64, y: 170, z: 2 },
            style: { width: 760, color: fg, typography: { fontSize: 60, fontWeight: 800, lineHeight: 1.15, letterSpacing: -1.5 } },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: 'Hero 부제', trackingId: 'hero-sub',
            html: opts.subtitle, tag: 'p',
            placement: { x: 64, y: 296, z: 2 },
            style: { width: 560, color: sub, typography: { fontSize: 18, lineHeight: 1.7 } },
          },
        },
        {
          type: 'Button',
          props: {
            id: ctx.id(), name: 'Hero CTA', trackingId: 'hero-cta', conversionGoal: 'hero_cta',
            label: opts.cta, action: { type: 'scrollTo', value: opts.ctaTarget, target: '_self' },
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
function heading(ctx: Ctx, text: LocalizedText, body: LocalizedText): PuckBlock[] {
  return [
    {
      type: 'Text',
      props: {
        id: ctx.id(), name: '섹션 제목', html: text, tag: 'h2',
        style: { color: '#111827', typography: { fontSize: 34, fontWeight: 700, lineHeight: 1.3 } },
      },
    },
    {
      type: 'Text',
      props: {
        id: ctx.id(), name: '섹션 설명', html: body, tag: 'p',
        style: { maxWidth: 720, color: '#4b5563', typography: { fontSize: 17, lineHeight: 1.8 } },
      },
    },
  ];
}

function card(
  ctx: Ctx,
  title: LocalizedText,
  body: LocalizedText,
  image: string,
): { block: PuckBlock; zone: [string, PuckBlock[]] } {
  const id = ctx.id();
  return {
    /* 카드는 이미지 → 제목 → 본문이 세로로 쌓여야 한다.
       방향을 지정하지 않으면 컨테이너 기본값(row)이라 셋이 옆으로 늘어선다. */
    block: {
      type: 'Container',
      props: {
        id,
        name: '카드',
        layoutMode: 'flex',
        style: { width: '100%', flex: { direction: 'column', gap: 10, align: 'stretch' } },
      },
    },
    zone: [
      `${id}:items`,
      [
        {
          type: 'Image',
          props: {
            id: ctx.id(), name: '카드 이미지', src: image, alt: title, objectFit: 'cover',
            style: { width: '100%', height: 200, border: { radius: 12 }, overflow: 'hidden' },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: '카드 제목', html: title, tag: 'h3',
            style: { color: '#111827', typography: { fontSize: 20, fontWeight: 700, lineHeight: 1.4 } },
          },
        },
        {
          type: 'Text',
          props: {
            id: ctx.id(), name: '카드 본문', html: body, tag: 'p',
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
  /* -------------------------------------------------------------------------
   * 종이 — 섹션이 없는 한 장짜리 페이지
   * -------------------------------------------------------------------------
   * 나머지 템플릿은 '섹션을 쌓는' 구조다. 위에서 아래로 칸을 하나씩 만들고 그
   * 안을 채운다. 칸이 모자라면 [＋ 섹션 추가] 를 눌러야 하고, 칸의 경계가
   * 어디인지를 늘 신경 써야 한다.
   *
   * 이 템플릿은 칸을 없앤다. 페이지 전체가 자유 배치 종이 한 장이고, 무엇이든
   * 원하는 자리에 놓는다. 아래로 더 필요하면 종이가 그만큼 길어진다 —
   * 끌어 내린 요소를 따라 자동으로 늘어나고, 아래쪽 손잡이로 직접 늘려도 된다.
   * 내보내기는 그대로 HTML 한 장이 된다.
   * ---------------------------------------------------------------------- */
  {
    id: 'blank-paper',
    name: '빈 종이 (자유 배치)',
    description: '섹션 없이 종이 한 장. 아무 데나 놓고, 아래로 계속 이어 붙인다.',
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const paperId = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        /* 섹션으로 감싸지 않는다 — 종이가 곧 페이지다 */
        content: [
          {
            type: 'FreeCanvas',
            props: {
              id: paperId,
              name: '종이',
              height: 900,
              snap: 8,
              style: { background: '#ffffff' },
            },
          },
        ],
        zones: {
          [`${paperId}:layers`]: [
            {
              type: 'Text',
              props: {
                id: ctx.id(),
                name: '제목',
                html: titleText(title, ctx.locale, ctx.sourceLocale),
                tag: 'h1',
                placement: { x: 120, y: 120, width: 720 },
                style: { color: '#111827', typography: { fontSize: 56, fontWeight: 800, lineHeight: 1.2 } },
              },
            },
            {
              type: 'Text',
              props: {
                id: ctx.id(),
                name: '본문',
                html: loc(
                  '여기에 내용을 씁니다. 왼쪽 블록 목록에서 끌어다 아무 자리에나 놓으세요.',
                  'Write here. Drag blocks from the list on the left and drop them anywhere.',
                ),
                tag: 'p',
                placement: { x: 120, y: 220, width: 560 },
                style: { color: '#6b7280', typography: { fontSize: 18, lineHeight: 1.8 } },
              },
            },
          ],
        },
      };
    },
  },

  {
    id: 'hero-intro',
    name: '히어로 + 소개',
    description: '자유 배치 히어로와 본문 한 단락. 가장 단순한 시작점.',
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc(`${title} 페이지의 히어로 문구를 입력하세요.`, `Write the hero copy for ${title}.`),
        cta: loc('자세히 보기', 'Learn more'),
        ctaTarget: 'body',
      });
      const bodyId = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [
          { ...hero.section, props: { ...hero.section.props, style: hero.sectionStyle } },
          { type: 'Section', props: { id: bodyId } },
        ],
        zones: {
          ...hero.zones,
          [`${bodyId}:content`]: heading(
            ctx,
            loc(`${title} 소개`, `About ${title}`),
            loc(
              'K-SOHO GLOBAL은 대한민국 중소기업 브랜드의 해외 진출을 지원합니다. 이 문단을 클릭해 내용을 수정하고, 우측 패널에서 색상·폰트·여백을 자유롭게 조정하세요.',
              'K-SOHO GLOBAL helps Korean small businesses reach overseas markets. Click this paragraph to edit it, and adjust colours, fonts and spacing in the panel on the right.',
            ),
          ),
        },
      };
    },
  },

  {
    id: 'brand-grid',
    name: '브랜드 카드 3열',
    description: '히어로 + 이미지 카드 3개 그리드. BRAND·MARKET 카테고리 소개용.',
    suggestedFor: ['brand', 'market'],
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc('대한민국 브랜드를 세계 시장으로.', 'Korean brands, taken to the world.'),
        cta: loc('브랜드 보기', 'View brands'),
        ctaTarget: 'grid',
      });
      const gridSection = ctx.id();
      const gridId = ctx.id();
      const cards = [
        card(ctx, loc('K-BEAUTY'), loc('화장품·스킨케어 브랜드', 'Cosmetics and skincare'), PHOTO.beauty),
        card(ctx, loc('K-FOOD'), loc('식품·가공식품 브랜드', 'Food and processed goods'), PHOTO.food),
        card(ctx, loc('K-LIVING'), loc('생활용품·리빙 브랜드', 'Household and living goods'), PHOTO.living),
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
            ...heading(
              ctx,
              loc(`${title} 브랜드`, `${title} brands`),
              loc(
                '카드를 클릭해 이미지와 문구를 바꾸세요. 카드를 더 넣으려면 컨테이너 안으로 블록을 끌어다 놓습니다.',
                'Click a card to change its image and text. Drag a block into the container to add more.',
              ),
            ),
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
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc('전 세계에서 만나는 대한민국 브랜드.', 'Korean brands, available worldwide.'),
        cta: loc('제품 보기', 'View products'),
        ctaTarget: 'products',
      });
      const section = ctx.id();
      const carouselId = ctx.id();
      const slides = [
        card(ctx, loc('제품 1', 'Product 1'), loc('제품 설명을 입력하세요.', 'Describe this product.'), PHOTO.beauty),
        card(ctx, loc('제품 2', 'Product 2'), loc('제품 설명을 입력하세요.', 'Describe this product.'), PHOTO.food),
        card(ctx, loc('제품 3', 'Product 3'), loc('제품 설명을 입력하세요.', 'Describe this product.'), PHOTO.living),
        card(ctx, loc('제품 4', 'Product 4'), loc('제품 설명을 입력하세요.', 'Describe this product.'), PHOTO.factory),
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
            ...heading(
              ctx,
              loc('제품 보기', 'Products'),
              loc(
                '슬라이드를 좌우로 넘겨 제품을 소개합니다. 우측 패널에서 한 화면에 보일 개수와 자동 재생을 조절하세요.',
                'Swipe through the slides to present products. Set how many show at once, and autoplay, in the panel on the right.',
              ),
            ),
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
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc('브랜드가 만들어지기까지의 이야기.', 'How the brand came to be.'),
        cta: loc('이야기 읽기', 'Read the story'),
        ctaTarget: 'story',
        dark: true,
      });
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
            ...heading(
              ctx,
              ctx.title$,
              loc(
                '창업의 계기, 제품에 담은 철학, 해외 진출에서 겪은 어려움을 이야기로 풀어 주세요.',
                'Tell the story: why the business started, the thinking behind the product, and what going overseas took.',
              ),
            ),
            { type: 'Container', props: { id: rowId, layoutMode: 'flex', name: '이미지 + 글', style: { width: '100%', flex: { direction: 'row', gap: 32, align: 'flex-start', wrap: 'wrap' } } } },
          ],
          [`${rowId}:items`]: [
            {
              type: 'Image',
              props: {
                id: ctx.id(), name: '스토리 이미지', src: PHOTO.factory, alt: ctx.title$, objectFit: 'cover', priority: true,
                style: { width: 460, height: 340, border: { radius: 16 }, overflow: 'hidden', flexItem: { grow: 0, shrink: 0, basis: 460 } },
              },
            },
            {
              type: 'Text',
              props: {
                id: ctx.id(), name: '스토리 본문',
                html: loc(
                  '여기에 이야기를 적어 주세요. 문단을 나누고, 중요한 문장은 굵게 강조하면 읽기 좋습니다.',
                  'Write the story here. Break it into paragraphs and bold the sentences that matter.',
                ),
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
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc('문의를 남겨 주시면 확인 후 연락드리겠습니다.', 'Leave an inquiry and we will get back to you.'),
        cta: loc('문의하기', 'Send inquiry'),
        ctaTarget: 'form',
      });
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
            ...heading(
              ctx,
              ctx.title$,
              loc(
                '아래 항목을 채워 보내 주세요. 접수 내역은 관리자 화면에서 확인할 수 있습니다.',
                'Fill in the fields below. Submissions appear in the admin screen.',
              ),
            ),
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
    copyLocales: COPY_LOCALES,
    build: ({ title, locale }) => {
      const ctx = makeCtx(title, locale);
      const hero = heroCanvas(ctx, {
        subtitle: loc('영상으로 만나는 K-SOHO GLOBAL.', 'K-SOHO GLOBAL, on video.'),
        cta: loc('영상 보기', 'Watch'),
        ctaTarget: 'videos',
      });
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
            ...heading(
              ctx,
              ctx.title$,
              loc(
                '각 영상 블록의 우측 패널에서 YouTube 주소나 영상 ID 를 붙여 넣으세요. Shorts 도 지원합니다.',
                'Paste a YouTube URL or video ID into each video block. Shorts are supported.',
              ),
            ),
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
    build: ({ locale }) => {
      const ctx = makeCtx('', locale, [locale]);
      const section = ctx.id();
      return {
        root: { props: ROOT_PROPS },
        content: [{ type: 'Section', props: { id: section, style: { padding: { top: 80, right: 24, bottom: 80, left: 24 } } } }],
        zones: { [`${section}:content`]: [] },
      };
    },
  },
];

/* 기본값은 '목록의 첫 번째'가 아니라 이름으로 정한다.
   목록 맨 앞에 무엇을 놓느냐(= 화면에서 먼저 보이는 카드)와, 못 찾았을 때
   무엇으로 떨어지느냐는 서로 다른 결정이다. 예전에는 둘이 같아서, 새 템플릿을
   맨 앞에 놓자마자 모든 페이지의 기본값이 조용히 그것으로 바뀌었다. */
const FALLBACK_TEMPLATE_ID = 'hero-intro';
/** 아무 단서 없이 '새 페이지'를 만들 때 — 칸 없는 종이 한 장에서 시작한다 */
const BLANK_TEMPLATE_ID = 'blank-paper';

const byId = (id: string) => PAGE_TEMPLATES.find((t) => t.id === id);

export function getTemplate(id: string): PageTemplate {
  return byId(id) ?? byId(FALLBACK_TEMPLATE_ID) ?? PAGE_TEMPLATES[0];
}

/** IA 섹션에 어울리는 템플릿을 추천한다 (없으면 기본) */
export function suggestTemplate(navId?: string): PageTemplate {
  const blank = byId(BLANK_TEMPLATE_ID) ?? PAGE_TEMPLATES[0];
  if (!navId) return blank;
  const root = navId.split('.')[0];
  return PAGE_TEMPLATES.find((t) => t.suggestedFor?.includes(root)) ?? blank;
}
