import { NextResponse } from 'next/server';
import { inquiryStorage, StorageReadOnlyError } from '@/lib/server/storage';
import { assertAdmin } from '@/lib/server/auth';
import { getPageByPath } from '@/lib/server/pageStore';
import { isLocale } from '@/lib/i18n';
import type { InquiryRecord } from '@/lib/server/storage/types';

export const dynamic = 'force-dynamic';

const MAX_FIELDS = 25;
const MAX_VALUE_LENGTH = 4000;

/** 제출 남용 방지 — 인스턴스 단위의 단순 창 제한 */
const submissions = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const record = submissions.get(ip);
  if (!record || now - record.first > WINDOW_MS) {
    submissions.set(ip, { count: 1, first: now });
    return false;
  }
  record.count += 1;
  return record.count > MAX_PER_WINDOW;
}

/** POST /api/inquiry — BUSINESS 폼 접수 (공개 엔드포인트) */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    formName?: string;
    locale?: string;
    path?: string;
    fields?: Record<string, unknown>;
    utm?: Record<string, string>;
  } | null;

  if (!body?.fields || typeof body.fields !== 'object') {
    return NextResponse.json({ error: '문의 내용이 비어 있습니다.' }, { status: 400 });
  }

  const entries = Object.entries(body.fields).slice(0, MAX_FIELDS);
  if (!entries.length) {
    return NextResponse.json({ error: '문의 내용이 비어 있습니다.' }, { status: 400 });
  }

  // 값은 전부 문자열로 정규화하고 길이를 제한한다 (저장소 오염 방지)
  const fields: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !key) continue;
    fields[key.slice(0, 64)] = String(value ?? '').slice(0, MAX_VALUE_LENGTH);
  }

  const path = typeof body.path === 'string' ? body.path : '/';
  const page = await getPageByPath(path).catch(() => null);

  const record: InquiryRecord = {
    id: `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    formName: (body.formName ?? 'inquiry').slice(0, 64),
    pageId: page?.id ?? 'unknown',
    path,
    locale: isLocale(body.locale) ? body.locale : 'ko',
    fields,
    utm: body.utm && Object.keys(body.utm).length ? body.utm : undefined,
    country: request.headers.get('x-vercel-ip-country') ?? request.headers.get('cf-ipcountry'),
    status: 'new',
  };

  try {
    await inquiryStorage.insert(record);
  } catch (err) {
    const status = err instanceof StorageReadOnlyError ? 503 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : '접수 실패' }, { status });
  }

  return NextResponse.json({ ok: true, id: record.id });
}

/** GET /api/inquiry — 접수된 문의 조회 (관리자 전용) */
export async function GET(request: Request) {
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const inquiries = await inquiryStorage.list({
    formName: url.searchParams.get('formName') ?? undefined,
    limit: Number(url.searchParams.get('limit') ?? 200),
  });
  return NextResponse.json({ inquiries });
}
