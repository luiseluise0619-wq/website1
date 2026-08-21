'use client';

import React from 'react';
import type { CustomField } from '@puckeditor/core';
import type { BoxSpacing, ElementStyle, FreePlacement } from '@/types/schema';

/* =============================================================================
 * Style Inspector Fields
 * GrapesJS 의 우측 스타일 패널에 해당하는 기능을 Puck 커스텀 필드로 구현한다.
 * 하나의 `style` prop(ElementStyle) 을 여러 섹션이 나눠 편집한다.
 * ========================================================================== */

const row: React.CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' };
const input: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #d4d8e0',
  fontSize: 12,
};
const legend: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.4 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <legend style={legend}>{title}</legend>
      {children}
    </fieldset>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label style={{ ...row, justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={row}>
        {/* 색상 피커 + 직접 입력(투명/그라디언트 문자열 대응) 두 경로를 모두 연다 */}
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? (value as string) : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 28, height: 26, padding: 0, border: '1px solid #d4d8e0', borderRadius: 4, background: 'none' }}
        />
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="transparent" style={{ ...input, width: 96 }} />
      </span>
    </label>
  );
}

function NumberInput({ label, value, onChange, suffix = 'px' }: { label: string; value?: number | string; onChange: (v: number | string) => void; suffix?: string }) {
  return (
    <label style={{ ...row, justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={{ ...row, width: 130 }}>
        <input
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            const num = Number(raw);
            // '50%' 나 'auto' 같은 CSS 값도 그대로 허용한다
            onChange(raw === '' ? '' : Number.isFinite(num) && raw.trim() !== '' ? num : raw);
          }}
          style={input}
        />
        <span style={{ fontSize: 10, opacity: 0.5 }}>{suffix}</span>
      </span>
    </label>
  );
}

function SpacingInput({ label, value, onChange }: { label: string; value?: BoxSpacing; onChange: (v: BoxSpacing) => void }) {
  const set = (side: keyof BoxSpacing) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value);
    onChange({ ...value, [side]: e.target.value === '' ? undefined : Number.isFinite(n) ? n : e.target.value });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12 }}>{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <input key={side} value={(value?.[side] as string | number) ?? ''} onChange={set(side)} placeholder={side[0].toUpperCase()} style={{ ...input, textAlign: 'center' }} />
        ))}
      </div>
    </div>
  );
}

