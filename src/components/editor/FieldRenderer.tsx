'use client';

import React from 'react';
import type { Field } from '@puckeditor/core';

/* =============================================================================
 * 필드 렌더러
 * -----------------------------------------------------------------------------
 * Puck 은 중첩 DropZone 안의 항목을 선택 대상으로 받아주지 않아, 자유 배치 요소를
 * 고르면 Puck 인스펙터가 부모 캔버스를 계속 보여준다. 그래서 puck.config 의 필드
 * 정의를 그대로 읽어 우리 패널이 직접 그린다.
 *
 * 정의를 공유하기 때문에 필드를 추가해도 이 파일을 고칠 일이 없다 —
 * custom 필드(스타일 인스펙터, 다국어 입력, 좌표 입력)는 자기 render 를 그대로 쓴다.
 * ========================================================================== */

export interface FieldRendererProps {
  fields: Record<string, Field>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function FieldRenderer({ fields, values, onChange }: FieldRendererProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 14px 28px' }}>
      {Object.entries(fields).map(([key, field]) => (
        <FieldControl
          key={key}
          name={key}
          field={field}
          value={values[key]}
          onChange={(v) => onChange(key, v)}
        />
      ))}
    </div>
  );
}

function FieldControl({
  name,
  field,
  value,
  onChange,
}: {
  name: string;
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (field as { label?: string }).label ?? name;

  switch (field.type) {
    case 'custom':
      /* 스타일 인스펙터·다국어 입력 등은 이미 완성된 컴포넌트다 */
      return (
        <div>
          {field.render({
            field: field as never,
            name,
            id: name,
            value: value as never,
            onChange: onChange as never,
          })}
        </div>
      );

    case 'textarea':
      return (
        <Labeled label={label}>
          <textarea
            rows={4}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...input, resize: 'vertical' }}
          />
        </Labeled>
      );

    case 'number':
      return (
        <Labeled label={label}>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            style={input}
          />
        </Labeled>
      );

    case 'select':
      return (
        <Labeled label={label}>
          <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} style={input}>
            {(field.options ?? []).map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </Labeled>
      );

    case 'radio':
      return (
        <Labeled label={label}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(field.options ?? []).map((o) => {
              const active = String(value) === String(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onChange(o.value)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--puck-color-grey-09, #e5e7eb)',
                    background: active ? 'var(--puck-color-azure-05, #3b82f6)' : 'transparent',
                    color: active ? '#fff' : 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Labeled>
      );

    case 'object':
      return (
        <fieldset style={group}>
          <legend style={legend}>{label}</legend>
          {Object.entries(field.objectFields ?? {}).map(([k, sub]) => (
            <FieldControl
              key={k}
              name={k}
              field={sub as Field}
              value={(value as Record<string, unknown> | undefined)?.[k]}
              onChange={(v) => onChange({ ...(value as object), [k]: v })}
            />
          ))}
        </fieldset>
      );

    case 'array': {
      const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const summary = (field as { getItemSummary?: (i: unknown, n: number) => string }).getItemSummary;
      return (
        <fieldset style={group}>
          <legend style={legend}>{label}</legend>
          {items.map((item, i) => (
            <details key={i} style={{ border: '1px solid var(--puck-color-grey-09,#e5e7eb)', borderRadius: 6, padding: '6px 8px' }}>
              <summary style={{ fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                <span>{summary ? summary(item, i) : `${label} ${i + 1}`}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onChange(items.filter((_, idx) => idx !== i));
                  }}
                  style={{ background: 'none', border: 0, cursor: 'pointer', color: '#b91c1c' }}
                >
                  삭제
                </button>
              </summary>
              {Object.entries(field.arrayFields ?? {}).map(([k, sub]) => (
                <FieldControl
                  key={k}
                  name={k}
                  field={sub as Field}
                  value={item?.[k]}
                  onChange={(v) => {
                    const next = [...items];
                    next[i] = { ...item, [k]: v };
                    onChange(next);
                  }}
                />
              ))}
            </details>
          ))}
          <button type="button" onClick={() => onChange([...items, {}])} style={addBtn}>
            ＋ 항목 추가
          </button>
        </fieldset>
      );
    }

    case 'text':
    default:
      return (
        <Labeled label={label}>
          <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} style={input} />
        </Labeled>
      );
  }
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 6,
  border: '1px solid var(--puck-color-grey-09, #d4d8e0)',
  fontSize: 12,
  fontFamily: 'inherit',
  background: 'var(--puck-color-white, #fff)',
  color: 'inherit',
};

const group: React.CSSProperties = {
  border: '1px solid var(--puck-color-grey-09, #e5e7eb)',
  borderRadius: 8,
  padding: '8px 10px 10px',
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const legend: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.7, padding: '0 4px' };

const addBtn: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px dashed var(--puck-color-grey-09, #d4d8e0)',
  background: 'transparent',
  fontSize: 12,
  cursor: 'pointer',
  color: 'inherit',
};
