/**
 * 데모용 합성 분석 이벤트 생성기.
 * 실제 수집 경로(/api/analytics/collect)를 그대로 통과시키므로,
 * 히트맵·이탈 리포트를 실데이터 없이 확인할 수 있다.
 *
 *   npm run start &  &&  node scripts/seed-analytics.mjs
 *   BASE_URL=http://localhost:3100 ADMIN_PASSWORD=... node scripts/seed-analytics.mjs
 *
 * 페이지 목록은 관리자 전용이라(초안이 딸려 나오므로) 비밀번호가 설정된
 * 배포에서는 먼저 로그인해 세션 쿠키를 받아야 한다.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

async function adminCookie() {
  if (!process.env.ADMIN_PASSWORD) return '';
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`로그인 실패(${res.status}) — ADMIN_PASSWORD 를 확인하세요.`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}

const cookie = await adminCookie();
const pagesRes = await fetch(`${BASE}/api/pages`, { headers: cookie ? { cookie } : {} });
if (!pagesRes.ok) {
  const body = await pagesRes.text();
  throw new Error(
    `페이지 목록을 읽지 못했습니다(${pagesRes.status}). ` +
      '비밀번호가 설정된 서버라면 ADMIN_PASSWORD 를 함께 넘기세요.\n' + body.slice(0, 200),
  );
}
const res = await pagesRes.json();
const home = res.pages.find((p) => p.path === '/');
if (!home) throw new Error('홈(/) 페이지를 찾지 못했습니다.');
/* 실제 홈 페이지에 있는 요소 id 를 쓴다. 가짜 id 로 넣으면 집계는 쌓이는데
   히트맵이 그릴 요소를 찾지 못해 '측정 요소 0개' 가 된다. */
function elementIdsOf(page) {
  const named = [];
  const rest = [];
  const visit = (block) => {
    const props = block?.props ?? {};
    // 섹션·캔버스·컨테이너는 배경이라 클릭 히트맵의 대상이 아니다
    if (['Section', 'FreeCanvas', 'Container'].includes(block.type)) return;
    // 추적 ID 를 지정해 둔 요소(hero-cta 등)가 데모로 가장 보기 좋다
    if (props.trackingId) named.push(props.trackingId);
    else if (props.id) rest.push(props.id);
  };
  (page.content?.content ?? []).forEach(visit);
  Object.values(page.content?.zones ?? {}).forEach((blocks) => blocks.forEach(visit));
  return [...named, ...rest];
}

const elements = elementIdsOf(home).slice(0, 5);
if (!elements.length) throw new Error('홈 페이지에서 추적 가능한 요소를 찾지 못했습니다.');
console.log('대상 요소:', elements.join(', '));
const events = [];
let n = 0;
const ctx = (s, a, locale = 'ko') => ({
  anonymousId: `a${a}`, sessionId: `s${s}`, pageId: home.id, path: '/', locale,
  device: { type: 'desktop', viewportWidth: 1440, viewportHeight: 900, dpr: 1 },
});
elements.forEach((el, i) => {
  const clicks = [95, 40, 22, 14, 8][i % 5];
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
