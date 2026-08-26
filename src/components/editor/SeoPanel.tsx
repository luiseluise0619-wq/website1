'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import { LOCALES, LOCALE_ORDER, t } from '@/lib/i18n';
import { PAGE_TEMPLATES } from '@/data/templates';

/* =============================================================================
 * 페이지 패널 — 이 페이지에 관한 설정을 한자리에
 *   제목·주소 / 템플릿 / SEO 메타 / 노출 언어
 * 검색 결과 미리보기를 함께 보여줘 길이 감각을 잡을 수 있게 한다.
 *
 * 템플릿 적용은 상단 바에 있었다. 페이지 하나를 통째로 갈아끼우는 일이라
 * 자주 쓰지 않는데, 늘 보이는 자리를 차지하면서 정작 '이 페이지 설정'인
 * 제목·주소와는 떨어져 있었다.
 * ========================================================================== */

export function SeoPanel() {
  const page = useEditorStore((s) => s.activePage());
  const locale = useEditorStore((s) => s.editingLocale);
  const updateSeoText = useEditorStore((s) => s.updateSeoText);
  const updateSeo = useEditorStore((s) => s.updateSeo);
  const updatePageMeta = useEditorStore((s) => s.updatePageMeta);
  const applyTemplate = useEditorStore((s) => s.applyTemplate);

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

      <Field label="주소 (URL 경로)">
        <input
          value={page.path}
          onChange={(e) => updatePageMeta(page.id, { path: e.target.value })}
          style={{ ...input, fontFamily: 'monospace' }}
        />
      </Field>

      {/* 현재 페이지를 다른 템플릿으로 갈아끼운다 — 내용이 통째로 교체되므로 확인을 받는다 */}
      <Field label="템플릿 적용" hint="내용이 교체됩니다">
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            e.target.value = '';
            if (!id) return;
            const tpl = PAGE_TEMPLATES.find((x) => x.id === id);
            if (!tpl) return;
            if (!window.confirm(`'${tpl.name}' 템플릿으로 교체합니다. 현재 페이지 내용은 사라집니다. 계속할까요?`)) return;
            applyTemplate(page.id, id);
          }}
          style={input}
        >
          <option value="">고르면 바로 적용됩니다…</option>
          {PAGE_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
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
                  border: `1px solid ${on ? 'var(--puck-color-azure-05, #3b82f6)' : 'var(--puck-color-grey-09, #e5e7eb)'}`,
                  background: on ? 'var(--puck-color-azure-11, #eff6ff)' : 'transparent',
                  color: on ? 'var(--puck-color-azure-04, #1d4ed8)' : 'var(--puck-color-grey-05, #6b7280)',
                  fontWeight: on ? 700 : 400,
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

/* 이 패널은 Puck 의 흰 사이드바 안에서 그려진다. 에디터 껍데기(어두운 배경)의
   --ks-* 색을 쓰면 흰 바탕에 흰 글씨가 되어 아무것도 안 보인다 —
   실제로 노출 언어 칩은 국기만 보이고 글자는 사라져 있었다. */
const input: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  borderRadius: 6,
  border: '1px solid var(--puck-color-grey-09, #d4d8e0)',
  background: 'var(--puck-color-white, #fff)',
  color: 'var(--puck-color-black, #111827)',
  fontSize: 12,
  fontFamily: 'inherit',
};
