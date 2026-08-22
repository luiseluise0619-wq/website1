import type { CSSProperties } from 'react';
import type {
  BaseBlockProps,
  BoxSpacing,
  BorderStyle,
  Breakpoint,
  CSSLength,
  ElementStyle,
  FreePlacement,
  LayoutMode,
  ShadowStyle,
  StyleStates,
} from '@/types/schema';

/* =============================================================================
 * Style Engine — ElementStyle(JSON) → React CSSProperties
 * 에디터 캔버스와 퍼블릭 렌더러가 동일한 함수를 쓰기 때문에
 * "에디터에서 본 것 = 실제 사이트" 가 구조적으로 보장된다.
 * ========================================================================== */

/** 숫자는 px, 문자열은 그대로. undefined 는 통과. */
export function len(v: CSSLength | undefined): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function spacing(box: BoxSpacing | undefined): string | undefined {
  if (!box) return undefined;
  const t = len(box.top) ?? '0';
  const r = len(box.right) ?? '0';
  const b = len(box.bottom) ?? '0';
  const l = len(box.left) ?? '0';
  if (t === '0' && r === '0' && b === '0' && l === '0') return undefined;
  return `${t} ${r} ${b} ${l}`;
}

function radius(r: BorderStyle['radius']): string | undefined {
  if (r === undefined) return undefined;
  if (Array.isArray(r)) return r.map((v) => len(v) ?? '0').join(' ');
  return len(r);
}

function shadow(list: ShadowStyle[] | undefined): string | undefined {
  if (!list?.length) return undefined;
  return list
    .map((s) =>
      [s.inset ? 'inset' : '', len(s.x) ?? '0', len(s.y) ?? '0', len(s.blur) ?? '0', len(s.spread) ?? '0', s.color]
        .filter(Boolean)
        .join(' '),
    )
    .join(', ');
}

function transform(t: ElementStyle['transform']): string | undefined {
  if (!t) return undefined;
  const parts: string[] = [];
  if (t.rotate) parts.push(`rotate(${t.rotate}deg)`);
  if (t.scale !== undefined && t.scale !== 1) parts.push(`scale(${t.scale})`);
  if (t.skewX) parts.push(`skewX(${t.skewX}deg)`);
  if (t.skewY) parts.push(`skewY(${t.skewY}deg)`);
  if (t.flipX) parts.push('scaleX(-1)');
  if (t.flipY) parts.push('scaleY(-1)');
  return parts.length ? parts.join(' ') : undefined;
}

function gridTemplate(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `repeat(${v}, minmax(0, 1fr))` : v;
}

/** 깊은 병합 — 반응형/상태 오버라이드를 base 스타일 위에 얹는다. */
export function mergeStyle(base: ElementStyle = {}, override: ElementStyle = {}): ElementStyle {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    const prev = (base as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object' && !Array.isArray(prev)) {
      out[k] = { ...(prev as object), ...(v as object) };
    } else {
      out[k] = v;
    }
  }
  return out as ElementStyle;
}

export interface ResolveOptions {
  /** 부모 컨테이너의 배치 모드 — absolute 면 x/y 를 좌표로 사용 */
  parentLayout?: LayoutMode;
  /** 현재 렌더 중인 브레이크포인트 */
  breakpoint?: Breakpoint;
  /** 편집 중 여부 — true 면 pointer-events 등 편집 보조 스타일 적용 */
  editing?: boolean;
}

/**
 * ElementStyle → CSSProperties.
 * 레이아웃 규칙:
 *  - 부모가 absolute  → position:absolute + left/top/zIndex (자유 배치)
 *  - 부모가 flex/grid → 문서 흐름에 참여, x/y 무시, flexItem/gridPlacement 적용
 */
