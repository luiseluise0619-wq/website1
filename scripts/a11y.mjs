#!/usr/bin/env node
/* =============================================================================
 * 접근성 점검 — 실행 중인 사이트에 axe-core 를 물려 WCAG 2.1 AA 위반을 찾는다.
 *
 *   npm run build && npm start          (다른 터미널)
 *   npm run a11y                        (기본 http://localhost:3000)
 *   BASE_URL=http://localhost:3300 npm run a11y
 *
 * 위반이 하나라도 있으면 종료 코드 1 — CI 에 그대로 걸 수 있다.
 * ========================================================================== */
import { chromium, devices } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PATHS = process.env.A11Y_PATHS?.split(',') ?? [
  '/',
  '/brand/beauty',
  '/ceo-story/founder',
  '/business/buyer-inquiry',
  '/video/ksoho-tv',
];
const VIEWPORTS = [
  ['데스크톱', { viewport: { width: 1440, height: 900 } }],
  ['모바일', devices['iPhone 13']],
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;

for (const [label, options] of VIEWPORTS) {
  const context = await browser.newContext(options);
  const page = await context.newPage();

  for (const path of PATHS) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    if (!violations.length) {
      console.log(`✅ ${label} ${path}`);
      continue;
    }
    failed += violations.length;
    console.log(`❌ ${label} ${path}`);
    for (const v of violations) {
      console.log(`   ${v.impact ?? 'unknown'} · ${v.id} — ${v.help} (${v.nodes.length}곳)`);
      console.log(`     ${v.nodes[0].html.slice(0, 120)}`);
    }
  }
  await context.close();
}

await browser.close();
console.log(failed ? `\n위반 ${failed}건` : '\n위반 없음');
process.exit(failed ? 1 : 0);
