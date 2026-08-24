import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import JSZip from 'jszip';
import { assertAdmin } from '@/lib/server/auth';
import { listPages } from '@/lib/server/pageStore';
import { buildStaticExport, readmeText } from '@/lib/server/export/staticExport';
import { isStaticSiteConfigured } from '@/lib/server/cors';

export const dynamic = 'force-dynamic';
/** 페이지 수만큼 자기 자신을 크롤링한다 — 기본 타임아웃으로는 모자란다 */
export const maxDuration = 300;

/**
 * POST /api/export — 발행된 페이지를 정적 HTML 묶음(zip)으로 내려준다.
 *
 * 초안까지 포함하지 않는다. 내보내기는 '지금 공개된 사이트를 그대로 떠 가는'
 * 동작이어야 하고, 초안이 섞여 나가면 공개 전 페이지가 웹호스팅에 올라간다.
 */
export async function POST(request: Request) {
  /* 초안 제목·경로까지 들어 있는 산출물이다 — 인증 없이 열어 두면 안 된다 */
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as { apiBase?: string };

  const h = headers();
  const host = h.get('host');
  if (!host) return NextResponse.json({ error: '요청에서 호스트를 알 수 없습니다.' }, { status: 400 });
  /* 자기 자신을 부를 주소. 프록시 뒤(Vercel·Netlify)에서는 x-forwarded-proto 가
     실제 스킴을 알려 준다 — 없으면 로컬로 보고 http 를 쓴다. */
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const pages = await listPages();
  const published = pages.filter((p) => p.status === 'published');
  if (!published.length) {
    return NextResponse.json({ error: '발행된 페이지가 없습니다. 먼저 페이지를 발행하세요.' }, { status: 400 });
  }

  /* 문의·분석을 계속 받을 절대 주소. 화면에서 준 값 > SITE_URL > 지금 주소 순.
     빈 문자열을 명시적으로 주면 '끄기'로 본다. */
  const requestedApiBase =
    body.apiBase !== undefined ? body.apiBase.trim() : (process.env.SITE_URL ?? origin);

  /* 주소만 심어 봐야 소용없다. 정적 사본은 다른 도메인에서 이 API 를 부르므로
     STATIC_SITE_ORIGINS 에 그 도메인이 없으면 브라우저가 프리플라이트에서
     막는다 — 폼은 '보내는 척'하다 실패하고, 안내문은 접수된다고 약속한다.
     허용 설정이 없으면 처음부터 주소를 심지 않고, 무엇을 해야 하는지 알린다. */
  const corsReady = isStaticSiteConfigured();
  const apiBase = corsReady ? requestedApiBase : '';
  const extraWarnings = requestedApiBase && !corsReady
    ? [
        'STATIC_SITE_ORIGINS 가 비어 있어 문의 폼과 방문 분석을 껐습니다. ' +
          '정적 사본을 올릴 도메인(예: https://www.your-domain.co.kr)을 이 배포본의 ' +
          'STATIC_SITE_ORIGINS 에 넣고 다시 내보내면 정적 사본의 문의도 접수됩니다.',
      ]
    : [];

  const result = await buildStaticExport({
    origin,
    paths: published.map((p) => p.path),
    apiBase: apiBase || undefined,
  });
  result.warnings.unshift(...extraWarnings);

  if (!result.files.length) {
    return NextResponse.json({ error: result.warnings.join(' / ') || '내보낼 것이 없습니다.' }, { status: 500 });
  }

  const zip = new JSZip();
  for (const file of result.files) zip.file(file.path, file.body);
  zip.file(
    '읽어주세요.txt',
    readmeText({ pageCount: published.length, apiBase: apiBase || undefined, warnings: result.warnings }),
  );

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="ksoho-site-${stamp}.zip"`,
      'Content-Length': String(buffer.length),
      /* 화면이 "몇 장 나갔고 무엇을 주의해야 하는지"를 말해 줄 수 있게 —
         본문은 zip 이라 JSON 을 같이 실을 수 없다. */
      'X-Export-Pages': String(published.length),
      'X-Export-Files': String(result.files.length),
      'X-Export-Warnings': encodeURIComponent(result.warnings.join('\n')),
    },
  });
}
