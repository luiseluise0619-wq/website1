'use client';

import React from 'react';
import { DropZone } from '@puckeditor/core';
import { BlockShell, FreeCtx, toEmbedUrl, useLocalized, useRenderCtx } from './shared';
import { blockCSS } from '@/lib/style';
import type {
  ActionBinding,
  BaseBlockProps,
  ContainerProps,
  DividerProps,
  ImageProps,
  LocalizedText,
  ShapeProps,
  TextProps,
  VideoProps,
} from '@/types/schema';

/* =============================================================================
 * K-SOHO GLOBAL 블록 라이브러리
 * 각 블록은 (a) 자유 스타일 편집 (b) 다국어 (c) 클릭 추적 을 기본 탑재한다.
 * ========================================================================== */

type Block<P> = P & BaseBlockProps & { id?: string; free?: boolean };

/* ---- Text ----------------------------------------------------------------- */

/**
 * 태그별 기본 크기.
 * Tailwind preflight 가 h1~h4 의 크기를 지워 버려서, 에디터에서 태그를 h2 로
 * 바꿔도 화면은 본문 그대로였다("바꿔도 아무 일이 없다"). 사용자가 크기를
 * 지정하면 그 값이 이긴다 — 여기서는 비어 있는 자리만 채운다.
 */
const TAG_TYPOGRAPHY: Partial<Record<string, { fontSize: number; fontWeight: number; lineHeight: number }>> = {
  h1: { fontSize: 40, fontWeight: 800, lineHeight: 1.2 },
  h2: { fontSize: 30, fontWeight: 700, lineHeight: 1.25 },
  h3: { fontSize: 22, fontWeight: 700, lineHeight: 1.35 },
  h4: { fontSize: 18, fontWeight: 700, lineHeight: 1.4 },
};

export function TextBlock(props: Block<TextProps>) {
  const { tag = 'p', html } = props;
  const value = useLocalized(html);

  const defaults = TAG_TYPOGRAPHY[tag];
  const styled = defaults
    ? { ...props, style: { ...props.style, typography: { ...defaults, ...props.style?.typography } } }
    : props;

  return (
    <BlockShell {...styled} elementType="Text" as={tag} free={props.free}>
      {/* 인라인 서식(<strong>, <span style="color">)을 허용하기 위한 HTML 렌더.
          값은 저장 시점(/api/pages)에 sanitizeHtml() 로 정화되어 들어온다. */}
      <span dangerouslySetInnerHTML={{ __html: value }} />
    </BlockShell>
  );
}

/* ---- Button --------------------------------------------------------------- */

export interface ButtonBlockProps {
  label: LocalizedText;
  action: ActionBinding;
}