export function toCSS(style: ElementStyle, opts: ResolveOptions = {}): CSSProperties {
  const { parentLayout = 'absolute' } = opts;
  const css: CSSProperties = {};

  /* -- 위치 -- */
  if (parentLayout === 'absolute') {
    css.position = style.position ?? 'absolute';
    css.left = len(style.x) ?? 0;
    css.top = len(style.y) ?? 0;
    /* 휴대폰에서는 자유 캔버스가 세로 스택으로 풀린다(globals.css). 그때 흐름
       순서가 DOM 순서가 아니라 화면에서 보이던 순서를 따르도록 order 를 남긴다.
       (위 → 아래, 같은 높이면 왼쪽 → 오른쪽) */
    const y = typeof style.y === 'number' ? style.y : 0;
    const x = typeof style.x === 'number' ? style.x : 0;
    css.order = Math.round(y * 10 + x / 100);
  } else {
    css.position = style.position && style.position !== 'absolute' ? style.position : 'relative';
    if (style.position === 'absolute') {
      css.position = 'absolute';
      css.left = len(style.x);
      css.top = len(style.y);
    }
  }
  if (style.zIndex !== undefined) css.zIndex = style.zIndex;

  /* -- 크기 -- */
  css.width = len(style.width);
  css.height = len(style.height);
  css.minWidth = len(style.minWidth);
  css.minHeight = len(style.minHeight);
  css.maxWidth = len(style.maxWidth);
  css.maxHeight = len(style.maxHeight);

  /* -- 여백 -- */
  css.padding = spacing(style.padding);
  css.margin = spacing(style.margin);

  /* -- 배경 -- */
  const bg = style.background;
  if (bg) {
    if (bg.color) css.backgroundColor = bg.color;
    const layers: string[] = [];
    if (bg.overlay) layers.push(`linear-gradient(${bg.overlay}, ${bg.overlay})`);
    if (bg.gradient) layers.push(bg.gradient);
    if (bg.imageUrl) layers.push(`url("${bg.imageUrl}")`);
    if (layers.length) css.backgroundImage = layers.join(', ');
    if (bg.size) css.backgroundSize = bg.size;
    if (bg.position) css.backgroundPosition = bg.position;
    if (bg.repeat) css.backgroundRepeat = bg.repeat;
  }

  /* -- 테두리 -- */
  const bd = style.border;
  if (bd) {
    if (bd.style && bd.style !== 'none') {
      css.borderStyle = bd.style;
      css.borderWidth = len(bd.width) ?? '1px';
      css.borderColor = bd.color ?? 'currentColor';
    }
    css.borderRadius = radius(bd.radius);
  }

  /* -- 그림자 / 투명도 / 오버플로 -- */
  css.boxShadow = shadow(style.shadows);
  if (style.opacity !== undefined) css.opacity = style.opacity;
  if (style.overflow) css.overflow = style.overflow;
  if (style.backdropBlur) css.backdropFilter = `blur(${len(style.backdropBlur)})`;

  /* -- 타이포그래피 -- */
  if (style.color) css.color = style.color;
  const tp = style.typography;
  if (tp) {
    if (tp.fontFamily) css.fontFamily = tp.fontFamily;
    css.fontSize = len(tp.fontSize);
    if (tp.fontWeight !== undefined) css.fontWeight = tp.fontWeight as CSSProperties['fontWeight'];
    if (tp.fontStyle) css.fontStyle = tp.fontStyle;
    if (tp.lineHeight !== undefined) {
      css.lineHeight = typeof tp.lineHeight === 'number' && tp.lineHeight <= 4 ? tp.lineHeight : len(tp.lineHeight);
    }
    css.letterSpacing = len(tp.letterSpacing);
    if (tp.textAlign) css.textAlign = tp.textAlign;
    if (tp.textDecoration) css.textDecoration = tp.textDecoration;
    if (tp.textTransform) css.textTransform = tp.textTransform;
    if (tp.whiteSpace) css.whiteSpace = tp.whiteSpace;
  }

  /* -- 자식 배치 (이 요소가 컨테이너일 때) -- */
  if (style.flex) {
    css.display = 'flex';
    if (style.flex.direction) css.flexDirection = style.flex.direction;
    if (style.flex.justify) css.justifyContent = style.flex.justify;
    if (style.flex.align) css.alignItems = style.flex.align;
    if (style.flex.wrap) css.flexWrap = style.flex.wrap;
    css.gap = len(style.flex.gap);
  }
  if (style.grid) {
    css.display = 'grid';
    css.gridTemplateColumns = gridTemplate(style.grid.columns);
    css.gridTemplateRows = gridTemplate(style.grid.rows);
    css.gap = len(style.grid.gap);
    css.columnGap = len(style.grid.columnGap);
    css.rowGap = len(style.grid.rowGap);
    if (style.grid.autoFlow) css.gridAutoFlow = style.grid.autoFlow;
    if (style.grid.justifyItems) css.justifyItems = style.grid.justifyItems;
    if (style.grid.alignItems) css.alignItems = style.grid.alignItems;
  }

  /* -- 이 요소가 flex/grid 자식일 때의 규칙 -- */
  if (parentLayout === 'flex' && style.flexItem) {
    const fi = style.flexItem;
    if (fi.grow !== undefined) css.flexGrow = fi.grow;
    if (fi.shrink !== undefined) css.flexShrink = fi.shrink;
    if (fi.basis !== undefined) css.flexBasis = len(fi.basis);
    if (fi.alignSelf) css.alignSelf = fi.alignSelf;
    if (fi.order !== undefined) css.order = fi.order;
  }
  if (parentLayout === 'grid' && style.gridPlacement) {
    const gp = style.gridPlacement;
    if (gp.colStart) css.gridColumnStart = gp.colStart;
    if (gp.colSpan) css.gridColumnEnd = `span ${gp.colSpan}`;
    if (gp.rowStart) css.gridRowStart = gp.rowStart;
    if (gp.rowSpan) css.gridRowEnd = `span ${gp.rowSpan}`;
  }

  /* -- 변형 & 기타 -- */
  css.transform = transform(style.transform);
  if (style.transition) css.transition = style.transition;
  if (style.cursor) css.cursor = style.cursor;

  /* -- raw 탈출구 -- */
  if (style.raw) Object.assign(css, style.raw);

  /* undefined 키 제거 — React 경고 및 불필요한 인라인 스타일 방지 */
  for (const k of Object.keys(css) as Array<keyof CSSProperties>) {
    if (css[k] === undefined) delete css[k];
  }
  return css;
}

