import { NextResponse } from 'next/server';
import { inquiryStorage, StorageReadOnlyError } from '@/lib/server/storage';
import { assertAdmin } from '@/lib/server/auth';
import { getPageByPath } from '@/lib/server/pageStore';
import { formatZodError, inquiryRequestSchema } from '@/lib/schemas';
import { clientIp, createRateLimiter } from '@/lib/server/rateLimit';
import type { LocaleCode } from '@/types/schema';
import type { InquiryRecord } from '@/lib/server/storage/types';

export const dynamic = 'force-dynamic';

/** 제출 남용 방지 — 10분에 8건 */
const rateLimited = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 8 });

/** POST /api/inquiry — BUSINESS 폼 접수 (공개 엔드포인트) */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요.' }, { status: 429 });
  }

  const parsed = inquiryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { formName, path, fields, utm } = parsed.data;
  const page = await getPageByPath(path).catch(() => null);

  const record: InquiryRecord = {
    id: `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    formName,
    pageId: page?.id ?? 'unknown',
    path,
    locale: parsed.data.locale as LocaleCode,
    fields,
    utm: utm && Object.keys(utm).length ? utm : undefined,
    // 국가는 클라이언트를 믿지 않고 엣지 헤더에서 읽는다
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
