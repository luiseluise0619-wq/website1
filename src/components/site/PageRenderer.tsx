'use client';

import React from 'react';
import { Render } from '@puckeditor/core';
import { puckConfig } from '@/puck/config';
import { RenderCtx } from '@/puck/blocks/shared';
import { SiteNav } from './SiteNav';
import { useCanvasAnalytics } from '@/hooks/useCanvasAnalytics';
import { DEFAULT_LOCALE, LOCALES, detectClientLocale, persistLocale, t } from '@/lib/i18n';
import type { Data } from '@puckeditor/core';
import type { LocaleCode, PageDocument } from '@/types/schema';

/* =============================================================================
 * JSON → Canvas Renderer (방문자 화면)
 * -----------------------------------------------------------------------------
 * 이 컴포넌트가 세 가지를 동시에 성립시킨다:
 *   1) 저장된 JSON 을 Puck 의 <Render> 로 복원 (에디터와 동일한 블록 코드)
 *   2) RenderCtx 로 로케일을 주입 → 텍스트가 방문자 언어로 해석됨
 *   3) useCanvasAnalytics 로 클릭/스크롤/이탈 추적을 활성화
 * ========================================================================== */

export interface PageRendererProps {
  page: PageDocument;
  /** 서버에서 감지한 초기 로케일 (Accept-Language / 쿠키) */
  initialLocale?: LocaleCode;
  /** 네비게이션 표시 여부 — 에디터 프리뷰에서는 끈다 */
  chrome?: boolean;
  analytics?: boolean;
}

export function PageRenderer({ page, initialLocale, chrome = true, analytics = true }: PageRendererProps) {
  const [locale, setLocale] = React.useState<LocaleCode>(initialLocale ?? DEFAULT_LOCALE);
  const rootRef = React.useRef<HTMLDivElement>(null);

  /* 서버가 로케일을 못 정했을 때만 클라이언트에서 감지한다.
     (서버에서 정한 값을 덮어쓰면 하이드레이션 불일치가 난다) */
  React.useEffect(() => {
    if (initialLocale) return;
    const detected = detectClientLocale(page.enabledLocales);
    if (detected !== locale) {
      setLocale(detected);
      tracker.trackLocaleChange(locale, detected, 'auto');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tracker = useCanvasAnalytics({
    pageId: page.id,
    path: page.path,
    locale,
    title: t(page.seo.title, locale, page.sourceLocale),
    enabled: analytics,
    rootRef,
  });

  const handleLocaleChange = (next: LocaleCode) => {
    tracker.trackLocaleChange(locale, next, 'switcher');
    persistLocale(next);
    setLocale(next);
  };

  /* <html lang> 은 렌더 이후에 동기화한다. 핸들러 안에서 직접 쓰면
     이어지는 리렌더가 레이아웃의 초기값으로 되돌려 버린다. */
  React.useEffect(() => {
    document.documentElement.lang = LOCALES[locale].bcp47;
  }, [locale]);

  const ctx = React.useMemo(
    () => ({ locale, siteDefault: page.sourceLocale ?? DEFAULT_LOCALE, isEditing: false }),
    [locale, page.sourceLocale],
  );

  return (
    <RenderCtx.Provider value={ctx}>
      {chrome ? <SiteNav locale={locale} activePath={page.path} onLocaleChange={handleLocaleChange} /> : null}
      <main ref={rootRef} data-page-id={page.id} data-locale={locale}>
        <Render config={puckConfig} data={page.content as unknown as Data} />
      </main>
    </RenderCtx.Provider>
  );
}
