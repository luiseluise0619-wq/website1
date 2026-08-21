/* =============================================================================
 * K-SOHO GLOBAL — Core Schema Definitions
 * -----------------------------------------------------------------------------
 * 1) Navigation / IA  : 사이트 메뉴 & 서브카테고리 트리
 * 2) Canvas Elements  : 캔버스 위 모든 요소의 JSON Tree Schema
 * 3) Page Documents   : 동적 라우트 + SEO + Canvas Tree 를 묶은 페이지 문서
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1. NAVIGATION / INFORMATION ARCHITECTURE
 * ------------------------------------------------------------------------ */

/** 최상위 메뉴 키 — 라우트 세그먼트와 1:1 매핑된다. */
export type NavRootKey =
  | 'brand'
  | 'ceo-story'
  | 'global'
  | 'market'
  | 'video'
  | 'buy'
  | 'business';

export interface NavNode {
  /** 안정적인 고유 식별자 (페이지 문서가 이 값을 참조한다) */
  id: string;
  /** 화면에 노출되는 라벨 (기본 로케일) */
  label: string;
  /** 로케일별 라벨 오버라이드 — { ko: '브랜드', en: 'BRAND' } */
  i18n?: LocalizedText;
  /** 이 노드가 가리키는 URL Path. 그룹 헤더인 경우 null */
  path: string | null;
  /** 하위 카테고리 */
  children?: NavNode[];
  /** 네비게이션 바 노출 여부 (비노출 페이지도 라우팅은 살아있음) */
  visible?: boolean;
  /** 정렬 우선순위 (작을수록 앞) */
  order?: number;
  /** 메가메뉴 썸네일/설명 등 부가 표시 정보 */
  meta?: {
    description?: string;
    thumbnail?: string;
    badge?: string;
  };
}

export type LocaleCode = 'ko' | 'en' | 'th' | 'ja' | 'vi' | 'zh';

/**
 * 다국어 텍스트. 모든 사용자 노출 문자열은 단일 string 이 아니라 이 구조로 저장된다.
 * - 값이 없는 로케일은 fallback 체인(요청 로케일 → 사이트 기본 → ko → 첫 번째 존재값)으로 해석된다.
 * - `_meta` 는 번역 출처/검수 상태를 기록해 자동번역 결과를 사람이 덮어썼는지 구분한다.
 */
export type LocalizedText = Partial<Record<LocaleCode, string>> & {
  _meta?: Partial<Record<LocaleCode, TranslationMeta>>;
};

export interface TranslationMeta {
  /** 'manual' = 사람이 입력/검수, 'auto' = 기계번역 결과 */
  source: 'manual' | 'auto';
  provider?: 'deepl' | 'google' | 'tolgee' | 'none';
  /** 번역 시점의 원문 해시 — 원문이 바뀌면 stale 로 표시 */
  sourceHash?: string;
  translatedAt?: string;
  /** 사람이 검수 완료 */
  reviewed?: boolean;
}

export interface SiteConfig {
  title: string;
  logoUrl?: string;
  defaultLocale: LocaleCode;
  locales: LocaleCode[];
  navigation: NavNode[];
}

/* ---------------------------------------------------------------------------
 * 2. CANVAS ELEMENT SCHEMA
 * ------------------------------------------------------------------------ */

/**
 * 캔버스 요소 타입 = Puck 컴포넌트 키.
 * 이 값이 곧 `puck.config.tsx` 의 components 키이자, 분석 이벤트의 element_type 이다.
 */
export type ElementType =
  | 'Section'     // 페이지 최상위 밴드 (풀블리드)
  | 'FreeCanvas'  // 절대좌표 자유 배치 영역 (X/Y/Z 직접 제어)
  | 'Container'   // Flex/Grid 레이아웃 컨테이너
  | 'Text'        // 제목/본문 (인라인 리치텍스트)
  | 'Button'      // 링크 + 이벤트 바인딩
  | 'Image'
  | 'Video'       // YouTube / Shorts / mp4 embed
  | 'Shape'       // rect / circle / ellipse / line / custom svg
  | 'Form'        // BUSINESS 문의 폼 (Buyer Inquiry / Distribution / …)
  | 'Divider'
  | 'Spacer'
  | 'Embed';      // 임의 HTML embed (iframe 등)

