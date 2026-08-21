import { NextResponse } from 'next/server';
import { translate, TranslationError } from '@/lib/translate/providers';
import { isLocale } from '@/lib/i18n';
import type { LocaleCode } from '@/types/schema';

export const dynamic = 'force-dynamic';
/** 번역 API 는 외부 호출이 길어질 수 있다 */
export const maxDuration = 60;

interface Body {
  texts: string[];
  source: LocaleCode;
  targets: LocaleCode[];
  html?: boolean;
}

/** 한 요청에 담을 수 있는 문자열 수 — DeepL 권장 상한과 맞춘다 */
const MAX_TEXTS = 50;
const MAX_CHARS = 30_000;

/**
 * POST /api/translate
 * 브라우저는 API 키를 갖지 않는다. 이 라우트가 유일한 번역 경로다.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 });
  }

  const { texts, source, targets, html } = body;

  if (!Array.isArray(texts) || !texts.length) {
    return NextResponse.json({ error: 'texts 배열이 필요합니다.' }, { status: 400 });
  }
  if (texts.length > MAX_TEXTS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_TEXTS}개까지 번역할 수 있습니다.` }, { status: 400 });
  }
  const totalChars = texts.reduce((n, t) => n + (t?.length ?? 0), 0);
  if (totalChars > MAX_CHARS) {
    return NextResponse.json({ error: `요청 문자 수 상한(${MAX_CHARS})을 초과했습니다.` }, { status: 413 });
  }
  if (!isLocale(source) || !Array.isArray(targets) || !targets.every(isLocale)) {
    return NextResponse.json({ error: '지원하지 않는 언어 코드입니다.' }, { status: 400 });
  }

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
