'use client';

import React from 'react';
import { blockCSS, statesToCSSText, styleForBreakpoint } from '@/lib/style';
import { t } from '@/lib/i18n';
import type { BaseBlockProps, ElementType, LocaleCode, LocalizedText } from '@/types/schema';

/* =============================================================================
 * 모든 Puck 블록이 공유하는 렌더 규약
 * -----------------------------------------------------------------------------
 * 1) 루트 DOM 에 `data-element-id` 를 반드시 부여한다 → 클릭 히트맵의 기준점.
 * 2) 스타일은 blockCSS() 한 곳에서만 계산한다 → 에디터/실사이트 동일 보장.
 * 3) 텍스트는 LocalizedText 를 t() 로 해석한다 → 다국어가 렌더 시점에 결정된다.
 * ========================================================================== */

/** 렌더 컨텍스트 — 실사이트/에디터 프리뷰가 로케일과 브레이크포인트를 주입한다 */
export interface RenderContext {
  locale: LocaleCode;
  siteDefault: LocaleCode;
  /** 에디터 캔버스 내부인가 (링크 이동 차단, 클릭 추적 비활성) */
  isEditing: boolean;
  /** 자유 캔버스가 설계된 폭(px). 좁은 화면에서 이 비율로 줄인다. */
  designWidth: number;
}

export const RenderCtx = React.createContext<RenderContext>({
  locale: 'ko',
  siteDefault: 'ko',
  isEditing: false,
  designWidth: 1440,
});

export function useRenderCtx(): RenderContext {
  return React.useContext(RenderCtx);
}

/**
 * FreeCanvas 안쪽인지 알려주는 컨텍스트.
 * Puck 의 DropZone 은 부모가 자식에게 props 를 주입할 수 없으므로,
 * "지금 절대좌표 영역 안이다"라는 사실은 컨텍스트로 전달한다.
 */
export const FreeCtx = React.createContext(false);

export function useIsFree(): boolean {
  return React.useContext(FreeCtx);
}

/** LocalizedText 를 현재 로케일로 해석하는 훅 */
export function useLocalized(text: LocalizedText | string | undefined): string {
  const { locale, siteDefault } = useRenderCtx();
  return t(text, locale, siteDefault);
}

/**
 * Puck 이 각 블록 인스턴스에 부여하는 id 를 우선 사용하되,
 * 관리자가 trackingId 를 지정했으면 그 값을 쓴다(요소를 옮겨도 히스토리 유지).
 */
export function resolveElementId(props: BaseBlockProps & { id?: string }): string {
  return props.trackingId?.trim() || props.id || 'unknown';
}

export interface BlockShellProps extends BaseBlockProps {
  id?: string;
  elementType: ElementType;
  children: React.ReactNode;
  /** 부모가 FreeCanvas 인가 → 절대좌표 배치 */
  free?: boolean;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  onClick?: React.MouseEventHandler;
}

/**
 * 블록 공통 래퍼.
 * 분석 속성 + 스타일 + hover 규칙 주입을 한 군데로 모아 중복을 없앤다.
 */
export function BlockShell({
  elementType,
  children,
  free,
  as = 'div',
  className,
  onClick,
  ...props
}: BlockShellProps) {
  const { isEditing } = useRenderCtx();
  const inFreeCanvas = useIsFree();
  const isFree = free ?? inFreeCanvas;
  const elementId = resolveElementId(props);
  const Tag = as as React.ElementType;
  const css = blockCSS(props, { free: isFree });

  const stateRules = React.useMemo(
    () => statesToCSSText(props.states, styleForBreakpoint(props), elementId),
    [props.states, props.style, props.responsive, elementId],
  );

  if (props.hidden && !isEditing) return null;

  return (
    <>
      {stateRules ? <style dangerouslySetInnerHTML={{ __html: stateRules }} /> : null}
      <Tag
        style={css}
        className={className}
        onClick={onClick}
        /* --- 분석 계약: 이 세 속성이 히트맵/전환 집계의 입력이다 --- */
        data-element-id={elementId}
        data-element-type={elementType}
        data-element-name={props.name}
        data-conversion-goal={props.conversionGoal || undefined}
        data-no-track={props.trackingDisabled ? 'true' : undefined}
        data-hidden={props.hidden ? 'true' : undefined}
        /* 캔버스 밖 조작 레이어가 이 요소를 정확히 찾기 위한 Puck 인스턴스 id.
           data-element-id 는 관리자가 바꿀 수 있는 추적용이라 신뢰할 수 없다. */
        data-puck-id={props.id}
        data-free={isFree ? 'true' : undefined}
      >
        {children}
      </Tag>
    </>
  );
}

/** YouTube/Shorts/Vimeo URL 또는 ID → 임베드 URL */
export function toEmbedUrl(provider: string, source: string, opts: { autoplay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean } = {}): string {
  const id = extractVideoId(provider, source);
  const params = new URLSearchParams();
  if (opts.autoplay) params.set('autoplay', '1');
  if (opts.muted || opts.autoplay) params.set('mute', '1');
  if (opts.loop) {
    params.set('loop', '1');
    params.set('playlist', id);
  }
  if (opts.controls === false) params.set('controls', '0');
  params.set('rel', '0');

  if (provider === 'vimeo') return `https://player.vimeo.com/video/${id}?${params}`;
  return `https://www.youtube.com/embed/${id}?${params}`;
}

/** 전체 URL 을 붙여넣어도 동작하도록 ID 를 추출한다 */
export function extractVideoId(provider: string, source: string): string {
  const s = source.trim();
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    const url = new URL(s);
    if (provider === 'vimeo') return url.pathname.split('/').filter(Boolean).pop() ?? s;
    if (url.searchParams.get('v')) return url.searchParams.get('v') as string;
    // youtu.be/ID, /shorts/ID, /embed/ID 모두 마지막 세그먼트가 ID 다
    return url.pathname.split('/').filter(Boolean).pop() ?? s;
  } catch {
    return s;
  }
}
