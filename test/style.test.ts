import { describe, expect, it } from 'vitest';
import { blockCSS, len, mergeStyle, statesToCSSText, styleForBreakpoint, toCSS } from '@/lib/style';
import type { ElementStyle } from '@/types/schema';

/* 스타일 엔진은 에디터 캔버스와 실제 사이트가 공유한다.
   여기가 어긋나면 "에디터에서 본 것 ≠ 배포된 것"이 된다. */

describe('len — 단위 처리', () => {
  it('숫자는 px, 문자열은 그대로', () => {
    expect(len(24)).toBe('24px');
    expect(len('50%')).toBe('50%');
    expect(len('auto')).toBe('auto');
  });
  it('빈 값은 undefined', () => {
    expect(len(undefined)).toBeUndefined();
    expect(len('')).toBeUndefined();
  });
  it('0 은 유효한 값이다', () => {
    expect(len(0)).toBe('0px');
  });
});

describe('toCSS — 레이아웃 모드', () => {
  const style: ElementStyle = { x: 100, y: 50, zIndex: 3, width: 200 };

  it('부모가 absolute 면 x/y 를 좌표로 쓴다', () => {
    const css = toCSS(style, { parentLayout: 'absolute' });
    expect(css).toMatchObject({ position: 'absolute', left: '100px', top: '50px', zIndex: 3 });
  });

  it('부모가 flex 면 좌표를 무시하고 흐름에 참여한다', () => {
    const css = toCSS(style, { parentLayout: 'flex' });
    expect(css.position).toBe('relative');
    expect(css.left).toBeUndefined();
    expect(css.top).toBeUndefined();
  });

  it('flex 자식 규칙은 부모가 flex 일 때만 적용된다', () => {
    const s: ElementStyle = { flexItem: { grow: 1, alignSelf: 'center' } };
    expect(toCSS(s, { parentLayout: 'flex' })).toMatchObject({ flexGrow: 1, alignSelf: 'center' });
    expect(toCSS(s, { parentLayout: 'grid' }).flexGrow).toBeUndefined();
  });

  it('grid 배치는 부모가 grid 일 때만 적용된다', () => {
    const s: ElementStyle = { gridPlacement: { colStart: 2, colSpan: 3 } };
    expect(toCSS(s, { parentLayout: 'grid' })).toMatchObject({ gridColumnStart: 2, gridColumnEnd: 'span 3' });
    expect(toCSS(s, { parentLayout: 'flex' }).gridColumnStart).toBeUndefined();
  });
});

describe('toCSS — 시각 속성', () => {
  it('여백을 4방향 축약형으로 만든다', () => {
    const css = toCSS({ padding: { top: 10, right: 20, bottom: 10, left: 20 } });
    expect(css.padding).toBe('10px 20px 10px 20px');
  });

  it('모두 0 인 여백은 출력하지 않는다', () => {
    expect(toCSS({ padding: {} }).padding).toBeUndefined();
  });

  it('배경 레이어를 오버레이 → 그라디언트 → 이미지 순으로 쌓는다', () => {
    const css = toCSS({ background: { overlay: 'rgba(0,0,0,.4)', imageUrl: 'https://x/y.jpg' } });
    expect(css.backgroundImage).toBe('linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,.4)), url("https://x/y.jpg")');
  });

  it('그림자 배열을 CSS 문자열로 합친다', () => {
    const css = toCSS({ shadows: [{ x: 0, y: 4, blur: 12, color: 'rgba(0,0,0,.2)' }] });
    // spread 미지정 시 단위 없는 0 — CSS 에서 유효하다
    expect(css.boxShadow).toBe('0px 4px 12px 0 rgba(0,0,0,.2)');
  });

  it('모서리별 radius 배열을 지원한다', () => {
    expect(toCSS({ border: { radius: [8, 0, 8, 0] } }).borderRadius).toBe('8px 0px 8px 0px');
  });

  it('행간은 배수와 길이를 구분한다', () => {
    expect(toCSS({ typography: { lineHeight: 1.5 } }).lineHeight).toBe(1.5);
    expect(toCSS({ typography: { lineHeight: 24 } }).lineHeight).toBe('24px');
  });

  it('transform 을 순서대로 조합한다', () => {
    expect(toCSS({ transform: { rotate: 45, scale: 1.2 } }).transform).toBe('rotate(45deg) scale(1.2)');
  });

  it('raw 로 임의 CSS 를 주입할 수 있다', () => {
    expect(toCSS({ raw: { mixBlendMode: 'multiply' } })).toMatchObject({ mixBlendMode: 'multiply' });
  });

  it('undefined 키를 남기지 않는다', () => {
    const css = toCSS({ width: 10 });
    expect(Object.values(css).every((v) => v !== undefined)).toBe(true);
  });
});