/** 전체 스타일 인스펙터 — 하나의 커스텀 필드가 ElementStyle 전체를 다룬다 */
export function StyleInspector({ value, onChange }: { value: ElementStyle | undefined; onChange: (v: ElementStyle) => void }) {
  const style = value ?? {};
  const patch = (p: Partial<ElementStyle>) => onChange({ ...style, ...p });

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Section title="크기">
        <NumberInput label="너비" value={style.width} onChange={(width) => patch({ width })} />
        <NumberInput label="높이" value={style.height} onChange={(height) => patch({ height })} />
        <NumberInput label="Z-Index" value={style.zIndex} suffix="" onChange={(z) => patch({ zIndex: Number(z) || 0 })} />
      </Section>

      <Section title="배경 & 색상">
        <ColorInput label="배경" value={style.background?.color} onChange={(color) => patch({ background: { ...style.background, color } })} />
        <ColorInput label="글자색" value={style.color} onChange={(color) => patch({ color })} />
        <label style={{ ...row, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>그라디언트</span>
          <input
            value={style.background?.gradient ?? ''}
            placeholder="linear-gradient(...)"
            onChange={(e) => patch({ background: { ...style.background, gradient: e.target.value } })}
            style={{ ...input, width: 130 }}
          />
        </label>
      </Section>

      <Section title="타이포그래피">
        <label style={{ ...row, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>폰트</span>
          <select
            value={style.typography?.fontFamily ?? ''}
            onChange={(e) => patch({ typography: { ...style.typography, fontFamily: e.target.value } })}
            style={{ ...input, width: 130 }}
          >
            {/* next/font 로 실제 로드된 폰트만 노출한다 —
                로드되지 않은 이름을 고르면 시스템 폰트로 떨어져 디자인이 깨진다 */}
            <option value="">기본 (언어별 자동)</option>
            <option value="var(--font-noto-kr), sans-serif">Noto Sans KR</option>
            <option value="var(--font-inter), sans-serif">Inter</option>
            <option value="var(--font-noto-thai), sans-serif">Noto Sans Thai</option>
            <option value="var(--font-noto-jp), sans-serif">Noto Sans JP</option>
            <option value="var(--font-noto-sc), sans-serif">Noto Sans SC</option>
          </select>
        </label>
        <NumberInput label="크기" value={style.typography?.fontSize} onChange={(fontSize) => patch({ typography: { ...style.typography, fontSize } })} />
        <NumberInput label="굵기" suffix="" value={style.typography?.fontWeight} onChange={(fontWeight) => patch({ typography: { ...style.typography, fontWeight } })} />
        <NumberInput label="행간" suffix="" value={style.typography?.lineHeight} onChange={(lineHeight) => patch({ typography: { ...style.typography, lineHeight } })} />
        <NumberInput label="자간" value={style.typography?.letterSpacing} onChange={(letterSpacing) => patch({ typography: { ...style.typography, letterSpacing } })} />
        <label style={{ ...row, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>정렬</span>
          <span style={row}>
            {(['left', 'center', 'right', 'justify'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => patch({ typography: { ...style.typography, textAlign: align } })}
                style={{
                  padding: '4px 7px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid #d4d8e0',
                  background: style.typography?.textAlign === align ? '#111827' : '#fff',
                  color: style.typography?.textAlign === align ? '#fff' : '#111827',
                  cursor: 'pointer',
                }}
              >
                {align[0].toUpperCase()}
              </button>
            ))}
          </span>
        </label>
      </Section>

      <Section title="여백">
        <SpacingInput label="Padding" value={style.padding} onChange={(padding) => patch({ padding })} />
        <SpacingInput label="Margin" value={style.margin} onChange={(margin) => patch({ margin })} />
      </Section>

      <Section title="테두리 & 그림자">
        <NumberInput label="Radius" value={style.border?.radius as number} onChange={(radius) => patch({ border: { ...style.border, radius } })} />
        <NumberInput label="두께" value={style.border?.width} onChange={(width) => patch({ border: { ...style.border, width, style: style.border?.style ?? 'solid' } })} />
        <ColorInput label="테두리색" value={style.border?.color} onChange={(color) => patch({ border: { ...style.border, color, style: style.border?.style ?? 'solid' } })} />
        <label style={{ ...row, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>그림자</span>
          <select
            value={style.shadows?.length ? 'on' : 'off'}
            onChange={(e) =>
              patch({ shadows: e.target.value === 'on' ? [{ x: 0, y: 12, blur: 32, spread: 0, color: 'rgba(0,0,0,.18)' }] : [] })
            }
            style={{ ...input, width: 130 }}
          >
            <option value="off">없음</option>
            <option value="on">기본 그림자</option>
          </select>
        </label>
        <NumberInput label="투명도" suffix="0-1" value={style.opacity} onChange={(opacity) => patch({ opacity: Number(opacity) })} />
      </Section>
    </div>
  );
}

export function styleField(label = '스타일'): CustomField<ElementStyle | undefined> {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange }) => <StyleInspector value={value} onChange={onChange} />,
  };
}

/** 자유 배치 좌표 필드 (FreeCanvas 자식 전용) */
export function placementField(): CustomField<FreePlacement | undefined> {
  return {
    type: 'custom',
    label: '자유 배치 (X / Y / Z)',
    render: ({ value, onChange }) => {
      const v: FreePlacement = value ?? { x: 0, y: 0 };
      const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...v, [k]: e.target.value === '' ? undefined : Number(e.target.value) });
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {(['x', 'y', 'z', 'width', 'height', 'rotate'] as const).map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.6 }}>{k.toUpperCase()}</span>
              <input type="number" value={(v[k] as number | undefined) ?? ''} onChange={set(k)} style={input} />
            </label>
          ))}
        </div>
      );
    },
  };
}
