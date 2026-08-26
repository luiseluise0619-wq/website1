#!/usr/bin/env node
/* =============================================================================
 * 에디터 시뮬레이터 — 사람이 쓰듯 처음부터 끝까지 해 본다
 *
 *   npm run build && npm start                    (다른 터미널)
 *   ADMIN_PASSWORD=... npm run sim                (기본 http://localhost:3000)
 *
 * 왜 필요한가: 단위 테스트도 캔버스 점검도 '한 조각'만 본다. 정작 사람이
 * 겪는 것은 '페이지를 만들고 → 블록을 넣고 → 글을 고치고 → 저장하고 →
 * 발행해서 → 공개 화면에서 확인하는' 한 줄기다. 그 줄기 어딘가가 끊기면
 * 조각 검사는 전부 통과해도 제품은 쓸 수 없다.
 *
 * 실제로 이 시뮬레이터가 잡은 것: 레이어 목록이 0.8초마다 상태를 갈아 끼워
 * 에디터 전체를 다시 그리게 만들던 문제(화면이 계속 들썩이고 클릭이 안 먹었다).
 *
 * 만든 시험용 페이지는 끝나고 지운다 — 점검이 사용자 데이터를 남기면 안 된다.
 * ========================================================================== */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
/** 시험용 페이지 이름 — 끝나고 지운다 */
const PAGE_TITLE = process.env.SIM_PAGE ?? '시뮬레이터 시험 페이지';

