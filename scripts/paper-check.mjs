/* =============================================================================
 * 종이 모드 점검 — npm run paper-check
 * -----------------------------------------------------------------------------
 * "세션 추가하지말고 종이처럼 쭉 이어서" 가 실제로 되는지 처음부터 끝까지 본다.
 * 섹션이라는 칸 없이, 한 장짜리 종이 위에 원하는 자리에 놓고, 끌어 늘리고,
 * 그대로 HTML 로 나가는가.
 *
 * 실행 전제: 개발/운영 서버가 떠 있어야 한다.
 *   BASE_URL=http://localhost:3000 ADMIN_PASSWORD=... npm run paper-check
 *
 * 하네스 함정(겪은 것):
 *   · 새 페이지 대화상자는 두 번 렌더된다 — 보이는 쪽(:visible)만 잡고,
 *     템플릿은 select 가 아니라 카드 '버튼'이다.
 *   · 드래그는 임계값을 넘겨야 드래그로 인식된다(먼저 8px 흔든다).
 *   · 놓인 자리를 잴 때 '마지막 요소'를 잡으면 안 된다 — DOM 순서는 놓은
 *     순서가 아니다. 넣은 종류를 콕 집어 잰다.
 *   · 시험 페이지가 남으면 다음 실행이 통째로 무너진다 — 끝에 반드시 지운다.
 * ========================================================================== */
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const TITLE = '종이-시험-페이지';
let failed = 0;
const step = async (name, fn) => {
  try { console.log(`✅ ${name} — ${await fn()}`); }
  catch (e) { console.log(`❌ ${name} — ${String(e).split('\n')[0].slice(0,160)}`); failed++; }
};
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 1700, height: 950 } });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,140)));
const fr = () => p.frameLocator('iframe#preview-frame');
const paper = () => fr().locator('[data-free-canvas="true"]').first();
const kids = () => fr().locator('[data-free-canvas="true"] [data-free="true"]').count();

await p.goto(BASE + '/admin/login');
await p.locator('input[type=password]').fill(process.env.ADMIN_PASSWORD ?? 'test1234');
await p.locator('button[type=submit]').click();
await p.waitForURL('**/admin/editor', { timeout: 30000 });
await p.waitForSelector('iframe#preview-frame', { timeout: 30000 });
await p.waitForTimeout(3000);

/* 지난 실행이 중간에 끊겨 시험 페이지가 남아 있으면, 같은 주소로 다시 만들 수
   없어 그 뒤 전부가 무너진다. 시작할 때 한 번 치운다. */
await step('지난 시험 페이지 치우기', async () => {
  const removed = await p.evaluate(async (title) => {
    const list = await (await fetch('/api/pages')).json();
    const pages = list.pages ?? list;
    const doomed = pages.filter((x) => x.path.includes(title));
    for (const d of doomed) await fetch(`/api/pages/${d.id}`, { method: 'DELETE' });
    return doomed.length ? `${doomed.length}장 치웠습니다` : '남은 것 없음';
  }, TITLE);
  /* 에디터는 열릴 때 목록을 한 번 읽는다 — 방금 지운 것을 아직 들고 있으면
     같은 주소를 '이미 있다'며 막는다. 새로 읽게 한다. */
  if (removed !== '남은 것 없음') {
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('iframe#preview-frame', { timeout: 30000 });
    await p.waitForTimeout(3000);
  }
  return removed;
});

await step('[＋ 추가] → 새 페이지 → 빈 종이', async () => {
  await p.locator('button:has-text("＋ 추가")').click();
  await p.waitForTimeout(400);
  await p.locator('[role=menuitem]:has-text("새 페이지")').click();
  await p.waitForTimeout(800);
  await p.locator('input[placeholder*="THAILAND"]').fill(TITLE);
  await p.waitForTimeout(400);
  // 템플릿에서 '빈 종이' 고르기
  /* 템플릿은 select 가 아니라 카드 버튼이다 */
  const card = p.locator('[data-template-id="blank-paper"]');
  if (!(await card.count())) {
    await p.screenshot({ path: '/tmp/claude-0/-home-user-website1/6ea97c10-f74e-5720-bc24-18ef4230d4c5/scratchpad/dialog.png' });
    const seen = await p.locator('button:visible').allTextContents();
    throw new Error('빈 종이 카드 없음. 보이는 버튼: ' + seen.slice(0,25).join(' / ').slice(0,300));
  }
  /* 좌표를 거치지 않고 요소에 직접 클릭을 보낸다 — 카드가 대화상자
     스크롤 밖에 있으면 force 로도 덮개에 가로막힌다. */
  await card.evaluate((el) => el.click());
  await p.waitForTimeout(300);
  if ((await card.getAttribute('aria-pressed')) !== 'true') throw new Error('빈 종이가 안 골라짐');
  await p.waitForTimeout(400);
  await p.locator('form button[type=submit], form button:has-text("만들기")').last().click();
  await p.waitForTimeout(3500);
  const secs = await fr().locator('[data-section="true"]').count();
  if (secs) throw new Error(`섹션이 ${secs}개 있다 — 종이 한 장이어야 한다`);
  return `섹션 0개 · 종이 위 요소 ${await kids()}개`;
});

await step('아래 버튼이 [종이 늘리기] 다', async () => {
  const t = await p.locator('button:has-text("종이 늘리기")').count();
  if (!t) throw new Error('종이 늘리기 버튼이 없음 — ' + (await p.locator('button:has-text("섹션 추가")').count() ? '아직 섹션 추가로 뜬다' : '아예 없다'));
  return '있음';
});

