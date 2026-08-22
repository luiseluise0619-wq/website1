import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('http://localhost:3300/admin/editor', { waitUntil: 'networkidle' });
if (p.url().includes('login')) { await p.locator('input[type=password]').fill('test123'); await p.locator('button[type=submit]').click(); await p.waitForURL(/editor/, { timeout: 20000 }); }
await p.waitForTimeout(4500);
// 확대(+) 버튼 두 번 → 100% 부근
const zoomIn = p.locator('button[title*="확대"], button[aria-label*="oom"]').last();
for (let i = 0; i < 3; i++) { await zoomIn.click().catch(()=>{}); await p.waitForTimeout(400); }
console.log('배율 표시:', await p.locator('button:visible', { hasText: /%/ }).first().innerText().catch(()=>'?'));
const fb = await p.locator('iframe#preview-frame').boundingBox();
console.log('iframe 크기:', Math.round(fb.width), 'x', Math.round(fb.height), '| 뷰포트 1000');
await p.mouse.move(fb.x + fb.width/2, fb.y + 400);
const t0 = await p.evaluate(() => document.querySelector('iframe#preview-frame').getBoundingClientRect().top);
await p.mouse.wheel(0, 800);
await p.waitForTimeout(900);
const t1 = await p.evaluate(() => document.querySelector('iframe#preview-frame').getBoundingClientRect().top);
const inner = await p.evaluate(() => { const w = document.querySelector('iframe#preview-frame').contentWindow; return { y: w.scrollY, h: w.document.documentElement.scrollHeight, v: w.innerHeight }; });
console.log('휠 후 iframe top:', Math.round(t0), '→', Math.round(t1), '| iframe 내부:', JSON.stringify(inner));
console.log((t1 < t0 || inner.y > 0) ? '✅ 아래쪽에 닿을 수 있음' : '❌ 스크롤 불가');
await b.close();
