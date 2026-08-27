/* =============================================================================
 * 편집 기본기 재확인 — npm run editor-check
 * -----------------------------------------------------------------------------
 * 기능 하나하나가 아니라 '편집기라면 당연히 이래야 하는 것'을 본다. 여기 있는
 * 항목은 전부 실제로 한 번씩 어긋났던 것들이다:
 *   · 열기만 했는데 '저장 *' 이 뜨면, 닫을 때마다 경고가 떠서 진짜 편집과
 *     구별이 안 된다 (Puck 이 마운트 직후 부르는 onChange 를 편집으로 셌다)
 *   · 열기만 했는데 저장된 좌표가 바뀌면, 남의 페이지가 열어 본 것만으로 상한다
 *   · 끌어다 놓고 Ctrl+Z 한 번에 안 사라지면, 자리 지정이 되돌리기를 한 칸
 *     잡아먹은 것이다
 *   · 종이 페이지에 HTML 을 가져와 섹션이 생기면, 없앤 칸 개념이 되살아난다
 *
 * 실행 전제: 서버가 떠 있어야 한다.
 *   BASE_URL=http://localhost:3000 ADMIN_PASSWORD=... npm run editor-check
 *
 * 하네스 함정(겪은 것):
 *   · 새로고침하면 에디터는 목록의 첫 페이지로 돌아간다. 방금 만든 페이지를
 *     보고 있다고 믿으면 그 뒤 검사가 통째로 엉뚱한 페이지를 잰다 —
 *     실제로 그래서 없는 버그를 하나 쫓았다. 경로를 확인하고 넘어간다.
 *   · 대화상자의 [가져오기] 는 정확히 그 글자로 잡는다. 느슨하게 잡으면
 *     상단 바의 [＋ 추가]·[HTML 가져오기] 가 걸린다.
 * ========================================================================== */
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
let bad=0;
const check=(ok,name,detail='')=>{ console.log(`${ok?'✅':'❌'} ${name}${detail?' — '+detail:''}`); if(!ok) bad++; };
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
const p=await b.newPage({viewport:{width:1700,height:950}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
const fr=()=>p.frameLocator('iframe#preview-frame');
const openEditor=async()=>{ await p.waitForSelector('iframe#preview-frame',{timeout:30000}); await p.waitForTimeout(3200); };

await p.goto(BASE+'/admin/login');
await p.locator('input[type=password]').fill(process.env.ADMIN_PASSWORD ?? 'test1234');
await p.locator('button[type=submit]').click();
await p.waitForURL('**/admin/editor',{timeout:30000});
await openEditor();

const dirty = async () => (await p.locator('button:has-text("저장")').innerText()).includes('*');

/* ── 1) 열자마자 '저장 *' 인가 (아무것도 안 건드렸는데 바뀐 것) ─────────── */
check(!(await dirty()), '섹션 페이지를 열기만 했는데 편집됨 표시가 뜨지 않는다',
  await p.locator('button:has-text("저장")').innerText());

/* ── 2) 종이 페이지를 만들고, 다시 열었을 때도 조용한가 ────────────────── */
await p.evaluate(async () => {
  const l = await (await fetch('/api/pages')).json();
  for (const x of (l.pages ?? l).filter(x => x.path.includes('재확인'))) await fetch(`/api/pages/${x.id}`,{method:'DELETE'});
});
await p.reload({waitUntil:'networkidle'}); await openEditor();

await p.locator('button:has-text("＋ 추가")').click(); await p.waitForTimeout(400);
await p.locator('[role=menuitem]:has-text("새 페이지")').click(); await p.waitForTimeout(800);
await p.locator('input[placeholder*="THAILAND"]').fill('재확인-종이');
await p.locator('[data-template-id="blank-paper"]').evaluate(el=>el.click());
await p.waitForTimeout(300);
await p.locator('form button[type=submit], form button:has-text("만들기")').last().click();
await p.waitForTimeout(3500);
await p.locator('button:has-text("발행")').click(); await p.waitForTimeout(3000);

const paperPath = await p.locator('[data-ks-path]').getAttribute('data-ks-path');
/* 저장된 좌표를 기록해 둔다 */
const before = await p.evaluate(async (path) => {
  const l = await (await fetch('/api/pages')).json();
  const pg = (l.pages ?? l).find(x => x.path === path);
  const z = Object.entries(pg.content.zones).find(([k])=>k.endsWith(':layers'));
  return z[1].map(i => JSON.stringify(i.props.placement));
}, paperPath);

/* 마우스를 캔버스 한가운데 두고 새로고침 — 열기만 해도 좌표가 바뀌는가 */
await p.mouse.move(950, 500);
await p.reload({waitUntil:'networkidle'}); await openEditor();
/* 새로고침하면 에디터는 목록의 첫 페이지(홈)로 돌아간다 — 종이 페이지를
   보고 있다고 착각하면 그 뒤 검사가 통째로 엉뚱한 페이지를 잰다. */
/* 좌측 목록은 IA 로 묶여 있어 새 페이지가 바로 안 보인다 — 검색으로 찾는다 */
await p.locator('aside input[placeholder*="검색"]').fill('재확인');
await p.waitForTimeout(1200);
await p.locator('aside button').filter({ hasText: '재확인' }).first().click();
await p.waitForTimeout(2500);
{
  const now = await p.locator('[data-ks-path]').getAttribute('data-ks-path');
  if (now !== paperPath) throw new Error(`종이 페이지로 못 돌아옴: ${now} (기대 ${paperPath})`);
}
await p.mouse.move(950, 500); await p.waitForTimeout(2000);

check(!(await dirty()), '종이 페이지를 열기만 했는데 편집됨 표시가 뜨지 않는다',
  await p.locator('button:has-text("저장")').innerText());

const after = await p.evaluate(async (path) => {
  const l = await (await fetch('/api/pages')).json();
  const pg = (l.pages ?? l).find(x => x.path === path);
  const z = Object.entries(pg.content.zones).find(([k])=>k.endsWith(':layers'));
  return z[1].map(i => JSON.stringify(i.props.placement));
}, paperPath);
check(JSON.stringify(before)===JSON.stringify(after), '열기만 해서는 저장된 좌표가 안 바뀐다',
  `${before.join(' ')} → ${after.join(' ')}`);

/* ── 3) 끌어다 놓고 Ctrl+Z 한 번이면 그 블록이 사라지는가 ──────────────── */
{
  const n = () => fr().locator('[data-free-canvas="true"] [data-free="true"]').count();
  const start = await n();
  const item = p.locator('[class*="DrawerItem-draggable"]').filter({hasText:'버튼'}).first();
  const s = await item.boundingBox();
  const pb = await fr().locator('[data-free-canvas="true"]').first().boundingBox();
  const tx = pb.x + pb.width*0.5, ty = pb.y + pb.height*0.6;
  await p.mouse.move(s.x+s.width/2, s.y+s.height/2); await p.mouse.down();
  await p.mouse.move(s.x+s.width/2+8, s.y+s.height/2+8); await p.waitForTimeout(200);
  for(let i=1;i<=20;i++){ await p.mouse.move(s.x+(tx-s.x)*(i/20), s.y+(ty-s.y)*(i/20)); await p.waitForTimeout(45); }
  await p.waitForTimeout(400); await p.mouse.up(); await p.waitForTimeout(2500);
  const dropped = await n();
  check(dropped>start, '끌어다 놓으면 늘어난다', `${start} → ${dropped}`);

  await p.keyboard.press('Control+z'); await p.waitForTimeout(1500);
  const undone = await n();
  check(undone===start, 'Ctrl+Z 한 번이면 방금 놓은 것이 사라진다', `${dropped} → ${undone} (기대 ${start})`);
}

/* ── 4) 상단 [되돌리기]/[다시 실행] 버튼이 실제로 동작하는가 ───────────── */
{
  const n = () => fr().locator('[data-free-canvas="true"] [data-free="true"]').count();
  const start = await n();
  const redoBtn = p.locator('button:has-text("다시 실행")');
  const undoBtn = p.locator('button:has-text("되돌리기")');
  if (await redoBtn.isDisabled()) { check(false, '[다시 실행] 버튼이 눌린다', '비활성 상태'); }
  else {
    await redoBtn.click(); await p.waitForTimeout(1500);
    const redone = await n();
    check(redone>start, '[다시 실행] 버튼이 동작한다', `${start} → ${redone}`);
  }
  if (await undoBtn.isDisabled()) { check(false, '[되돌리기] 버튼이 눌린다', '비활성 상태'); }
  else {
    const beforeUndo = await n();
    await undoBtn.click(); await p.waitForTimeout(1500);
    check((await n())<beforeUndo, '[되돌리기] 버튼이 동작한다', `${beforeUndo} → ${await n()}`);
  }
}

/* ── 5) 종이에서 Backspace 로 지우기 ──────────────────────────────────── */
{
  const n = () => fr().locator('[data-free-canvas="true"] [data-free="true"]').count();
  const start = await n();
  const t = await fr().locator('[data-element-type="Text"]').first().boundingBox();
  await p.mouse.click(t.x+t.width/2, t.y+t.height/2); await p.waitForTimeout(1200);
  await p.keyboard.press('Backspace'); await p.waitForTimeout(1500);
  check((await n())<start, '종이 위 요소를 Backspace 로 지운다', `${start} → ${await n()}`);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(1200);
}

/* ── 6) 종이 페이지에서 HTML 가져오기를 하면 종이가 유지되는가 ─────────── */
{
  await p.locator('button:has-text("＋ 추가")').click(); await p.waitForTimeout(400);
  await p.locator('[role=menuitem]:has-text("HTML 가져오기")').click(); await p.waitForTimeout(900);
  const ta = p.locator('textarea:visible').first();
  await ta.fill('<h2>가져온 제목</h2><p>가져온 본문입니다.</p>');
  await p.waitForTimeout(500);
  /* 대화상자의 [가져오기] 는 정확히 그 글자다 — 느슨하게 잡으면 상단 바의
     [＋ 추가]·[HTML 가져오기] 같은 다른 버튼이 걸린다(실제로 걸렸다). */
  await p.locator('button:visible').filter({hasText:/^가져오기$/}).last().click({force:true});
  await p.waitForTimeout(2500);
  const secs = await fr().locator('[data-section="true"]').count();
  const stillPaper = await p.locator('button:has-text("종이 늘리기")').count();
  check(secs===0 && stillPaper>0, '종이 페이지에 HTML 을 가져와도 종이 그대로다',
    `섹션 ${secs}개 · 종이 늘리기 버튼 ${stillPaper}개`);
}

console.log(errs.length ? '\n❌ JS 오류: '+errs.join(' / ') : '\n✅ JS 오류 없음');

/* 뒷정리 */
await p.evaluate(async () => {
  const l = await (await fetch('/api/pages')).json();
  for (const x of (l.pages ?? l).filter(x => x.path.includes('재확인'))) await fetch(`/api/pages/${x.id}`,{method:'DELETE'});
});
console.log(bad ? `\n의심 ${bad}건 확인됨` : '\n재확인 이상 없음');
await b.close();

process.exit(bad ? 1 : 0);