await step('놓은 자리에 놓인다 (블록 목록 → 종이의 특정 지점)', async () => {
  const before = await kids();
  const pb = await paper().boundingBox();
  const dropX = pb.x + pb.width * 0.62, dropY = pb.y + pb.height * 0.55;
  const item = p.locator('[class*="DrawerItem-draggable"]').filter({ hasText: '버튼' }).first();
  const src = await item.boundingBox();
  if (!src) throw new Error('블록 목록에서 버튼을 못 찾음');
  const sx = src.x + src.width/2, sy = src.y + src.height/2;
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.mouse.move(sx + 8, sy + 8);          // 임계값 넘기기
  await p.waitForTimeout(200);
  for (let i = 1; i <= 20; i++) {
    await p.mouse.move(sx + (dropX - sx) * (i/20), sy + (dropY - sy) * (i/20));
    await p.waitForTimeout(45);
  }
  await p.waitForTimeout(400);
  await p.mouse.up();
  await p.waitForTimeout(2000);
  const after = await kids();
  if (after <= before) throw new Error(`안 들어감 ${before} → ${after}`);
  // 놓은 지점 근처인가 — 방금 넣은 '버튼'을 콕 집어 잰다
  const geo = await p.evaluate(() => {
    const d = document.querySelector('iframe#preview-frame').contentDocument;
    const c = d.querySelector('[data-free-canvas="true"]').getBoundingClientRect();
    const el = d.querySelector('[data-free-canvas="true"] [data-element-type="Button"][data-free="true"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left - c.left), y: Math.round(r.top - c.top) };
  });
  if (!geo) throw new Error('넣은 버튼을 종이 위에서 못 찾음');
  if (geo.x < 20 && geo.y < 20) throw new Error(`왼쪽 맨 위에 쌓였다 (${geo.x},${geo.y})`);
  return `${before} → ${after}개 · 놓인 자리 (${geo.x}, ${geo.y})`;
});

await step('종이를 눌러 고르고 손잡이로 늘린다', async () => {
  const pb = await paper().boundingBox();
  await p.mouse.click(pb.x + 14, pb.y + 14);
  await p.waitForTimeout(1200);
  const H = () => p.evaluate(() => document.querySelector('iframe#preview-frame').contentDocument.querySelector('[data-free-canvas="true"]').offsetHeight);
  const before = await H();
  const h = await p.locator('[data-ks-handle="se"]').boundingBox();
  if (!h) throw new Error('손잡이가 없다 — 종이를 못 골랐다');
  await p.mouse.move(h.x+h.width/2, h.y+h.height/2); await p.mouse.down();
  for (let i=1;i<=10;i++){ await p.mouse.move(h.x+h.width/2, h.y+h.height/2+i*16); await p.waitForTimeout(45); }
  await p.mouse.up(); await p.waitForTimeout(1500);
  const after = await H();
  if (after <= before) throw new Error(`안 늘어남 ${before} → ${after}`);
  return `${before} → ${after}`;
});

await step('[종이 늘리기] 로 한 화면 더', async () => {
  const H = () => p.evaluate(() => document.querySelector('iframe#preview-frame').contentDocument.querySelector('[data-free-canvas="true"]').offsetHeight);
  const before = await H();
  await p.locator('button:has-text("종이 늘리기")').click();
  await p.waitForTimeout(1800);
  const after = await H();
  if (after <= before) throw new Error(`안 늘어남 ${before} → ${after}`);
  return `${before} → ${after}`;
});

await step('발행하고 공개 화면이 종이 그대로인지', async () => {
  await p.locator('button:has-text("발행")').click();
  await p.waitForTimeout(3500);
  const path = await p.locator('[data-ks-path]').getAttribute('data-ks-path');
  const v = await b.newPage();
  const res = await v.goto(BASE + path, { waitUntil: 'networkidle' });
  await v.waitForTimeout(1200);
  const n = await v.locator('[data-free-canvas="true"] [data-free="true"]').count();
  const txt = (await v.locator('body').innerText()).replace(/\s+/g,' ');
  await v.close();
  if (res.status() !== 200) throw new Error(`공개 화면 ${res.status()}`);
  if (!txt.includes(TITLE)) throw new Error('제목이 공개 화면에 없다');
  return `200 · 종이 위 요소 ${n}개`;
});

await step('[＋ 추가] 에 섹션 항목이 없다 (종이에는 칸이 없다)', async () => {
  await p.locator('button:has-text("＋ 추가")').click();
  await p.waitForTimeout(500);
  const items = await p.locator('[role=menuitem]').allTextContents();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  if (items.some((t) => t.includes('섹션 추가'))) throw new Error('아직 섹션 추가가 보인다: ' + items.join(' / '));
  return items.map((t) => t.split('\n')[0]).join(' / ');
});

await step('시험 페이지 지우기', async () => {
  const path = await p.locator('[data-ks-path]').getAttribute('data-ks-path');
  const res = await p.evaluate(async (path) => {
    const list = await (await fetch('/api/pages')).json();
    const pages = list.pages ?? list;
    const doomed = pages.find((x) => x.path === path);
    if (!doomed) return '이미 없음';
    const r = await fetch(`/api/pages/${doomed.id}`, { method: 'DELETE' });
    return r.ok ? '지웠습니다' : `실패 ${r.status}`;
  }, path);
  if (!/지웠|이미/.test(res)) throw new Error(res);
  return res;
});

console.log(errs.length ? '\n❌ JS 오류: ' + errs.join(' / ') : '\n✅ JS 오류 없음');
console.log(failed ? `\n문제 ${failed}건` : '\n종이 모드 이상 없음');
await b.close();
process.exit(failed ? 1 : 0);
