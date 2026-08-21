'use client';

import type { DeviceInfo } from '@/types/analytics';

/* =============================================================================
 * 방문자 식별 & 디바이스 컨텍스트
 * PII 를 수집하지 않는다 — 익명 ID 는 1st-party 저장소에만 존재한다.
 * ========================================================================== */

const ANON_KEY = 'ksoho_anon_id';
const SESSION_KEY = 'ksoho_session';
/** 무활동 30분 후 새 세션으로 간주 (GA4 기본값과 동일) */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAnonymousId(): string {
  if (typeof localStorage === 'undefined') return 'ssr';
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

interface StoredSession {
  id: string;
  lastSeen: number;
}

/** 세션 ID 조회 — 타임아웃이 지났으면 새로 발급한다 */
export function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return 'ssr';
  const now = Date.now();
  let session: StoredSession | null = null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    session = raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    session = null;
  }
  if (!session || now - session.lastSeen > SESSION_TIMEOUT_MS) {
    session = { id: uuid(), lastSeen: now };
  } else {
    session.lastSeen = now;
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* 사파리 프라이빗 모드 등 — 세션은 메모리 수명으로 축소된다 */
  }
  return session.id;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { type: 'desktop', viewportWidth: 0, viewportHeight: 0, dpr: 1 };
  }
  const w = window.innerWidth;
  const type: DeviceInfo['type'] = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  return {
    type,
    viewportWidth: w,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    os: guessOS(),
    browser: guessBrowser(),
  };
}

export function getUTM(): Record<string, string> | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const v = params.get(`utm_${key}`);
    if (v) utm[key] = v;
  }
  return Object.keys(utm).length ? utm : undefined;
}

function guessOS(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'unknown';
}

function guessBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  return 'unknown';
}

export { uuid };