let failed = 0;
const step = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name} — ${String(err).split('\n')[0].slice(0, 160)}`);
    failed++;
    return false;
  }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } });
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(String(e).slice(0, 160)));

/* ---- 거들 ------------------------------------------------------------------ */

/** 캔버스 안 블록 수 — 무엇이 늘고 줄었는지의 기준 */
const blockCount = () =>
  page.evaluate(
    () => document.querySelector('iframe#preview-frame')?.contentDocument?.querySelectorAll('[data-puck-id]').length ?? -1,
  );

/**
 * 캔버스 안 요소의 계산된 스타일 — 레이어 이름(또는 글 내용)으로 찾는다.
 *
 * 반드시 '가장 안쪽'을 골라야 한다. 글로 찾으면 그 글을 품은 섹션·캔버스도
 * 전부 걸리는데, 그중 바깥 것을 재면 글자 크기를 바꿔 놓고도 "16px 그대로"
 * 라는 엉뚱한 결과가 나온다(실제로 이 점검이 처음 그렇게 틀렸다).
 */
const styleOf = (label, prop) =>
  page.evaluate(
    ([label, prop]) => {
      const doc = document.querySelector('iframe#preview-frame').contentDocument;
      const named = [...doc.querySelectorAll('[data-puck-id]')].filter(
        (e) => (e.getAttribute('data-element-name') ?? '') === label,
      );
      const byText = [...doc.querySelectorAll('[data-puck-id]')].filter((e) =>
        (e.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(label),
      );
      const candidates = named.length ? named : byText;
      // 다른 후보를 품고 있지 않은 것 = 가장 안쪽
      const el = candidates.find((e) => !candidates.some((other) => other !== e && e.contains(other)));
      return el ? getComputedStyle(el)[prop] : null;
    },
    [label, prop],
  );

/**
 * 인스펙터 입력칸을 '라벨'로 찾아 값을 넣는다.
 * 순서로 찾으면 안 된다 — 보이는 첫 숫자칸은 '너비'고, 첫 색칸은 '배경'이다.
 * 그리고 인스펙터는 두 벌 그려지므로(하나는 숨김) 보이는 쪽만 골라야 한다.
 */
const setField = (labelStartsWith, value, type = 'input') =>
  page.evaluate(
    ([labelStartsWith, value, type]) => {
      const form = [...document.querySelectorAll('form')].find((f) => f.getBoundingClientRect().width > 0);
      if (!form) return false;
      const el = [...form.querySelectorAll(type === 'color' ? 'input[type=color]' : 'input, textarea')].find(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          (e.closest('label')?.textContent ?? '').replace(/\s+/g, '').startsWith(labelStartsWith.replace(/\s+/g, '')),
      );
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    [labelStartsWith, value, type],
  );

/** 좌측 목록에서 이름으로 눌러 연다 */
const clickInAside = (label) =>
  page.evaluate((label) => {
    const aside = document.querySelector('aside');
    const el = [...aside.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    (el?.closest('button') ?? el)?.click();
    return Boolean(el);
  }, label);

/* ---- 1) 들어가기 ----------------------------------------------------------- */

const ready = await step('로그인하고 에디터 열기', async () => {
  await page.goto(`${BASE}/admin/editor`, { waitUntil: 'networkidle' });
  if (await page.locator('input[type=password]').count()) {
    if (!PASSWORD) throw new Error('ADMIN_PASSWORD 가 필요합니다.');
    await page.fill('input[type=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForTimeout(3500);
  }
  await page.waitForSelector('iframe#preview-frame', { timeout: 30000 });
  await page.waitForTimeout(5000);
  return `캔버스 블록 ${await blockCount()}개`;
});

if (!ready) {
  await browser.close();
  console.log('\n에디터를 열지 못해 나머지를 건너뜁니다.');
  process.exit(1);
}

/* ---- 2) 만들기 ------------------------------------------------------------- */

await step('[＋ 추가] → 새 페이지', async () => {
  await page.locator('button:has-text("＋ 추가")').click();
  await page.waitForTimeout(400);
  await page.locator('[role=menuitem]:has-text("새 페이지")').click();
  await page.waitForTimeout(800);
  await page.locator('input[placeholder*="THAILAND"]').fill(PAGE_TITLE);
  await page.waitForTimeout(600);
  /* 이 시뮬레이션은 '섹션으로 쌓는' 페이지를 검사한다. 기본값은 칸 없는
     종이 한 장이므로(그쪽은 npm run paper-check 가 본다) 여기서는 섹션
     템플릿을 골라 준다. 대화상자는 두 번 렌더되니 보이는 쪽만 잡는다. */
  /* 카드는 대화상자 안에서 스크롤 밖에 있을 수 있다 — 좌표를 거치지 않고
     요소에 직접 클릭을 보낸다(force 로도 덮개에 가로막히는 일이 있었다). */
  const tpl = page.locator('[data-template-id="hero-intro"]');
  await tpl.evaluate((el) => el.click());
  await page.waitForTimeout(300);
  if ((await tpl.getAttribute('aria-pressed')) !== 'true') throw new Error('템플릿이 안 골라짐');
  await page.waitForTimeout(400);
  await page.locator('form button[type=submit], form button:has-text("만들기")').last().click();
  await page.waitForTimeout(3000);
  /* 주소는 상단 바가 '보여 주기만' 한다(고치는 곳은 우측 [페이지] 탭) —
     값은 data-ks-path 로 읽는다. */
  const path = await page.locator('[data-ks-path]').getAttribute('data-ks-path');
  if (!path || path === '/') throw new Error(`경로가 만들어지지 않음: "${path}"`);
  return `경로 ${path} · 블록 ${await blockCount()}개`;
});

await step('[레이어] 탭에 페이지 구조가 보인다', async () => {
  await page.locator('button:has-text("레이어")').click();
  await page.waitForTimeout(1500);
  const rows = await page
    .locator('aside button[title]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('title')).filter((t) => t?.includes('·')));
  if (!rows.length) throw new Error('레이어가 하나도 안 보임');
  /* 섹션·자유 캔버스 같은 '담는 블록'이 빠지면 페이지 골격을 못 고친다 */
  if (!rows.some((r) => r.startsWith('Section'))) throw new Error('섹션이 목록에 없음');
  return `${rows.length}개 (${rows.slice(0, 3).join(' / ')})`;
});

await step('[＋ 추가] → 섹션 추가', async () => {
  const before = await blockCount();
  await page.locator('button:has-text("＋ 추가")').click();
  await page.waitForTimeout(400);
  await page.locator('[role=menuitem]:has-text("섹션 추가")').click();
  await page.waitForTimeout(2500);
  const after = await blockCount();
  if (after <= before) throw new Error(`블록이 안 늘어남 ${before} → ${after}`);
  return `${before} → ${after}`;
});

await step('블록 목록에서 텍스트를 끌어다 놓기', async () => {
  const item = page.locator('[class*="DrawerItem-draggable"]').filter({ hasText: '텍스트' }).first();
  const src = await item.boundingBox();
  if (!src) throw new Error('블록 목록에서 텍스트를 못 찾음');
  const frame = await page.locator('iframe#preview-frame').boundingBox();
  const before = await blockCount();

  const tx = frame.x + frame.width / 2;
  const ty = frame.y + 250;
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  // 임계값을 넘겨야 드래그로 인식된다
  await page.mouse.move(src.x + src.width / 2 + 8, src.y + src.height / 2 + 8);
  await page.waitForTimeout(200);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(src.x + (tx - src.x) * (i / 20), src.y + (ty - src.y) * (i / 20));
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(3000);

  const after = await blockCount();
  if (after <= before) throw new Error(`끌어다 놓아도 안 늘어남 ${before} → ${after}`);
  return `${before} → ${after}`;
});

/* ---- 3) 고치기 ------------------------------------------------------------- */

let targetLabel = null;

await step('레이어에서 텍스트를 고른다', async () => {
  await page.locator('button:has-text("레이어")').click();
  await page.waitForTimeout(800);
  const row = page.locator('aside button[title^="Text"]').first();
  targetLabel = (await row.getAttribute('title')).split('·').slice(1).join('·').trim();
  await row.click();
  await page.waitForTimeout(1500);
  const size = await styleOf(targetLabel, 'fontSize');
  if (size === null) throw new Error(`캔버스에서 "${targetLabel}" 을 못 찾음`);
  return `"${targetLabel}" · ${size}`;
});

await step('글을 고치면 캔버스에 바로 반영된다', async () => {
  const mark = `시뮬레이터가 고친 글 ${Date.now() % 10000}`;
  if (!(await setField('', mark, 'input'))) {
    // 라벨 없는 첫 textarea 가 본문이다
    const ok = await page.evaluate((mark) => {
      const form = [...document.querySelectorAll('form')].find((f) => f.getBoundingClientRect().width > 0);
      const ta = [...form.querySelectorAll('textarea')].find((e) => e.getBoundingClientRect().width > 0);
      if (!ta) return false;
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(ta, mark);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, mark);
    if (!ok) throw new Error('본문 입력칸을 못 찾음');
  }
  await page.waitForTimeout(2000);
  const text = await page.evaluate(
    () => document.querySelector('iframe#preview-frame').contentDocument.body.innerText.replace(/\s+/g, ' '),
  );
  if (!text.includes(mark)) throw new Error('캔버스에 반영되지 않음');
  targetLabel = mark;
  return '즉시 반영';
});

await step('글자 크기를 바꾸면 그 요소에 적용된다', async () => {
  if (!(await setField('크기', '52'))) throw new Error('글자 크기 칸을 못 찾음');
  await page.waitForTimeout(2200);
  const size = await styleOf(targetLabel, 'fontSize');
  if (size !== '52px') throw new Error(`52px 가 아니라 ${size}`);
  return size;
});

await step('글자색을 바꾸면 그 요소에 적용된다', async () => {
  if (!(await setField('글자색', '#ff0000', 'color'))) throw new Error('글자색 칸을 못 찾음');
  await page.waitForTimeout(2200);
  const color = await styleOf(targetLabel, 'color');
  if (!color?.includes('255, 0, 0')) throw new Error(`빨강이 아니라 ${color}`);
  return color;
});

await step('섹션을 골라 손잡이로 높이를 늘린다', async () => {
  await page.locator('button:has-text("레이어")').click();
  await page.waitForTimeout(700);
  await page.locator('aside button[title^="Section"]').first().click();
  await page.waitForTimeout(1400);
  const handle = await page.locator('[data-ks-handle="se"]').boundingBox();
  if (!handle) throw new Error('크기 손잡이가 없음');
  const height = () =>
    page.evaluate(
      () => document.querySelector('iframe#preview-frame').contentDocument.querySelector('[data-section="true"]').offsetHeight,
    );
  const before = await height();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + i * 12);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const after = await height();
  if (after <= before) throw new Error(`높이가 안 늘어남 ${before} → ${after}`);
  return `${before} → ${after}`;
});

await step('Ctrl+Z 로 되돌린다', async () => {
  const height = () =>
    page.evaluate(
      () => document.querySelector('iframe#preview-frame').contentDocument.querySelector('[data-section="true"]').offsetHeight,
    );
  const before = await height();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1600);
  const after = await height();
  if (after === before) throw new Error(`아무것도 안 되돌아감 (${before})`);
  return `${before} → ${after}`;
});

/* ---- 4) 내보내 보이기 ------------------------------------------------------ */

await step('저장', async () => {
  await page.locator('button:has-text("저장")').click();
  await page.waitForTimeout(3000);
  const label = (await page.locator('button:has-text("저장")').innerText()).trim();
  if (label.includes('*')) throw new Error(`저장이 안 끝남: ${label}`);
  return label;
});

await step('미리보기를 열어 휴대폰 폭까지 본다', async () => {
  await page.locator('button:has-text("미리보기")').first().click();
  await page.waitForTimeout(2800);
  if (!(await page.locator('iframe[title="사이트 미리보기"]').count())) throw new Error('미리보기가 안 열림');
  await page.locator('button:has-text("휴대폰")').click();
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="사이트 미리보기"]');
    const doc = frame.contentDocument;
    const free = [...doc.querySelectorAll('[data-free="true"]')];
    return {
      width: Math.round(frame.getBoundingClientRect().width),
      stillAbsolute: free.filter((e) => getComputedStyle(e).position === 'absolute').length,
    };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  /* 휴대폰 폭에서는 자유 배치가 세로 스택으로 풀려야 한다 */
  if (state.stillAbsolute) throw new Error(`휴대폰인데 절대 배치가 ${state.stillAbsolute}개 남음`);
  return `폭 ${state.width}px · 절대 배치 0개`;
});

await step('발행하고 공개 화면에서 확인', async () => {
  await page.locator('button:has-text("발행")').click();
  await page.waitForTimeout(3500);
  const path = await page.locator('[data-ks-path]').getAttribute('data-ks-path');

  const visitor = await browser.newPage();
  const res = await visitor.goto(BASE + path, { waitUntil: 'networkidle' });
  await visitor.waitForTimeout(1500);
  const text = (await visitor.locator('body').innerText()).replace(/\s+/g, ' ');
  await visitor.close();

  if (res.status() !== 200) throw new Error(`공개 화면이 ${res.status()}`);
  if (!text.includes(targetLabel)) throw new Error('고친 글이 공개 화면에 없음');
  return `200 · 고친 글 확인`;
});

/* ---- 5) 치우기 ------------------------------------------------------------- */

await step('시험용 페이지 지우기', async () => {
  const removed = await page.evaluate(async (title) => {
    const list = await (await fetch('/api/pages')).json();
    const pages = list.pages ?? list;
    const target = pages.find((p) => p.title === title);
    if (!target) return 'already-gone';
    const res = await fetch(`/api/pages/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
    return res.ok ? 'deleted' : `실패 ${res.status}`;
  }, PAGE_TITLE);
  if (removed.startsWith('실패')) throw new Error(removed);
  return removed === 'deleted' ? '지웠습니다' : '이미 없음';
});

/* ---- 마무리 ---------------------------------------------------------------- */

const uniqueErrors = [...new Set(jsErrors)];
if (uniqueErrors.length) {
  console.log(`\n❌ JS 오류 ${uniqueErrors.length}종`);
  for (const e of uniqueErrors.slice(0, 5)) console.log(`   ${e}`);
  failed += uniqueErrors.length;
} else {
  console.log('\n✅ JS 오류 없음');
}

await browser.close();
console.log(failed ? `\n실패 ${failed}건` : '\n처음부터 끝까지 이상 없음');
process.exit(failed ? 1 : 0);
