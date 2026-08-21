'use client';

import React from 'react';
import Link from 'next/link';
import { NAVIGATION, SITE_CONFIG } from '@/data/navigation';
import { t } from '@/lib/i18n';
import { LanguageSwitcher } from './LanguageSwitcher';
import type { LocaleCode, NavNode } from '@/types/schema';

/* =============================================================================
 * 글로벌 네비게이션
 * data/navigation.ts 의 IA 트리를 그대로 메가메뉴로 매핑한다.
 * 메뉴 항목도 data-element-id 를 갖기 때문에 "어떤 메뉴를 많이 누르는가"가
 * 히트맵에 그대로 집계된다.
 * ========================================================================== */

export interface SiteNavProps {
  locale: LocaleCode;
  activePath?: string;
  onLocaleChange: (next: LocaleCode) => void;
}

export function SiteNav({ locale, activePath, onLocaleChange }: SiteNavProps) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const label = (node: NavNode) => (node.i18n ? t(node.i18n, locale) || node.label : node.label);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        background: 'rgba(13,15,20,.88)',
        backdropFilter: 'blur(12px)',
        color: '#e6ebf5',
        borderBottom: '1px solid rgba(255,255,255,.08)',
      }}
      onMouseLeave={() => setOpenId(null)}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <Link
          href="/"
          data-element-id="nav-logo"
          data-element-type="Button"
          data-element-name="로고"
          style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.4, color: 'inherit', textDecoration: 'none' }}
        >
          {SITE_CONFIG.title}
        </Link>

        {/* --- 데스크톱 메뉴 --- */}
        <nav style={{ display: 'flex', gap: 4, marginLeft: 8, flex: 1 }} className="ksoho-desktop-nav">
          {NAVIGATION.filter((n) => n.visible !== false).map((node) => {
            const isActive = activePath?.startsWith(node.path ?? '###');
            return (
              <div key={node.id} style={{ position: 'relative' }} onMouseEnter={() => setOpenId(node.id)}>
                <Link
                  href={node.path ?? '#'}
                  data-element-id={`nav-${node.id}`}
                  data-element-type="Button"
                  data-element-name={`메뉴: ${node.label}`}
                  style={{
                    display: 'block',
                    padding: '20px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    color: isActive ? '#fff' : 'rgba(230,235,245,.75)',
                    textDecoration: 'none',
                    borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  }}
                >
                  {label(node)}
                </Link>

                {/* --- 서브 카테고리 --- */}
                {openId === node.id && node.children?.length ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      minWidth: 200,
                      background: '#151922',
                      borderRadius: 10,
                      padding: 8,
                      boxShadow: '0 16px 40px rgba(0,0,0,.45)',
                      border: '1px solid rgba(255,255,255,.08)',
                    }}
                  >
                    {node.children.map((child) => (
                      <Link
                        key={child.id}
                        href={child.path ?? '#'}
                        data-element-id={`nav-${child.id}`}
                        data-element-type="Button"
                        data-element-name={`서브메뉴: ${child.label}`}
                        style={{
                          display: 'block',
                          padding: '9px 12px',
                          borderRadius: 6,
                          fontSize: 13,
                          color: activePath === child.path ? '#fff' : 'rgba(230,235,245,.8)',
                          background: activePath === child.path ? 'rgba(59,130,246,.18)' : 'transparent',
                          textDecoration: 'none',
                        }}
                      >
                        {label(child)}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <LanguageSwitcher locale={locale} onChange={onLocaleChange} compact />

        <button
          type="button"
          className="ksoho-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="메뉴 열기"
          data-no-track="true"
          style={{ display: 'none', background: 'none', border: 0, color: 'inherit', fontSize: 20, cursor: 'pointer' }}
        >
          ☰
        </button>
      </div>

      {/* --- 모바일 메뉴 --- */}
      {mobileOpen ? (
        <div style={{ padding: '8px 24px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          {NAVIGATION.map((node) => (
            <details key={node.id} style={{ padding: '6px 0' }}>
              <summary style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: '6px 0' }}>{label(node)}</summary>
              {node.children?.map((child) => (
                <Link
                  key={child.id}
                  href={child.path ?? '#'}
                  data-element-id={`nav-m-${child.id}`}
                  data-element-type="Button"
                  onClick={() => setMobileOpen(false)}
                  style={{ display: 'block', padding: '8px 12px', fontSize: 13, color: 'rgba(230,235,245,.8)', textDecoration: 'none' }}
                >
                  {label(child)}
                </Link>
              ))}
            </details>
          ))}
        </div>
      ) : null}

      <style>{`
        @media (max-width: 1024px) {
          .ksoho-desktop-nav { display: none !important; }
          .ksoho-mobile-toggle { display: block !important; }
        }
      `}</style>
    </header>
  );
}