/** 자식 배치 방식 — 레이아웃 엔진의 핵심 스위치 */
export type LayoutMode = 'absolute' | 'flex' | 'grid';

/** 요소 자신의 배치 방식 — 부모 layoutMode 와 조합되어 최종 CSS 결정 */
export type PositionMode = 'absolute' | 'relative' | 'sticky' | 'fixed';

/** 반응형 브레이크포인트 */
export type Breakpoint = 'base' | 'tablet' | 'mobile';

/** 숫자(px 취급) 또는 CSS 단위 문자열('50%', 'auto', '4rem') 모두 허용 */
export type CSSLength = number | string;

/* ---- Style ---------------------------------------------------------------- */

export interface BoxSpacing {
  top?: CSSLength;
  right?: CSSLength;
  bottom?: CSSLength;
  left?: CSSLength;
}

export interface BorderStyle {
  width?: CSSLength;
  style?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double';
  color?: string;
  /** 단일 값, 또는 [TL, TR, BR, BL] 모서리별 지정 */
  radius?: CSSLength | CSSLength[];
}

export interface ShadowStyle {
  x: CSSLength;
  y: CSSLength;
  blur: CSSLength;
  spread?: CSSLength;
  color: string;
  inset?: boolean;
}

export interface TypographyStyle {
  fontFamily?: string;
  fontSize?: CSSLength;
  fontWeight?: number | string;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: CSSLength;
  /** 자간 */
  letterSpacing?: CSSLength;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  whiteSpace?: 'normal' | 'nowrap' | 'pre-wrap';
}

export interface BackgroundStyle {
  color?: string;
  /** linear-gradient(...) 등 CSS gradient 문자열 */
  gradient?: string;
  imageUrl?: string;
  size?: 'cover' | 'contain' | 'auto';
  position?: string;
  repeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  /** 배경 위 오버레이 (딤 처리) */
  overlay?: string;
}

export interface FlexOptions {
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  gap?: CSSLength;
}

export interface GridOptions {
  /** 컬럼 개수(숫자) 또는 raw template('repeat(3, 1fr)') */
  columns?: number | string;
  rows?: number | string;
  gap?: CSSLength;
  columnGap?: CSSLength;
  rowGap?: CSSLength;
  autoFlow?: 'row' | 'column' | 'dense';
  justifyItems?: 'start' | 'center' | 'end' | 'stretch';
  alignItems?: 'start' | 'center' | 'end' | 'stretch';
}

/** 부모가 grid 일 때 자식이 차지하는 셀 영역 */
export interface GridPlacement {
  colStart?: number;
  colSpan?: number;
  rowStart?: number;
  rowSpan?: number;
}

/** 부모가 flex 일 때 자식의 신축 규칙 */
export interface FlexItemOptions {
  grow?: number;
  shrink?: number;
  basis?: CSSLength;
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';
  order?: number;
}

export interface TransformStyle {
  rotate?: number;   // deg
  scale?: number;
  skewX?: number;
  skewY?: number;
  flipX?: boolean;
  flipY?: boolean;
}

/** 요소 하나의 전체 스타일 — 모든 필드 optional (미지정 = 상속/기본값) */
export interface ElementStyle {
  /* 위치 & 크기 (부모가 absolute 모드일 때 x/y 사용) */
  x?: CSSLength;
  y?: CSSLength;
  zIndex?: number;
  width?: CSSLength;
  height?: CSSLength;
  minWidth?: CSSLength;
  minHeight?: CSSLength;
  maxWidth?: CSSLength;
  maxHeight?: CSSLength;
  position?: PositionMode;

