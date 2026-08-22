import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken, isAuthConfigured, verifyPassword } from '@/lib/server/auth';
import { loginSchema } from '@/lib/schemas';
import { clientIp, createRateLimiter } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

/** 로그인 시도 제한 — 10분에 10회 */
const rateLimited = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD 가 설정되지 않았습니다.' }, { status: 503 });
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: '시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요.' }, { status: 429 });
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}

/** 로그아웃 */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
