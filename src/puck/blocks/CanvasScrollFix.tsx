'use client';

import React from 'react';
import { useRenderCtx } from './shared';

/* =============================================================================
 * 에디터 캔버스 세로 스크롤
 * -----------------------------------------------------------------------------
 * Puck 은 캔버스 iframe 의 높이를 자기 래퍼를 재서 정하는데, 그 래퍼는 프레임
 * 높이에 맞춰져 있다(min-height: <프레임 높이>). 서로를 참조하는 구조라 섹션을
 * 추가해 내용이 길어져도 프레임이 자라지 않고, 넘친 부분은 프레임의
 * overflow:clip 에 잘려 스크롤로도 닿을 수 없다.
 *
 * 프레임을 늘리는 대신 iframe 내부에서 스크롤되게 한다. 편집 중일 때만
 * 주입하므로 실제 사이트의 스크롤 동작에는 영향이 없다.
 * ========================================================================== */

/*
 * 스크롤러는 반드시 html(문서 스크롤 요소)이어야 한다.
 * body 에 height:100% + overflow:auto 를 주면 body 자신이 스크롤 컨테이너가
 * 되는데, 브라우저는 iframe 위에서 굴린 휠을 문서 스크롤 요소(html)에만
 * 전달한다. html 은 넘칠 것이 없으니 아무 일도 일어나지 않고, 1542px 아래의
 * 섹션에는 어떤 방법으로도 닿을 수 없었다.
 */
const CSS = `
  html { height: 100%; overflow-y: auto; overflow-x: hidden; }
  body { min-height: 100%; height: auto !important; overflow: visible !important; }
  /* Puck 래퍼가 프레임 높이에 갇혀 있어도 내용이 온전히 흐르도록 */
  body > div { min-height: 100%; height: auto !important; }
`;

/** 이 폭 아래에서는 실제 사이트가 자유 배치를 세로 스택으로 푼다 (globals.css) */
const MOBILE_MAX = 767;

export function CanvasScrollFix() {
  const { isEditing } = useRenderCtx();
  const styleRef = React.useRef<HTMLStyleElement>(null);

  /* 미리보기 폭을 휴대폰으로 바꾸면 캔버스도 실제 사이트처럼 보여야 한다.
     규칙은 globals.css 에 [data-ks-site] 로 한 벌만 두고, 여기서는 캔버스
     문서에 같은 표시를 붙였다 뗐다 한다 — CSS 를 복사해 두면 한쪽만 고치는
     날이 온다.

     document/window 를 그대로 쓰면 안 된다: Puck 은 iframe 안의 화면을
     부모 문서의 React 트리에서 포털로 그리므로, 여기서의 window 는 부모
     창이다. 실제 캔버스 문서는 우리가 심은 <style> 의 ownerDocument 다. */
  React.useEffect(() => {
    const doc = styleRef.current?.ownerDocument;
    const win = doc?.defaultView;
    if (!isEditing || !doc || !win) return;

    const sync = () => {
      if (win.innerWidth <= MOBILE_MAX) doc.documentElement.setAttribute('data-ks-site', 'preview');
      else doc.documentElement.removeAttribute('data-ks-site');
    };
    sync();
    win.addEventListener('resize', sync);
    /* 뷰포트 전환은 iframe 요소의 크기를 바꾸는 것이라 resize 가 늦거나
       누락될 수 있다 — 크기 변화를 직접 관찰한다. */
    const observer = new ResizeObserver(sync);
    if (doc.documentElement) observer.observe(doc.documentElement);

    return () => {
      win.removeEventListener('resize', sync);
      observer.disconnect();
      doc.documentElement.removeAttribute('data-ks-site');
    };
  }, [isEditing]);

  if (!isEditing) return null;
  return <style ref={styleRef} dangerouslySetInnerHTML={{ __html: CSS }} />;
}