export function ButtonBlock(props: Block<ButtonBlockProps>) {
  const label = useLocalized(props.label);
  const { isEditing } = useRenderCtx();
  const action = props.action ?? { type: 'none' as const };

  const handleClick = (e: React.MouseEvent) => {
    // 에디터 캔버스 안에서는 링크가 실제로 이동하면 편집이 불가능해진다
    if (isEditing) {
      e.preventDefault();
      return;
    }
    if (action.type === 'scrollTo' && action.value) {
      e.preventDefault();
      document.querySelector(`[data-element-id="${action.value}"]`)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const href =
    action.type === 'navigate' || action.type === 'externalLink' ? action.value ?? '#' : undefined;

  return (
    <BlockShell {...props} elementType="Button" as={href ? 'a' : 'button'} free={props.free} onClick={handleClick}>
      {/* BlockShell 이 style/추적을 담당하므로 여기서는 콘텐츠만 */}
      <ButtonInner href={href} target={action.target} label={label} />
    </BlockShell>
  );
}

function ButtonInner({ href, target, label }: { href?: string; target?: string; label: string }) {
  // a/button 태그 자체는 BlockShell 이 렌더하므로, href 는 shell 밖에서 부여할 수 없다.
  // 대신 전체 영역을 덮는 링크를 깔아 클릭 타깃과 접근성을 동시에 만족시킨다.
  return (
    <>
      {href ? (
        <a
          href={href}
          target={target}
          rel={target === '_blank' ? 'noopener noreferrer' : undefined}
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit' }}
          aria-label={label}
        />
      ) : null}
      <span style={{ position: 'relative', pointerEvents: 'none' }}>{label}</span>
    </>
  );
}

/* ---- Image ---------------------------------------------------------------- */

export function ImageBlock(props: Block<ImageProps>) {
  const alt = useLocalized(props.alt);
  const { locale, isEditing } = useRenderCtx();
  const src = props.srcByLocale?.[locale] || props.src;

  /* 첫 화면(히어로)의 이미지는 즉시, 아래쪽 이미지는 스크롤할 때 받는다.
     카드가 수십 장인 페이지에서 전부 즉시 받으면 첫 렌더가 그만큼 늦어진다.
     에디터 캔버스에서는 전부 즉시 — 작업 중 이미지가 비어 보이면 안 된다. */
  const eager = isEditing || props.priority;

  return (
    <BlockShell {...props} elementType="Image" free={props.free}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        fetchPriority={props.priority ? 'high' : undefined}
        style={{
          width: '100%',
          height: '100%',
          objectFit: props.objectFit ?? 'cover',
          objectPosition: props.objectPosition,
          display: 'block',
          borderRadius: 'inherit',
        }}
      />
    </BlockShell>
  );
}

/* ---- Video ---------------------------------------------------------------- */

export function VideoBlock(props: Block<VideoProps>) {
  const { locale } = useRenderCtx();
  const source = props.sourceByLocale?.[locale] || props.source;

  return (
    <BlockShell {...props} elementType="Video" free={props.free}>
      {props.provider === 'file' ? (
        <video
          src={source}
          poster={props.poster}
          controls={props.controls ?? true}
          autoPlay={props.autoplay}
          loop={props.loop}
          muted={props.muted ?? props.autoplay}
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
        />
      ) : (
        <iframe
          src={toEmbedUrl(props.provider, source, props)}
          title="video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0, borderRadius: 'inherit', display: 'block' }}
        />
      )}
    </BlockShell>
  );
}

/* ---- Shape ---------------------------------------------------------------- */

export function ShapeBlock(props: Block<ShapeProps>) {
  const { kind = 'rect', fill = '#3b82f6', stroke, strokeWidth = 0, svgPath, viewBox, points } = props;

  const shape = () => {
    const common = { fill, stroke, strokeWidth };
    switch (kind) {
      case 'circle':
        return <circle cx="50" cy="50" r="50" {...common} />;
      case 'ellipse':
        return <ellipse cx="50" cy="50" rx="50" ry="35" {...common} />;
      case 'line':
        return <line x1="0" y1="50" x2="100" y2="50" stroke={stroke ?? fill} strokeWidth={strokeWidth || 4} />;
      case 'triangle':
        return <polygon points="50,0 100,100 0,100" {...common} />;
      case 'polygon':
        return <polygon points={(points ?? []).map((pt) => pt.join(',')).join(' ')} {...common} />;
      case 'svg':
        return <path d={svgPath ?? ''} {...common} />;
      default:
        return <rect x="0" y="0" width="100" height="100" {...common} />;
    }
  };

  return (
    <BlockShell {...props} elementType="Shape" free={props.free}>
      <svg
        viewBox={viewBox ?? '0 0 100 100'}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        {shape()}
      </svg>
    </BlockShell>
  );
}

/* ---- Divider / Spacer ----------------------------------------------------- */

export function DividerBlock(props: Block<DividerProps>) {
  const { orientation = 'horizontal', thickness = 1, color = '#e5e7eb' } = props;
  return (
    <BlockShell {...props} elementType="Divider" free={props.free}>
      <div
        style={{
          width: orientation === 'horizontal' ? '100%' : thickness,
          height: orientation === 'horizontal' ? thickness : '100%',
          background: color,
        }}
      />
    </BlockShell>
  );
}

export function SpacerBlock(props: Block<{ size: number }>) {
  /* 빈 칸도 캔버스에서는 잡아서 옮기고 늘릴 수 있어야 한다.
     BlockShell 을 거치지 않던 시절에는 data-free/​data-puck-id 가 없어
     조작 레이어가 이 블록만 찾지 못했다.

     trackingDisabled 는 BlockShell 이 분석 뿌리(바깥 상자)에 붙인다.
     안쪽 div 에 data-no-track 을 두면 뿌리에는 없는 셈이라, 빈 칸이
     클릭·데드클릭·노출로 집계돼 '눌렀는데 아무 일도 없는 곳' 지표를
     통째로 오염시킨다. */
  return (
    <BlockShell {...props} elementType="Spacer" free={props.free} trackingDisabled>
      <div style={{ height: props.size ?? 48 }} />
    </BlockShell>
  );
}

/* ---- Embed ---------------------------------------------------------------- */

export function EmbedBlock(props: Block<{ html: string }>) {
  return (
    <BlockShell {...props} elementType="Embed" free={props.free}>
      <div dangerouslySetInnerHTML={{ __html: props.html ?? '' }} style={{ width: '100%', height: '100%' }} />
    </BlockShell>
  );
}

/* ---- Container (Flex / Grid) ---------------------------------------------- */

export function ContainerBlock(props: Block<ContainerProps> & { zoneId?: string }) {
  const layout = props.layoutMode ?? 'flex';
  const elementId = props.trackingId || props.id || 'container';

  /* 배치는 아래 DropZone 한 곳만 맡는다.
     바깥 div 에도 display:grid 가 남으면 그리드가 이중으로 적용돼, 안쪽
     DropZone 이 첫 번째 칸(1/3 폭)에만 들어가고 카드가 그 안에서 다시 3열로
     쪼개진다 — 카드가 원래 폭의 9분의 1이 되는 원인이었다. */
  const {
    display: _display,
    gridTemplateColumns: _cols,
    gridAutoRows: _rows,
    flexDirection: _dir,
    justifyContent: _justify,
    alignItems: _align,
    flexWrap: _wrap,
    gap: _gap,
    ...css
  } = blockCSS(props, { free: props.free });

  return (
    <div
      style={css}
      data-element-id={elementId}
      data-element-type="Container"
      data-element-name={props.name}
      /* 휴대폰에서 여러 열을 한 열로 접기 위해 CSS 가 읽는 표시 (globals.css) */
      data-layout={layout}
    >
      {/* DropZone 이 Puck 의 중첩 편집 지점이다 — 관리자가 여기에 블록을 끌어다 놓는다 */}
      <DropZone
        zone="items"
        style={{
          display: layout === 'grid' ? 'grid' : 'flex',
          width: '100%',
          height: '100%',
          ...(layout === 'grid'
            ? {
                gridTemplateColumns:
                  typeof props.style?.grid?.columns === 'number'
                    ? `repeat(${props.style.grid.columns}, minmax(0,1fr))`
                    : props.style?.grid?.columns,
              }
            : {
                flexDirection: props.style?.flex?.direction ?? 'row',
                justifyContent: props.style?.flex?.justify,
                alignItems: props.style?.flex?.align,
                flexWrap: props.style?.flex?.wrap ?? 'wrap',
              }),
          gap: props.style?.flex?.gap ?? props.style?.grid?.gap ?? 16,
        }}
      />
    </div>
  );
}

/* ---- Section -------------------------------------------------------------- */

export function SectionBlock(props: Block<ContainerProps>) {
  const css = blockCSS(props, { free: false });
  const elementId = props.trackingId || props.id || 'section';
  const maxWidth = props.contentMaxWidth ?? 1280;

  return (
    <section
      style={{ ...css, position: 'relative', width: '100%' }}
      /* 섹션 단위 data-element-id 는 '이탈 지점' 분석의 기준이다 —
         IntersectionObserver 가 이 요소들을 관측한다. */
      data-element-id={elementId}
      data-element-type="Section"
      data-element-name={props.name}
      data-section="true"
    >
      <div style={{ maxWidth, margin: '0 auto', width: '100%', height: '100%', position: 'relative' }}>
        <DropZone zone="content" />
      </div>
    </section>
  );
}

/* ---- FreeCanvas (절대좌표 자유 배치) --------------------------------------- */

/**
 * 원 요구사항의 "X/Y/Z 자유 배치"를 Puck 위에서 성립시키는 블록.
 * 자식들은 흐름 배치 대신 placement(x,y,z) 좌표로 놓인다.
 */
export function FreeCanvasBlock(props: Block<{ height: number; snap?: number }>) {
  const css = blockCSS(props, { free: false });
  const { isEditing, designWidth } = useRenderCtx();
  const elementId = props.trackingId || props.id || 'canvas';
  const baseHeight = props.height ?? 640;

  /* 내용에 맞춰 높이를 늘린다.
     자식은 전부 position:absolute 라 부모 높이를 밀어내지 못한다. 그래서 예전에는
     설정된 높이(기본 640) 밖으로 끌어낸 요소가 overflow:hidden 에 잘려 사라졌고,
     화면에서는 다음 섹션이 그 위로 올라온 것처럼 보였다 — "섹션이 겹친다".
     실제로 그려진 넓이(scrollHeight)를 재서, 설정값보다 크면 그만큼 늘린다.
     설정값은 '최소 높이'가 되므로 내용을 줄이면 다시 원래 높이로 돌아온다. */
  const layerRef = React.useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  /* 서버에는 레이아웃이 없다 — useLayoutEffect 를 그대로 쓰면 공개 사이트
     렌더마다 React 경고가 찍힌다. 브라우저에서만 레이아웃 단계로 잰다. */
  const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

  useIsomorphicLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    /* 자식의 아래끝을 직접 잰다.
       scrollHeight 를 쓰면 안 된다: 그것은 '자기 높이'와 '내용'의 큰 쪽이라,
       한 번 늘어난 뒤에는 내용을 줄여도 계속 그 높이를 돌려줘 캔버스가
       영영 줄지 않는다. offsetTop/offsetHeight 는 레이아웃 값이라 사이트에
       걸린 축소 변형(transform:scale)에도 영향을 받지 않는다. */
    const measure = () => {
      let bottom = 0;
      for (const el of Array.from(layer.querySelectorAll<HTMLElement>('[data-free="true"]'))) {
        bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
      }
      const next = Math.ceil(bottom);
      setContentHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    measure();

    /* 요소를 끌어 내리거나 글이 길어지면 그 즉시 따라와야 한다.
       자식 하나하나가 아니라 레이어 전체의 크기 변화를 본다. */
    const resize = new ResizeObserver(measure);
    resize.observe(layer);
    for (const el of Array.from(layer.querySelectorAll('[data-free="true"]'))) resize.observe(el);

    /* 요소를 끌어 내리면 크기가 아니라 좌표(style.top)만 바뀐다 —
       ResizeObserver 는 그것을 알려주지 않으므로 속성 변화도 함께 본다. */
    const mutate = new MutationObserver(measure);
    mutate.observe(layer, { attributes: true, childList: true, subtree: true, attributeFilter: ['style'] });

    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
    /* 의존성 배열이 없으면 렌더마다(= 타이핑 한 글자마다) 옵저버 두 개를
       다시 만들고 자식 전체를 다시 훑는다. 관찰은 MutationObserver 가
       subtree 로 이미 담당하므로 한 번만 걸면 된다. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const height = Math.max(baseHeight, contentHeight);

  /* 자유 배치는 설계 폭(기본 1440px)을 전제로 좌표가 박혀 있다. 휴대폰에서는
     그 좌표가 화면 밖으로 나가 제목이 잘려 보이므로, 아트보드 전체를 화면
     폭에 맞춰 비례 축소한다. 에디터 안에서는 Puck 이 이미 확대/축소를
     담당하므로 건드리지 않는다(두 번 줄면 좌표 계산이 어긋난다). */
  const scale = `min(1, 100vw / ${designWidth}px)`;

  const shell: React.CSSProperties = isEditing
    ? { ...css, position: 'relative', width: '100%', height, overflow: 'hidden' }
    : { ...css, position: 'relative', width: '100%', height: `calc(${height}px * ${scale})`, overflow: 'hidden' };

  const inner: React.CSSProperties = isEditing
    ? { position: 'absolute', inset: 0 }
    : {
        position: 'absolute',
        top: 0,
        left: 0,
        width: designWidth,
        height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      };

  return (
    <div
      style={shell}
      data-element-id={elementId}
      data-element-type="FreeCanvas"
      data-free-canvas="true"
    >
      {/* 자식들은 각자 position:absolute + left/top 으로 자리를 잡는다.
          FreeCtx 가 "여기서는 placement 좌표를 쓰라"고 알린다. */}
      <FreeCtx.Provider value>
        {/* 높이를 재려면 레이어 DOM 을 잡아야 한다 — DropZone 은 ref 를 받지
            않으므로 한 겹 감싼다(레이아웃에 영향이 없도록 display:contents 는
            쓰지 않는다: 그러면 잡을 상자가 사라져 scrollHeight 가 0 이 된다). */}
        <div ref={layerRef} style={inner}>
          <DropZone zone="layers" style={{ position: 'absolute', inset: 0 }} />
        </div>
      </FreeCtx.Provider>
    </div>
  );
}
