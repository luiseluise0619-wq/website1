'use client';

import React from 'react';
import { FORM_SUBMIT_EVENT } from '@/types/analytics';
import { BlockShell, useRenderCtx } from './shared';
import { t } from '@/lib/i18n';
import type { BaseBlockProps, LocalizedText } from '@/types/schema';

/* =============================================================================
 * Form 블록 — BUSINESS 섹션(Buyer Inquiry / Distribution / Partnership / Media)
 * -----------------------------------------------------------------------------
 * 필드 구성을 관리자가 에디터에서 정하고, 라벨은 언어별로 저장된다.
 * 제출은 /api/inquiry 로 가며, 성공 시 conversion 이벤트가 함께 집계된다.
 * ========================================================================== */

export interface FormFieldConfig {
  /** 저장 키 — 영문 소문자 권장 (예: company, email) */
  name: string;
  label: LocalizedText;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: LocalizedText;
  /** select 전용 — 줄바꿈으로 구분된 선택지 */
  options?: string;
}

export interface FormBlockProps {
  formName: string;
  fields: FormFieldConfig[];
  submitLabel: LocalizedText;
  successMessage: LocalizedText;
  /** 개인정보 수집 동의 문구 — 비우면 동의 체크박스를 표시하지 않는다 */
  consentLabel?: LocalizedText;
}

type Props = FormBlockProps & BaseBlockProps & { id?: string; free?: boolean };

export function FormBlock(props: Props) {
  const { locale, siteDefault, isEditing } = useRenderCtx();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [consent, setConsent] = React.useState(false);
  const [state, setState] = React.useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const fields = props.fields ?? [];
  const tr = (v: LocalizedText | undefined, fallback = '') => t(v, locale, siteDefault) || fallback;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 에디터 캔버스에서는 실제 접수가 일어나면 안 된다
    if (isEditing) return;

    setState('sending');
    setError(null);
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formName: props.formName || 'inquiry',
          locale,
          path: window.location.pathname,
          fields: values,
          // UTM 은 문의가 어느 채널에서 왔는지 귀속하는 유일한 단서다
          utm: Object.fromEntries(
            ['source', 'medium', 'campaign', 'content', 'term']
              .map((k) => [k, new URLSearchParams(window.location.search).get(`utm_${k}`)])
              .filter(([, v]) => v) as [string, string][],
          ),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? '문의 접수에 실패했습니다.');
      setState('done');
      setValues({});
      setConsent(false);

      /* 제출이 성공한 순간만 집계한다 — 버튼 클릭(element_click)은 실패한
         제출도 포함하므로 '문의가 실제로 접수된 수'와 다르다. */
      window.dispatchEvent(
        new CustomEvent(FORM_SUBMIT_EVENT, {
          detail: {
            elementId: props.trackingId || props.id || 'form',
            formName: props.formName || 'inquiry',
            goal: props.conversionGoal || undefined,
          },
        }),
      );
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : '문의 접수에 실패했습니다.');
    }
  };

  if (state === 'done') {
    return (
      <BlockShell {...props} elementType="Form" free={props.free}>
        <div style={{ padding: 28, textAlign: 'center' }} data-form-state="success">
          <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>✓</div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {tr(props.successMessage, '문의가 접수되었습니다. 확인 후 연락드리겠습니다.')}
          </p>
        </div>
      </BlockShell>
    );
  }

  return (
    <BlockShell {...props} elementType="Form" free={props.free}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
        {fields.map((field) => {
          const label = tr(field.label, field.name);
          const placeholder = tr(field.placeholder);
          const common = {
            id: `${props.id}-${field.name}`,
            name: field.name,
            required: field.required,
            placeholder,
            value: values[field.name] ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
              setValues((v) => ({ ...v, [field.name]: e.target.value })),
            style: fieldStyle,
          };

          return (
            <label key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {label}
                {field.required ? <span style={{ color: '#ef4444' }}> *</span> : null}
              </span>
              {field.type === 'textarea' ? (
                <textarea {...common} rows={5} style={{ ...fieldStyle, resize: 'vertical' }} />
              ) : field.type === 'select' ? (
                <select {...common}>
                  <option value="">— 선택 —</option>
                  {(field.options ?? '')
                    .split('\n')
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                </select>
              ) : (
                <input {...common} type={field.type} />
              )}
            </label>
          );
        })}

        {tr(props.consentLabel) ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.6 }}>
            <input type="checkbox" checked={consent} required onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>{tr(props.consentLabel)}</span>
          </label>
        ) : null}

        {error ? <div style={{ fontSize: 12, color: '#b91c1c' }}>{error}</div> : null}

        <button
          type="submit"
          disabled={state === 'sending'}
          /* 제출 버튼도 추적 대상 — 폼 이탈률(노출 대비 제출) 계산의 분모/분자가 된다 */
          data-element-id={`${props.trackingId || props.id}-submit`}
          data-element-type="Button"
          data-conversion-goal={props.conversionGoal || `${props.formName || 'inquiry'}_submit`}
          style={submitStyle}
        >
          {state === 'sending' ? '전송 중…' : tr(props.submitLabel, '문의하기')}
        </button>
      </form>
    </BlockShell>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 8,
  border: '1px solid #d4d8e0',
  fontSize: 14,
  fontFamily: 'inherit',
  background: '#fff',
  color: '#111827',
};

const submitStyle: React.CSSProperties = {
  padding: '13px 20px',
  borderRadius: 999,
  border: 0,
  background: '#111827',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
};
