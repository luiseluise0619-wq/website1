import { NextResponse } from 'next/server';
import { translate, TranslationError } from '@/lib/translate/providers';
import { assertAdmin } from '@/lib/server/auth';
import { formatZodError, translateRequestSchema } from '@/lib/schemas';
import type { LocaleCode } from '@/types/schema';

export const dynamic = 'force-dynamic';
/** 번역 API 는 외부 호출이 길어질 수 있다 */
export const maxDuration = 60;

/**
 * POST /api/translate
 * 브라우저는 API 키를 갖지 않는다. 이 라우트가 유일한 번역 경로다.
 */
export async function POST(request: Request) {
  // 번역은 유료 외부 API 를 호출한다 — 인증 없이 열어두면 비용이 새어 나간다
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = translateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { texts, html } = parsed.data;
  const source = parsed.data.source as LocaleCode;
  const targets = parsed.data.targets as LocaleCode[];

  const output: Record<string, string[]> = {};
  let provider: string = 'none';

  try {
    for (const target of targets) {
      const result = await translate({ texts, source, target, html });
      output[target] = result.texts;
      if (result.provider !== 'none') provider = result.provider;
    }
  } catch (err) {
    const status = err instanceof TranslationError && err.status === 401 ? 401 : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '번역 실패', _provider: provider },
      { status },
    );
  }

  return NextResponse.json({ ...output, _provider: provider });
}