describe('mergeStyle — 깊은 병합', () => {
  it('중첩 객체는 병합하고 스칼라는 덮어쓴다', () => {
    const merged = mergeStyle(
      { typography: { fontSize: 16, fontWeight: 400 }, color: 'red' },
      { typography: { fontSize: 24 }, color: 'blue' },
    );
    expect(merged.typography).toEqual({ fontSize: 24, fontWeight: 400 });
    expect(merged.color).toBe('blue');
  });

  it('undefined 는 기존 값을 지우지 않는다', () => {
    expect(mergeStyle({ color: 'red' }, { color: undefined }).color).toBe('red');
  });
});

describe('styleForBreakpoint — 반응형 상속', () => {
  const props = {
    style: { width: 1200, typography: { fontSize: 48 } },
    responsive: { tablet: { width: 768 }, mobile: { typography: { fontSize: 28 } } },
  };

  it('base 는 기본 스타일 그대로', () => {
    expect(styleForBreakpoint(props, 'base').width).toBe(1200);
  });

  it('tablet 은 base 위에 얹는다', () => {
    expect(styleForBreakpoint(props, 'tablet').width).toBe(768);
  });

  it('mobile 은 base ← tablet ← mobile 순으로 상속한다', () => {
    const s = styleForBreakpoint(props, 'mobile');
    expect(s.width).toBe(768);              // tablet 에서 상속
    expect(s.typography?.fontSize).toBe(28); // mobile 이 덮어씀
  });
});

describe('blockCSS — 자유 배치', () => {
  it('placement 좌표를 위치로 반영한다', () => {
    const css = blockCSS({ style: { width: 100 }, placement: { x: 40, y: 60, z: 5 } }, { free: true });
    expect(css).toMatchObject({ position: 'absolute', left: '40px', top: '60px', zIndex: 5 });
  });

  it('free 가 아니면 placement 를 무시한다', () => {
    const css = blockCSS({ style: {}, placement: { x: 40, y: 60 } }, { free: false });
    expect(css.left).toBeUndefined();
  });
});

describe('statesToCSSText — hover 규칙', () => {
  it('data-element-id 선택자로 규칙을 만든다', () => {
    const out = statesToCSSText({ hover: { color: '#fff' } }, { color: '#000' }, 'cta-1');
    expect(out).toContain('[data-element-id="cta-1"]:hover');
    expect(out).toContain('color:#fff');
  });

  it('위치 속성은 상태 전환에서 제외한다 (hover 시 요소가 튀지 않도록)', () => {
    const out = statesToCSSText({ hover: { color: '#fff' } }, { x: 10, y: 20, color: '#000' }, 'a');
    expect(out).not.toContain('left:');
    expect(out).not.toContain('top:');
  });

  it('선택자에 들어갈 따옴표를 이스케이프한다', () => {
    const out = statesToCSSText({ hover: { color: '#fff' } }, {}, 'a"b');
    expect(out).not.toContain('"a"b"');
  });

  it('states 가 없으면 빈 문자열', () => {
    expect(statesToCSSText(undefined, {}, 'x')).toBe('');
  });
});
