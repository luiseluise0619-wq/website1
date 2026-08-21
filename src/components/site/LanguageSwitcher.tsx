'use client';

import React from 'react';
import { LOCALES, LOCALE_ORDER, persistLocale } from '@/lib/i18n';
import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * 방문자 언어 선택 드롭다운
 * 선택은 쿠키에 저장되어 다음 방문/서버 렌더에서도 유지된다.
 * ========================================================================== */

export interface LanguageSwitcherProps {
  locale: LocaleCode;
  available?: LocaleCode[];
  onChange: (next: LocaleCode) => void;
  compact?: boolean;
}

export function LanguageSwitcher({ locale, available = LOCALE_ORDER, onChange, compact }: LanguageSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (next: LocaleCode) => {
    setOpen(false);
    if (next === locale) return;
    persistLocale(next);
    onChange(next);
  };

  const current = LOCALES[locale];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="언어 선택"
        data-no-track="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '5px 9px' : '7px 12px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,.25)',
          background: 'transparent',
          color: 'inherit',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden>{current.flag}</span>
        {!compact && <span>{current.nativeName}</span>}
        <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
      </button>

      {open ? (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 160,
            background: '#151922',
            color: '#e6ebf5',
            borderRadius: 10,
            padding: 6,
            margin: 0,
            listStyle: 'none',
            boxShadow: '0 12px 32px rgba(0,0,0,.4)',
            zIndex: 100,
          }}
        >
          {available.map((code) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={code === locale}
                onClick={() => pick(code)}
                data-no-track="true"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 0,
                  background: code === locale ? 'rgba(59,130,246,.18)' : 'transparent',
                  color: 'inherit',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span aria-hidden>{LOCALES[code].flag}</span>
                <span>{LOCALES[code].nativeName}</span>
                {code === locale ? <span style={{ marginLeft: 'auto', fontSize: 11 }}>✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
