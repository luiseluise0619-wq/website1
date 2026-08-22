import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

/* =============================================================================
 * 관리자 인증
 * -----------------------------------------------------------------------------
 * 목적: 공개 배포된 사이트에서 /admin 과 쓰기 API 를 보호한다.
 * 방식: 비밀번호 → HMAC 서명 세션 쿠키. 외부 의존성 없이 동작한다.
 *
 * ADMIN_PASSWORD 가 설정되지 않으면:
 *   · 로컬 개발  → 인증 없이 통과 (개발 편의)
 *   · 배포 환경  → 쓰기를 전부 거부 (기본적으로 안전한 쪽)
 * 사용자 수가 늘면 이 파일만 NextAuth/Clerk 로 교체하면 된다.
 * ========================================================================== */

const SESSION_COOKIE = 'ksoho_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

function secret(): string {
  // 비밀번호 자체를 서명 키 재료로 쓰되, 별도 시크릿이 있으면 우선한다
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** 인증이 아예 설정되지 않은 개발 환경에서만 통과시킨다 */
export function authDisabledForDev(): boolean {
  return !isAuthConfigured() && !isProduction();
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [subject, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  if (subject !== 'admin' || !Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = sign(`${subject}.${expiresRaw}`);
  // 길이가 다르면 timingSafeEqual 이 예외를 던지므로 먼저 확인한다
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/** 상수 시간 비밀번호 비교 — 타이밍 공격으로 길이/내용이 새지 않게 */
export function verifyPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 서버 컴포넌트/라우트에서 현재 요청이 관리자인지 판정 */
export function isAdminRequest(): boolean {
  if (authDisabledForDev()) return true;
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

/** 관리자 전용 API(쓰기 + 비공개 데이터 조회)의 가드 — 통과하지 못하면 사유를 돌려준다 */
export function assertAdmin(): { ok: true } | { ok: false; status: number; error: string } {
  if (authDisabledForDev()) return { ok: true };
  if (!isAuthConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'ADMIN_PASSWORD 가 설정되지 않아 관리자 API 가 비활성화되었습니다. 배포 환경 변수를 확인하세요.',
    };
  }
  return isAdminRequest() ? { ok: true } : { ok: false, status: 401, error: '관리자 인증이 필요합니다.' };
}

export { SESSION_COOKIE, SESSION_TTL_MS };