  /* 여백 */
  padding?: BoxSpacing;
  margin?: BoxSpacing;

  /* 표면 */
  background?: BackgroundStyle;
  border?: BorderStyle;
  shadows?: ShadowStyle[];
  opacity?: number;
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll';
  backdropBlur?: CSSLength;

  /* 텍스트 */
  color?: string;
  typography?: TypographyStyle;

  /* 레이아웃 */
  flex?: FlexOptions;
  grid?: GridOptions;
  gridPlacement?: GridPlacement;
  flexItem?: FlexItemOptions;

  /* 변형 & 전환 */
  transform?: TransformStyle;
  transition?: string;
  cursor?: string;

  /* 탈출구: 인스펙터가 다루지 않는 CSS 를 직접 주입 */
  raw?: Record<string, string | number>;
}

/** 상태별 스타일 오버레이 (hover/active 등) */
export interface StyleStates {
  hover?: ElementStyle;
  active?: ElementStyle;
  focus?: ElementStyle;
}

/** 브레이크포인트별 스타일 오버라이드 */
export type ResponsiveStyle = Partial<Record<Breakpoint, ElementStyle>>;

/* ---- Props (요소 타입별 콘텐츠) --------------------------------------------- */

export type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'blockquote';

export interface TextProps {
  /** 인라인 서식(<strong>, <span style="color:..">)을 허용하는 sanitized HTML — 로케일별로 저장 */
  html: LocalizedText;
  tag?: TextTag;
}

export type LinkTarget = '_self' | '_blank';

export interface ActionBinding {
  type: 'navigate' | 'scrollTo' | 'openModal' | 'submitForm' | 'externalLink' | 'none';
  /** navigate: 내부 path / externalLink: URL / scrollTo: elementId */
  value?: string;
  target?: LinkTarget;
}

export interface ButtonProps {
  label: LocalizedText;
  action: ActionBinding;
  iconLeft?: string;
  iconRight?: string;
}

export interface ImageProps {
  src: string;
  alt: LocalizedText;
  /** 국가별 크리에이티브 교체 (예: 태국향 배너) */
  srcByLocale?: Partial<Record<LocaleCode, string>>;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  objectPosition?: string;
  link?: ActionBinding;
}

export type VideoProvider = 'youtube' | 'youtube-shorts' | 'vimeo' | 'file';

export interface VideoProps {
  provider: VideoProvider;
  /** youtube: videoId, file: URL */
  source: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
  /** 자막/더빙 버전이 다른 경우 로케일별 소스 교체 */
  sourceByLocale?: Partial<Record<LocaleCode, string>>;
}

export type ShapeKind = 'rect' | 'circle' | 'ellipse' | 'line' | 'triangle' | 'polygon' | 'svg';

export interface ShapeProps {
  kind: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** kind === 'svg' 일 때의 path d 속성 또는 전체 SVG 마크업 */
  svgPath?: string;
  viewBox?: string;
  /** polygon 꼭짓점 [[x,y], ...] (0~100 비율) */
  points?: number[][];
}

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export interface ContainerProps {
  /** 컨테이너가 자식을 배치하는 방식 */
  layoutMode: LayoutMode;
  /** section 전용: 콘텐츠 최대 폭 (중앙 정렬 컨테이너) */
  contentMaxWidth?: CSSLength;
  /** absolute 모드에서 캔버스 높이 고정 여부 */
  fixedHeight?: boolean;
}

export interface EmbedProps {
  html: string;
}

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  thickness?: CSSLength;
  color?: string;
}

/**
 * 자유 배치 캔버스에서 자식이 갖는 좌표.
 * Puck 은 기본적으로 흐름(flow) 배치이므로, FreeCanvas 안의 요소만 이 값을 쓴다.
 */
export interface FreePlacement {
  x: number;
  y: number;
  z?: number;
  width?: CSSLength;
  height?: CSSLength;
  /** 회전(deg) */
  rotate?: number;
}

