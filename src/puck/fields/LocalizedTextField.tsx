'use client';

import React from 'react';
import type { CustomField } from '@puckeditor/core';
import { useEditorStore } from '@/store/editorStore';
import { LOCALE_ORDER, LOCALES, hashText, resolutionOf, setLocalized, translationState } from '@/lib/i18n';
import { translateBatch } from '@/lib/translate/client';
import type { LocaleCode, LocalizedText } from '@/types/schema';

/* =============================================================================
 * Localized Text Field
 * -----------------------------------------------------------------------------
 * 인스펙터의 텍스트 입력 하나가 실제로는 언어별 슬롯 6개를 편집한다.
 *  · 현재 편집 로케일 슬롯만 입력창으로 보여주고
 *  · 나머지 언어의 번역 상태는 뱃지로 요약하며
 *  · [자동번역] 버튼으로 이 필드만 즉시 채운다.
 * ========================================================================== */

const STATE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  missing: { bg: '#fee2e2', fg: '#b91c1c', label: '미번역' },
  stale: { bg: '#fef3c7', fg: '#b45309', label: '원문변경' },
  auto: { bg: '#dbeafe', fg: '#1d4ed8', label: '자동' },
  manual: { bg: '#dcfce7', fg: '#15803d', label: '완료' },
};

interface Props {
  value: LocalizedText | undefined;
  onChange: (v: LocalizedText) => void;
  label?: string;
  multiline?: boolean;
}

export function LocalizedTextInput({ value, onChange, label, multiline }: Props) {
  const editingLocale = useEditorStore((s) => s.editingLocale);
  /* 뱃지를 눌러 그 언어로 바로 넘어갈 수 있게 한다 — 상단까지 올라가지 않아도 된다 */
  const setEditingLocale = useEditorStore((s) => s.setEditingLocale);
  const showBadges = useEditorStore((s) => s.showTranslationBadges);
  const sourceLocale = useEditorStore((s) => s.activePage()?.sourceLocale ?? 'ko');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resolution = resolutionOf(value, editingLocale);
  const current = value?.[editingLocale] ?? '';
  const sourceText = value?.[sourceLocale] ?? '';

  const handleChange = (next: string) => {
    onChange(
      setLocalized(value, editingLocale, next, {
        source: 'manual',
        reviewed: true,
        translatedAt: new Date().toISOString(),
        sourceHash: editingLocale === sourceLocale ? undefined : hashText(sourceText),
      }),
    );
  };

  /** 이 필드만 다른 모든 언어로 번역 — 전체 페이지 번역과 별개의 빠른 경로 */
  const handleTranslate = async () => {
    if (!sourceText.trim()) {
      setError('원문(기준 언어)이 비어 있습니다.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const targets = LOCALE_ORDER.filter((l) => l !== sourceLocale);
      const result = await translateBatch({ texts: [sourceText], source: sourceLocale, targets });
      let next = value ?? {};
      for (const target of targets) {
        const translated = result[target]?.[0];
        if (!translated) continue;
        next = setLocalized(next, target, translated, {
          source: 'auto',
          provider: result._provider,
          sourceHash: hashText(sourceText),
          translatedAt: new Date().toISOString(),
          reviewed: false,
        });
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '번역에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {label} <span style={{ opacity: 0.6 }}>· {LOCALES[editingLocale].flag} {editingLocale.toUpperCase()}</span>
        </span>
        <button
          type="button"
          onClick={handleTranslate}
          disabled={busy}
          title="이 항목을 모든 언어로 자동 번역"
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid #d4d8e0',
            background: busy ? '#eef1f6' : '#fff',
            cursor: busy ? 'progress' : 'pointer',
          }}
        >
          {busy ? '번역 중…' : '자동번역'}
        </button>
      </div>

      <InputTag
        value={current}
        rows={multiline ? 4 : undefined}
        placeholder={resolution.isFallback && resolution.value ? `(${resolution.resolvedFrom}) ${resolution.value}` : ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => handleChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid #d4d8e0',
          fontSize: 13,
          fontFamily: 'inherit',
          resize: multiline ? 'vertical' : undefined,
        }}
      />

      {showBadges ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {LOCALE_ORDER.map((locale) => {
            const state = translationState(value, locale, sourceLocale);
            const s = STATE_STYLE[state];
            return (
              <button
                key={locale}
                type="button"
                onClick={() => setEditingLocale(locale)}
                title={`${LOCALES[locale].koName}: ${s.label} — 눌러서 이 언어로 편집`}
                style={{
                  fontSize: 10,
                  padding: '2px 5px',
                  borderRadius: 4,
                  background: s.bg,
                  color: s.fg,
                  fontWeight: 600,
                  opacity: locale === editingLocale ? 1 : 0.75,
                  border: locale === editingLocale ? '1px solid currentColor' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {locale.toUpperCase()}
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? <span style={{ fontSize: 11, color: '#b91c1c' }}>{error}</span> : null}
    </div>
  );
}

/** Puck 필드 정의 팩토리 — components 설정에서 `localizedText('버튼 라벨')` 처럼 쓴다 */
export function localizedText<T extends LocalizedText | undefined = LocalizedText>(
  label: string,
  multiline = false,
): CustomField<T> {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange }) => (
      <LocalizedTextInput
        value={value as LocalizedText | undefined}
        onChange={(next) => onChange(next as T)}
        label={label}
        multiline={multiline}
      />
    ),
  };
}

export type { LocaleCode };
