'use client';

import React from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { DropZone } from '@puckeditor/core';
import { useIsFree } from './shared';
import { blockCSS } from '@/lib/style';
import type { BaseBlockProps } from '@/types/schema';

/* =============================================================================
 * Carousel 블록 — BRAND / BUY 섹션의 제품·브랜드 슬라이더
 * -----------------------------------------------------------------------------
 * embla-carousel 은 DOM 을 복제하지 않고 스크롤 위치만 제어한다.
 * 덕분에 슬라이드 안의 요소가 data-element-id 를 그대로 유지하고,
 * 클릭 추적과 히트맵이 캐러셀 안에서도 정확히 동작한다.
 * ========================================================================== */

export interface CarouselBlockProps {
  slidesPerView: number;
  gap: number;
  loop?: boolean;
  showArrows?: boolean;
  showDots?: boolean;
  /** 자동 재생 간격(ms). 0 이면 사용하지 않음 */
  autoplayMs?: number;
}

type Props = CarouselBlockProps & BaseBlockProps & { id?: string; free?: boolean };

export function CarouselBlock(props: Props) {
  const { slidesPerView = 3, gap = 24, loop = true, showArrows = true, showDots = true, autoplayMs = 0 } = props;

  /* 이 블록만 BlockShell 을 거치지 않는다(embla 가 자체 래퍼를 요구한다).
     그래서 자유 캔버스 안에 있다는 사실을 스스로 알아내야 한다 — 예전에는
     props.free 만 봤는데 Puck 은 그런 prop 을 넣어 주지 않아 항상 false 였다.
     그 결과 placement 가 적용되지 않아 캔버스에서 캐러셀만 크기를 못 바꿨다. */
  const inFreeCanvas = useIsFree();
  const isFree = props.free ?? inFreeCanvas;

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop, align: 'start', slidesToScroll: 1 });
  const [selected, setSelected] = React.useState(0);
  const [snapCount, setSnapCount] = React.useState(0);

  React.useEffect(() => {
    if (!emblaApi) return;
    const sync = () => {
      setSelected(emblaApi.selectedScrollSnap());
      setSnapCount(emblaApi.scrollSnapList().length);
    };
    sync();
    emblaApi.on('select', sync);
    emblaApi.on('reInit', sync);
    return () => {
      emblaApi.off('select', sync);
      emblaApi.off('reInit', sync);
    };
  }, [emblaApi]);

  /* 자동 재생 — 사용자가 조작 중이면 멈춘다(포인터가 올라가 있을 때 포함) */
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (!emblaApi || !autoplayMs || paused) return;
    const timer = setInterval(() => emblaApi.scrollNext(), Math.max(1500, autoplayMs));
    return () => clearInterval(timer);
  }, [emblaApi, autoplayMs, paused]);

  const elementId = props.trackingId || props.id || 'carousel';
  const carouselCss = blockCSS(props, { free: isFree });

  return (
    <div
      /* 화살표 버튼이 이 상자 기준으로 자리를 잡으므로 위치 기준이 필요하다.
         다만 relative 를 못 박으면 안 된다 — 자유 캔버스 안에서는 blockCSS 가
         absolute + left/top 을 주는데, 그것을 덮어써서 좌표가 흐름 위치 기준으로
         밀려 캐러셀만 엉뚱한 데 놓였다. 이미 값이 있으면 그대로 둔다. */
      style={{ ...carouselCss, position: carouselCss.position ?? 'relative' }}
      data-element-id={elementId}
      data-element-type="Carousel"
      data-element-name={props.name}
      /* 캔버스 밖 조작 레이어가 이 요소를 찾아 선택·크기 조절을 건다.
         이 두 속성이 없으면 캐러셀만 선택되지 않는다(BlockShell 과 같은 계약). */
      data-puck-id={props.id}
      data-free={isFree ? 'true' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={emblaRef} style={{ overflow: 'hidden' }}>
        {/* 슬라이드 폭은 slidesPerView 로 나눈 비율 — gap 을 빼서 넘침을 막는다 */}
        <DropZone
          zone="slides"
          style={{
            display: 'flex',
            gap,
            // @ts-expect-error CSS 사용자 정의 속성
            '--ksoho-slide-basis': `calc(${100 / Math.max(1, slidesPerView)}% - ${(gap * (slidesPerView - 1)) / slidesPerView}px)`,
          }}
          className="ksoho-carousel-track"
        />
      </div>

      {showArrows && snapCount > 1 ? (
        <>
          <ArrowButton side="left" onClick={() => emblaApi?.scrollPrev()} />
          <ArrowButton side="right" onClick={() => emblaApi?.scrollNext()} />
        </>
      ) : null}

      {showDots && snapCount > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {Array.from({ length: snapCount }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}번째 슬라이드로`}
              data-no-track="true"
              onClick={() => emblaApi?.scrollTo(i)}
              style={{
                width: i === selected ? 20 : 7,
                height: 7,
                borderRadius: 999,
                border: 0,
                padding: 0,
                background: i === selected ? '#111827' : '#cbd3e1',
                cursor: 'pointer',
                transition: 'width .2s ease',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '이전' : '다음'}
      data-no-track="true"
      style={{
        position: 'absolute',
        top: '50%',
        [side]: -18,
        transform: 'translateY(-50%)',
        width: 36,
        height: 36,
        borderRadius: 999,
        border: '1px solid #e2e8f0',
        background: '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,.1)',
        cursor: 'pointer',
        fontSize: 14,
        lineHeight: 1,
        color: '#111827',
      }}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}
