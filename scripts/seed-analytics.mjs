/**
 * 데모용 합성 분석 이벤트 생성기.
 * 실제 수집 경로(/api/analytics/collect)를 그대로 통과시키므로,
 * 히트맵·이탈 리포트를 실데이터 없이 확인할 수 있다.
 *
 *   npm run start &  &&  node scripts/seed-analytics.mjs
 *   BASE_URL=http://localhost:3100 node scripts/seed-analytics.mjs
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const res = await (await fetch(`${BASE}/api/pages`)).json();
const home = res.pages.find((p) => p.path === '/');
const elements = ['hero-title-home', 'hero-sub-home', 'hero-cta-home', 'nav-brand', 'nav-global'];
const events = [];
let n = 0;
const ctx = (s, a, locale = 'ko') => ({
  anonymousId: `a${a}`, sessionId: `s${s}`, pageId: home.id, path: '/', locale,
  device: { type: 'desktop', viewportWidth: 1440, viewportHeight: 900, dpr: 1 },
});
elements.forEach((el, i) => {
  const clicks = [40, 8, 95, 22, 14][i];
  for (let c = 0; c < clicks; c++) {
    n += 1;
    events.push({ eventId: `ev-${n}`, type: 'element_click', ts: Date.now(),
      context: ctx((n % 60) + 1, (n % 45) + 1, ['ko', 'en', 'th'][n % 3]),
      payload: { elementId: el, elementType: 'Button', elementName: el, relX: 0.5, relY: 0.5, pageX: 200 + i * 90, pageY: 300 + i * 60, timeOnPage: 2000 + c * 40 } });
  }
  for (let c = 0; c < clicks * 3; c++) {
    n += 1;
    events.push({ eventId: `im-${n}`, type: 'element_impression', ts: Date.now(),
      context: ctx((n % 60) + 1, (n % 45) + 1),
      payload: { elementId: el, elementType: 'Button', timeToVisible: 900 } });
  }
});
for (let s = 1; s <= 60; s++) {
  for (const th of [20, 50, 80, 100]) {
    if (Math.random() < { 20: 0.95, 50: 0.7, 80: 0.4, 100: 0.2 }[th]) {
      n += 1;
      events.push({ eventId: `sd-${n}`, type: 'scroll_depth', ts: Date.now(), context: ctx(s, s),
        payload: { threshold: th, timeToReach: th * 120, maxScrollPx: th * 12, documentHeight: 3000 } });
    }
  }
  const sec = Math.random() < 0.65 ? 'sec-hero' : 'sec-body';
  n += 1;
  events.push({ eventId: `dw-${n}`, type: 'section_dwell', ts: Date.now(), context: ctx(s, s),
    payload: { sectionId: sec, sectionName: sec === 'sec-hero' ? 'Hero 섹션' : '본문 섹션', dwellMs: 4000 + Math.random() * 9000, maxVisibleRatio: 0.9 } });
  n += 1;
  events.push({ eventId: `ex-${n}`, type: 'exit', ts: Date.now(), context: ctx(s, s),
    payload: { lastVisibleSectionId: sec, lastVisibleSectionName: sec === 'sec-hero' ? 'Hero 섹션' : '본문 섹션', scrollDepth: 40 + Math.random() * 55, timeOnPage: 9000, reason: 'hidden', interacted: Math.random() > 0.35 } });
}
for (let i = 0; i < events.length; i += 100) {
  const r = await fetch(`${BASE}/api/analytics/collect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: 1, sentAt: Date.now(), events: events.slice(i, i + 100) }),
  });
  if (!r.ok) console.log('batch failed', r.status);
}
console.log('seeded', events.length, 'events for', home.id);
