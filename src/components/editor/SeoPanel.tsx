'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { LOCALES, LOCALE_ORDER, t } from '@/lib/i18n';

/* =============================================================================
 * SEO 패널 — 로케일별 메타데이터 편집
 * 검색 결과 미리보기를 함께 보여줘 길이 감각을 잡을 수 있게 한다.
 * ========================================================================== */

export function SeoPanel() {
  const page = useEditorStore((s) => s.activePage());
  const locale = useEditorStore((s) => s.editingLocale);
  const updateSeoText = useEditorStore((s) => s.updateSeoText);
  const updateSeo = useEditorStore((s) => s.updateSeo);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);

  if (!page) return null;

  const title = t(page.seo.title, locale, page.sourceLocale);
  const description = t(page.seo.description, locale, page.sourceLocale);

  /* 지정이 없으면 전체 언어 노출이 기본값이다 (스키마의 enabledLocales 미설정) */
  const enabledLocales = page.enabledLocales?.length ? page.enabledLocales : LOCALE_ORDER;

  const toggleLocale = (code: (typeof LOCALE_ORDER)[number]) => {
    const next = enabledLocales.includes(code)
      ? enabledLocales.filter((l) => l !== code)
      : [...LOCALE_ORDER.filter((l) => enabledLocales.includes(l) || l === code)];
    if (!next.length) return;
    updatePageMeta(page.id, { enabledLocales: next });
  };

  return (
    <div style={{ padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.6 }}>
        편집 언어: {LOCALES[locale].flag} {LOCALES[locale].nativeName}
      </div>

      <Field label="페이지 제목">
        <input value={page.title} onChange={(e) => updatePageMeta(page.id, { title: e.target.value })} style={input} />
      </Field>

      <Field label={`SEO 제목 (${locale})`} hint={`${title.length}/60자`}>
        <input value={page.seo.title?.[locale] ?? ''} placeholder={title} onChange={(e) => updateSeoText(page.id, 'title', e.target.value)} style={input} />
      </Field>

      <Field label={`SEO 설명 (${locale})`} hint={`${description.length}/160자`}>
        <textarea
          value={page.seo.description?.[locale] ?? ''}
          placeholder={description}
          rows={3}
          onChange={(e) => updateSeoText(page.id, 'description', e.target.value)}
          style={{ ...input, resize: 'vertical' }}
        />
      </Field>

      <Field label="OG 이미지 URL">
        <input value={page.seo.ogImage ?? ''} onChange={(e) => updateSeo(page.id, { ogImage: e.target.value })} style={input} />
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <input type="checkbox" checked={page.seo.noindex ?? false} onChange={(e) => updateSeo(page.id, { noindex: e.target.checked })} />
        검색엔진 색인 제외 (noindex)
      </label>

      {/* --- 이 페이지를 어떤 언어로 보여줄 것인가 ---
          예: 태국 전용 랜딩은 태국어·영어만. 여기서 끈 언어는 방문자 언어
          판정에서 제외되고 hreflang·사이트맵에서도 빠진다. */}
      <Field label="노출 언어" hint={`${enabledLocales.length}/${LOCALE_ORDER.length}`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LOCALE_ORDER.map((code) => {
            const on = enabledLocales.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleLocale(code)}
                /* 전부 꺼 두면 어떤 방문자에게도 보여줄 언어가 없다 */
                disabled={on && enabledLocales.length === 1}
                title={on && enabledLocales.length === 1 ? '최소 한 개 언어는 남겨야 합니다' : undefined}
                style={{
                  padding: '4px 9px',
                  borderRadius: 999,
                  border: `1px solid ${on ? '#3b82f6' : 'var(--ks-edge)'}`,
                  background: on ? 'rgba(59,130,246,.18)' : 'transparent',
                  color: on ? '#e6ebf5' : 'var(--ks-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {LOCALES[code].flag} {code.toUpperCase()}
              </button>
            );
          })}
        </div>
      </Field>

      {/* --- 검색 결과 미리보기 --- */}
      <div style={{ background: '#fff', color: '#202124', borderRadius: 8, padding: 12, marginTop: 4 }}>
        <div style={{ fontSize: 11, color: '#5f6368' }}>k-soho.global{page.path}</div>
        <div style={{ fontSize: 15, color: '#1a0dab', margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title || page.title}
        </div>
        <div style={{ fontSize: 12, color: '#4d5156', lineHeight: 1.5 }}>{description || '설명이 없습니다.'}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint ? <span style={{ opacity: 0.5 }}>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 6,
  border: '1px solid var(--ks-edge)',
  background: 'var(--ks-panel2)',
  color: 'inherit',
  fontSize: 12,
  fontFamily: 'inherit',
};