/* ---------------------------------------------------------------------------
 * 블록 props → 최종 스타일
 * Puck 컴포넌트는 { style, responsive, states, placement } 를 props 로 받는다.
 * 아래 두 함수가 그 props 를 실제 CSS 로 환원하는 유일한 경로다.
 * ------------------------------------------------------------------------ */

/** 브레이크포인트 상속: mobile ← tablet ← base */
export function styleForBreakpoint(props: BaseBlockProps, bp: Breakpoint = 'base'): ElementStyle {
  let style = props.style ?? {};
  if (bp === 'tablet' || bp === 'mobile') style = mergeStyle(style, props.responsive?.tablet ?? {});
  if (bp === 'mobile') style = mergeStyle(style, props.responsive?.mobile ?? {});
  return style;
}

/** FreePlacement(자유 배치 좌표)를 스타일에 반영 */
export function applyPlacement(style: ElementStyle, placement?: FreePlacement): ElementStyle {
  if (!placement) return style;
  return {
    ...style,
    x: placement.x,
    y: placement.y,
    zIndex: placement.z ?? style.zIndex,
    width: placement.width ?? style.width,
    height: placement.height ?? style.height,
    transform: placement.rotate ? { ...style.transform, rotate: placement.rotate } : style.transform,
  };
}

/** 블록 props 하나를 통째로 CSS 로 — 컴포넌트에서 이 함수만 부르면 된다 */
export function blockCSS(
  props: BaseBlockProps,
  opts: ResolveOptions & { free?: boolean } = {},
): CSSProperties {
  const bp = opts.breakpoint ?? 'base';
  let style = styleForBreakpoint(props, bp);
  if (opts.free) style = applyPlacement(style, props.placement);
  return toCSS(style, { ...opts, parentLayout: opts.free ? 'absolute' : opts.parentLayout ?? 'flex' });
}

/**
 * hover/active 상태를 <style> 규칙으로 직렬화.
 * 인라인 스타일로는 의사클래스를 표현할 수 없으므로, 요소마다
 * `[data-element-id="..."]:hover { ... }` 규칙을 하나 만들어 주입한다.
 */
export function statesToCSSText(
  states: StyleStates | undefined,
  base: ElementStyle,
  elementId: string,
): string {
  if (!states) return '';
  const rules: string[] = [];
  for (const [state, override] of Object.entries(states)) {
    if (!override) continue;
    const merged = mergeStyle(base, override as ElementStyle);
    const css = toCSS(merged, { parentLayout: 'flex' });
    // 위치 계열은 상태 전환에서 제외 — hover 시 요소가 튀는 것을 막는다
    delete css.position;
    delete css.left;
    delete css.top;
    const body = Object.entries(css)
      .map(([k, v]) => `${kebab(k)}:${cssValue(k, v)}`)
      .join(';');
    if (body) rules.push(`[data-element-id="${cssEscape(elementId)}"]:${state}{${body}}`);
  }
  return rules.join('\n');
}

function kebab(k: string): string {
  return k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function cssValue(key: string, value: unknown): string {
  return typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value);
}

/** 속성 선택자에 들어갈 값 이스케이프 — 관리자가 임의 trackingId 를 넣을 수 있다 */
function cssEscape(v: string): string {
  return v.replace(/["\\]/g, '\\$&');
}

const UNITLESS = new Set([
  'opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flexGrow', 'flexShrink',
  'order', 'gridColumnStart', 'gridRowStart', 'scale',
]);
