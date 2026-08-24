#!/usr/bin/env node
/* =============================================================================
 * 캔버스 안정성 점검 — "편집하면 화면이 새로고침되고 스크롤이 맨 위로 튄다"
 *
 *   npm run build && npm start                       (다른 터미널)
 *   ADMIN_PASSWORD=... npm run canvas-check          (기본 http://localhost:3000)
 *
 * 이 회귀는 유닛 테스트로 잡히지 않는다. React 가 '컴포넌트 동일성'이 바뀐
 * 자리를 갱신이 아니라 언마운트→마운트로 처리하면서 생기는 일이라, 실제
 * 브라우저에서 캔버스 iframe 문서가 헐렸다 다시 서는지를 봐야 드러난다.
 * (원인이었던 코드: Puck 의 overrides 를 JSX 안 객체 리터럴로 만들던 것)
 *
 * 판정: 편집·드래그·탭 전환에 캔버스 문서가 다시 마운트되거나 스크롤이
 * 0 으로 돌아가면 실패. 종료 코드 1 — CI 에 그대로 걸 수 있다.
 * ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};
const bail = async (message) => {
  console.log(`❌ ${message}`);
  await browser.close();
  process.exit(1);
};

/* ---- 준비 ---------------------------------------------------------------- */

await page.goto(`${BASE}/admin/editor`, { waitUntil: 'networkidle' });
if (await page.locator('input[type=password]').count()) {
  if (!PASSWORD) await bail('로그인 화면이 떴는데 ADMIN_PASSWORD 가 없습니다.');
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForTimeout(3500);
}
await page.waitForSelector('iframe#preview-frame', { timeout: 30000 });
/* 부모 문서의 스타일을 iframe 으로 복사하는 과정이 끝나야 높이가 안정된다.
   그 전에 재면 아직 짧은 문서를 보고 "스크롤이 안 내려간다"고 오판한다. */
await page.waitForTimeout(6000);

/** 캔버스 문서가 헐리는지 감시한다 — frame-root 는 Puck 이 포털로 그리는 지점 */
await page.evaluate(() => {
  const doc = document.querySelector('iframe#preview-frame').contentDocument;
  window.__events = [];
  const record = (msg) => window.__events.push(msg);

  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.removedNodes) if (n.id === 'frame-root') record('캔버스 루트가 제거됨');
      for (const n of m.addedNodes) if (n.id === 'frame-root') record('캔버스 루트가 다시 생김');
    }
  }).observe(doc.body, { childList: true });

  new MutationObserver((muts) => {
    let removed = 0;
    for (const m of muts) removed += m.removedNodes.length;
    if (removed) record(`캔버스 내용이 통째로 지워짐 (자식 ${removed}개 제거)`);
  }).observe(doc.getElementById('frame-root'), { childList: true });

  let last = doc.scrollingElement.scrollTop;
  doc.addEventListener('scroll', () => {
    const now = doc.scrollingElement.scrollTop;
    if (now === 0 && last > 0) record(`스크롤이 ${last} → 0 으로 튐`);
    last = now;
  }, true);
});

const canvasEval = (fn, arg) =>
  page.evaluate(
    ({ src, arg }) =>
      // eslint-disable-next-line no-new-func
      new Function('doc', 'arg', `return (${src})(doc, arg)`)(
        document.querySelector('iframe#preview-frame').contentDocument,
        arg,
      ),
    { src: fn.toString(), arg },
  );

const scrollTop = () => canvasEval((doc) => doc.scrollingElement.scrollTop);
const scrollRoom = () =>
  canvasEval((doc) => doc.scrollingElement.scrollHeight - doc.scrollingElement.clientHeight);
const drainEvents = () =>
  page.evaluate(() => {
    const e = window.__events;
    window.__events = [];
    return e;
  });

/**
 * 캔버스를 아래로 내려 두고 감시 기록을 비운다.
 * 스크롤할 여지가 없으면 이 점검은 아무것도 증명하지 못하므로 그대로 멈춘다
 * (조용히 통과시키면 회귀가 들어와도 초록불이 뜬다).
 */
const parkBelow = async (what) => {
  const room = await scrollRoom();
  if (room < 100) await bail(`캔버스에 스크롤 여지가 없어 '${what}'를 측정할 수 없습니다 (여유 ${room}px).`);
  const target = Math.min(400, Math.floor(room / 2));
  await canvasEval((doc, v) => {
    doc.scrollingElement.scrollTop = v;
  }, target);
  await page.waitForTimeout(400);
  const parked = await scrollTop();
  if (parked !== target) await bail(`캔버스를 ${target}px 로 내리지 못했습니다 (현재 ${parked}).`);
  await drainEvents();
  return target;
};

/* ---- 1) 요소 선택 --------------------------------------------------------- */

const canvas = page.frameLocator('iframe#preview-frame');
const components = canvas.locator('[data-puck-component]');
const count = await components.count();
if (!count) await bail('캔버스에 요소가 없습니다 — 발행된 페이지가 있는지 확인하세요.');

await components.nth(Math.min(count - 1, 6)).click({ force: true });
await page.waitForTimeout(1200);
await drainEvents();

/* ---- 2) 값 편집 ----------------------------------------------------------- */

const fields = page.locator('form input[type=text]:visible, form textarea:visible');
if (!(await fields.count())) await bail('우측 인스펙터에 편집할 필드가 없습니다.');

let target = await parkBelow('값 편집');
await fields.first().click({ force: true });
for (const ch of 'abcd') {
  await page.keyboard.type(ch);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(800);
let events = await drainEvents();
let now = await scrollTop();
check('편집해도 캔버스가 다시 서지 않는다', events.length === 0, events.join(' / '));
check(`편집 후에도 스크롤이 유지된다 (${target} 기대)`, now === target, `현재 ${now}`);

/* ---- 3) 요소 드래그 (자유 배치) ------------------------------------------- */

target = await parkBelow('요소 드래그');
const box = await components.nth(Math.min(count - 1, 6)).boundingBox();
const frameBox = await page.locator('iframe#preview-frame').boundingBox();
if (box && frameBox) {
  const x = frameBox.x + box.x + box.width / 2;
  const y = frameBox.y + box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + i * 5, y + i * 3);
    await page.waitForTimeout(35);
  }
  await page.mouse.up();
  await page.waitForTimeout(900);
  events = await drainEvents();
  now = await scrollTop();
  check('드래그 중에도 캔버스가 다시 서지 않는다', events.length === 0, events.join(' / '));
  check(`드래그 후에도 스크롤이 유지된다 (${target} 기대)`, now === target, `현재 ${now}`);
} else {
  check('드래그를 측정할 수 있다', false, '요소 위치를 잡지 못했습니다');
}

/* ---- 4) 우측 패널 탭 전환 ------------------------------------------------- */

target = await parkBelow('탭 전환');
for (const label of ['SEO', '스타일']) {
  await page.locator(`form button:has-text("${label}")`).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(700);
}
events = await drainEvents();
now = await scrollTop();
check('탭을 옮겨도 캔버스가 다시 서지 않는다', events.length === 0, events.join(' / '));
check(`탭 전환 후에도 스크롤이 유지된다 (${target} 기대)`, now === target, `현재 ${now}`);

await browser.close();
console.log(failed ? `\n캔버스 안정성 문제 ${failed}건` : '\n캔버스 안정성 이상 없음');
process.exit(failed ? 1 : 0);
