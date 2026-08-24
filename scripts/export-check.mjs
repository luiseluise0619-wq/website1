#!/usr/bin/env node
/* =============================================================================
 * 정적 내보내기 점검 — "받은 zip 을 웹호스팅에 올리면 진짜로 똑같이 뜨는가"
 *
 *   npm run build && npm start                      (다른 터미널)
 *   ADMIN_PASSWORD=... npm run export-check         (기본 http://localhost:3000)
 *
 * 하는 일:
 *   1) /api/export 를 호출해 zip 을 받는다
 *   2) 압축을 풀고, 평범한 웹호스팅처럼 동작하는 정적 서버로 띄운다
 *      (확장자 없는 주소 → 그 폴더의 index.html)
 *   3) 원본 사이트와 정적 사본을 같은 브라우저로 열어 본문을 비교한다
 *   4) 자산 404 와 JS 오류를 잡는다
 *   5) 정적 호스팅에서도 언어 전환(?lang=)이 되는지 확인한다
 *
 * 4·5 번이 핵심이다. zip 이 만들어졌다는 사실만으로는 아무것도 보장되지
 * 않는다 — 청크 하나가 404 나면 페이지는 하이드레이션에 실패해 오류 화면으로
 * 떨어지는데, 파일 개수만 세면 그걸 알 수 없다.
 * ========================================================================== */
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const PORT = Number(process.env.EXPORT_CHECK_PORT ?? 4177);
/** 원본과 비교할 페이지 수 — 전부 돌면 느리다 */
const SAMPLE = Number(process.env.EXPORT_CHECK_SAMPLE ?? 6);

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed++;
};
const die = (message) => {
  console.log(`❌ ${message}`);
  process.exit(1);
};

/* ---- 1) 내보내기 호출 ------------------------------------------------------ */

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
});
if (!login.ok) die(`관리자 로그인 실패 (${login.status}) — ADMIN_PASSWORD 를 확인하세요.`);
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const res = await fetch(`${BASE}/api/export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({}),
});
if (!res.ok) {
  const json = await res.json().catch(() => ({}));
  die(`내보내기 실패 (${res.status}) ${json.error ?? ''}`);
}

const zipBuffer = Buffer.from(await res.arrayBuffer());
const pageCount = Number(res.headers.get('X-Export-Pages') ?? 0);
const fileCount = Number(res.headers.get('X-Export-Files') ?? 0);
const warnings = decodeURIComponent(res.headers.get('X-Export-Warnings') ?? '').split('\n').filter(Boolean);
console.log(`📦 ${pageCount}장 · 파일 ${fileCount}개 · ${(zipBuffer.length / 1e6).toFixed(1)}MB`);
for (const w of warnings) console.log(`   ⚠︎ ${w}`);

/* ---- 2) 압축 풀고 정적 호스팅 흉내 ---------------------------------------- */

const root = await mkdtemp(join(tmpdir(), 'ksoho-export-'));
const zip = await JSZip.loadAsync(zipBuffer);
const entries = Object.values(zip.files).filter((f) => !f.dir);
for (const entry of entries) {
  const dest = join(root, entry.name);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, await entry.async('nodebuffer'));
}
check('압축 안 파일 수가 헤더와 일치한다', entries.length === fileCount + 1, `zip ${entries.length} / 헤더 ${fileCount}+안내문`);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
/* 카페24·Nginx·Apache 처럼 확장자 없는 주소는 그 폴더의 index.html 로 내준다 */
const host = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(root, path);
  try {
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 ${path}`);
  }
});
await new Promise((resolve) => host.listen(PORT, resolve));
const STATIC = `http://localhost:${PORT}`;

/* ---- 3~5) 브라우저로 비교 -------------------------------------------------- */

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** 원본에서 발행 경로 목록을 얻는다 (sitemap 이 곧 발행 목록이다) */
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname)
  .filter((p, i, all) => all.indexOf(p) === i);
if (!paths.length) die('sitemap.xml 에서 발행 경로를 찾지 못했습니다.');

/** 비교용 본문 — 공백을 접어 서버/정적 간의 사소한 차이를 없앤다 */
const textOf = async (page, url) => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
const page = await context.newPage();
const jsErrors = [];
const notFound = [];
page.on('pageerror', (e) => jsErrors.push(String(e).slice(0, 160)));
page.on('response', (r) => {
  if (r.status() >= 400 && r.url().startsWith(STATIC)) notFound.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

const sample = paths.slice(0, SAMPLE);
let mismatched = 0;
for (const path of sample) {
  const live = await textOf(page, BASE + path);
  const copy = await textOf(page, STATIC + path);
  if (live !== copy) {
    mismatched++;
    console.log(`   ↳ ${path}\n      원본: ${live.slice(0, 90)}\n      사본: ${copy.slice(0, 90)}`);
  }
}
check(`정적 사본이 원본과 같은 내용을 보여 준다 (${sample.length}장)`, mismatched === 0, `${mismatched}장 불일치`);
check('자산이 하나도 빠지지 않았다', notFound.length === 0, [...new Set(notFound)].slice(0, 5).join(', '));
check('JS 오류가 없다', jsErrors.length === 0, [...new Set(jsErrors)].slice(0, 2).join(' | '));

/* 정적 호스팅은 쿼리로 다른 파일을 내줄 수 없다 —
   언어 전환이 브라우저에서 일어나야만 6개 언어가 산다 */
const LANG_CHECKS = [['en', 'en-US'], ['th', 'th-TH'], ['ja', 'ja-JP']];
const langPage = await context.newPage();
let langOk = 0;
const langDetail = [];
for (const [lang, expected] of LANG_CHECKS) {
  await langPage.goto(`${STATIC}/?lang=${lang}`, { waitUntil: 'networkidle' });
  await langPage.waitForTimeout(1500);
  const actual = await langPage.getAttribute('html', 'lang');
  if (actual === expected) langOk++;
  else langDetail.push(`${lang}→${actual}`);
}
check(`정적 사본에서도 ?lang= 언어 전환이 된다 (${langOk}/${LANG_CHECKS.length})`, langOk === LANG_CHECKS.length, langDetail.join(', '));

/* 검색엔진용 부속 파일 */
for (const extra of ['/robots.txt', '/sitemap.xml']) {
  const r = await fetch(STATIC + extra);
  check(`${extra} 가 함께 나온다`, r.ok, `${r.status}`);
}

await browser.close();
host.close();
console.log(failed ? `\n내보내기 문제 ${failed}건 (산출물: ${root})` : '\n정적 내보내기 이상 없음');
process.exit(failed ? 1 : 0);