/**
 * 모든 Puck 컴포넌트가 공통으로 받는 props.
 * 이 세 가지가 있어야 (1) 스타일 자유 편집 (2) 반응형 (3) 분석 추적이 성립한다.
 */
export interface BaseBlockProps {
  /** 인스펙터에서 편집하는 전체 스타일 */
  style?: ElementStyle;
  /** hover/active 상태 오버라이드 */
  states?: StyleStates;
  /** 브레이크포인트별 오버라이드 */
  responsive?: ResponsiveStyle;
  /** 자유 배치 좌표 (FreeCanvas 자식일 때만 유효) */
  placement?: FreePlacement;
  /**
   * 분석용 안정 식별자 → DOM 에 `data-element-id` 로 부여된다.
   * Puck 이 부여하는 인스턴스 id 를 기본값으로 쓰되, 관리자가 의미 있는 이름
   * ('hero-cta-thailand')으로 바꾸면 요소를 옮겨도 히트맵 히스토리가 이어진다.
   */
  trackingId?: string;
  /** 이 요소를 전환(Conversion) 지점으로 표시 */
  conversionGoal?: string;
  /** 분석 제외 (장식용 요소) */
  trackingDisabled?: boolean;
  /** 레이어 패널 표시 이름 */
  name?: string;
  hidden?: boolean;
}

/* ---------------------------------------------------------------------------
 * 3. PAGE DOCUMENT
 * ------------------------------------------------------------------------ */

export interface SeoMeta {
  title: LocalizedText;
  description?: LocalizedText;
  keywords?: Partial<Record<LocaleCode, string[]>>;
  ogTitle?: LocalizedText;
  ogDescription?: LocalizedText;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

export type PageStatus = 'draft' | 'published' | 'archived';

export interface PageDocument {
  id: string;
  /** '/global/thailand' 형태의 고유 라우트 (선행 슬래시 포함, 후행 슬래시 없음) */
  path: string;
  title: string;
  /** 이 페이지가 속한 NavNode.id — 네비게이션 활성 표시에 사용 */
  navId?: string;
  status: PageStatus;
  seo: SeoMeta;
  /**
   * Puck 이 저장하는 캔버스 JSON.
   * `{ root: { props }, content: [{ type, props }], zones: {...} }` 구조이며,
   * 각 블록의 props 안에 LocalizedText / trackingId 가 함께 들어간다.
   * 여기서는 Puck 타입에 대한 하드 의존을 피하기 위해 구조적으로 정의한다.
   */
  content: PuckPageData;
  /** 편집 캔버스의 기준 폭(px) — 프리뷰 스케일 계산 기준 */
  canvasWidth: number;
  /** 페이지 단위 전역 스타일 */
  pageStyle?: {
    background?: BackgroundStyle;
    fontFamily?: string;
    color?: string;
  };
  /** 이 페이지의 원문 로케일 — 자동번역의 소스가 된다 */
  sourceLocale: LocaleCode;
  /** 이 페이지가 노출될 로케일. 미지정이면 사이트 전체 로케일을 따른다. */
  enabledLocales?: LocaleCode[];
  createdAt: string;
  updatedAt: string;
  /** 낙관적 잠금 및 되돌리기 지원용 리비전 번호 */
  revision: number;
}

/* ---- Puck Data 구조 (라이브러리 타입의 구조적 미러) --------------------------
 * @puckeditor/core 의 `Data` 와 호환된다. 서버(API/DB)에서 Puck 을 import 하지
 * 않고도 페이지 문서를 다룰 수 있도록 최소 형태만 재선언한다. */

export interface PuckBlock {
  type: ElementType | string;
  props: Record<string, unknown> & { id: string };
}

export interface PuckPageData {
  root: { props?: Record<string, unknown> };
  content: PuckBlock[];
  zones?: Record<string, PuckBlock[]>;
}

/** 사이트 전체 저장 단위 */
export interface SiteDocument {
  config: SiteConfig;
  pages: PageDocument[];
}
