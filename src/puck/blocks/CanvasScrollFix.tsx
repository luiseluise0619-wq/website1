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

const CSS = `
  html, body { height: 100%; overflow-y: auto; overflow-x: hidden; }
  /* Puck 래퍼가 프레임 높이에 갇혀 있어도 내용이 온전히 흐르도록 */
  body > div { min-height: 100%; height: auto !important; }
`;

export function CanvasScrollFix() {
  const { isEditing } = useRenderCtx();
  if (!isEditing) return null;
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
