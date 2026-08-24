import 'server-only';

/* =============================================================================
 * 정적 HTML 내보내기
 * -----------------------------------------------------------------------------
 * 에디터로 만든 사이트를 Node 없이 돌아가는 HTML 묶음으로 뽑는다.
 * 카페24·가비아 같은 웹호스팅에 FTP 로 올리거나, 사내 서버 문서 루트에
 * 풀어 놓기만 하면 그대로 뜨는 형태다.
 *
 * 방식: 자기 자신(실행 중인 Next 서버)을 크롤링한다.
 * 렌더러를 따로 만들지 않으므로 "에디터에서 본 것"과 "뽑힌 HTML"이 어긋날
 * 여지가 없다. 블록을 하나 추가해도 내보내기 코드는 손댈 필요가 없다.
 *
 * 링크는 절대 경로(/brand/beauty)를 그대로 둔다. 산출물을 문서 루트에 풀면
 * 웹서버가 /brand/beauty → /brand/beauty/index.html 로 찾아 주기 때문이다.
 * 경로를 상대경로로 바꾸는 방법도 있지만, Next 가 HTML 안에 심어 둔
 * 하이드레이션 페이로드에도 같은 경로가 들어 있어 한쪽만 고치면
 * 하이드레이션 직후 링크가 원래대로 돌아간다.
 *
 * 언어는 브라우저에서 정해진다(?lang= · 쿠키 · 브라우저 언어).
 * 6개 언어 본문이 이미 한 HTML 안에 다 들어 있어서, 정적 호스팅이 쿼리로
 * 다른 파일을 내줄 수 없어도 언어 전환이 동작한다.
 * ========================================================================== */

/** 이 헤더가 붙은 요청은 로케일을 서버에서 못 박지 않는다 ([[...slug]]/page.tsx) */
export const EXPORT_HEADER = 'x-ks-export';

export interface ExportFile {
  /** 압축 파일 안의 경로 (앞에 / 없음) */
  path: string;
  body: Buffer;
}

export interface ExportOptions {
  /** 크롤링 대상 — 보통 자기 자신 */
  origin: string;
  /** 내보낼 페이지 경로들 ('/', '/brand/beauty' …) */
  paths: string[];
  /**
   * 정적 사이트에는 /api 가 없다. 문의 폼과 방문 분석을 계속 받으려면
   * 원래 배포본의 절대 주소를 넣는다. 비우면 그 두 기능만 꺼진다.
   */
  apiBase?: string;
  fetchImpl?: typeof fetch;
  /** 자산 하나를 기다리는 한도 (테스트에서 줄인다) */
  timeoutMs?: number;
}

export interface ExportResult {
  files: ExportFile[];
  /** 사람이 읽고 판단해야 하는 것들 — 조용히 삼키지 않는다 */
  warnings: string[];
}

/* ---- 경로 → 파일 이름 ------------------------------------------------------ */

/**
 * 주소를 디스크 이름으로 되돌린다.
 *
 * 반드시 퍼센트 디코딩해야 한다. Next 는 청크 주소를 인코딩된 채 심어 두는데
 * (/_next/static/chunks/app/%5B%5B...slug%5D%5D/page-*.js), 웹서버는 요청을
 * 디코딩해서 [[...slug]] 라는 실제 폴더를 찾는다. 인코딩된 이름 그대로
 * 저장하면 그 청크만 404 가 나고, 페이지는 하이드레이션에 실패해 오류
 * 화면으로 떨어진다 — 겉보기엔 "내보내기가 통째로 깨진" 것처럼 보인다.
 */
function toDiskPath(url: string): string {
  const raw = url.split('?')[0].split('#')[0].replace(/^\/+/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    // 잘못된 인코딩이면 원본 그대로 — 이름이 이상해도 파일은 남긴다
    return raw;
  }
}

/**
 * '/brand/beauty' → 'brand/beauty/index.html'
 * 디렉터리 + index.html 로 두어야 웹서버가 확장자 없는 주소를 찾아 준다.
 */
export function filePathForRoute(route: string): string {
  const clean = toDiskPath(route).replace(/\/+$/, '');
  return clean === '' ? 'index.html' : `${clean}/index.html`;
}

/** '/_next/static/chunks/a.js?dpl=1' → '_next/static/chunks/a.js' */
export function filePathForAsset(url: string): string {
  return toDiskPath(url);
}

/* ---- 자산 수집 ------------------------------------------------------------- */

/** 내려받을 필요가 없거나 내려받으면 안 되는 것 */
function isSkippableUrl(url: string): boolean {
  return (
    url === '' ||
    url.startsWith('//') || // 프로토콜 상대 = 외부
    url.startsWith('#') ||
    url.startsWith('data:') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('/api/') // 정적 산출물에는 서버가 없다
  );
}

/**
 * HTML 한 장에서 내려받아야 할 같은 출처 자산 주소를 모은다.
 *
 * 속성값만 훑으면 부족하다. Next 는 하이드레이션 페이로드
 * (self.__next_f.push([...])) 안에도 청크 주소를 문자열로 심어 두는데,
 * 그중 일부는 <script> 태그로 나오지 않고 나중에 동적으로 불린다.
 * 그래서 /_next/static 주소는 본문 전체에서 한 번 더 훑는다.
 */
export function collectAssetUrls(html: string): string[] {
  const found = new Set<string>();

  const add = (raw: string) => {
    const url = raw.trim().replace(/&amp;/g, '&');
    if (!url.startsWith('/') || isSkippableUrl(url)) return;
    // 페이지(HTML)는 별도 큐로 다룬다 — 여기서는 자산만
    found.add(url);
  };

  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)) add(m[1]);
  for (const m of html.matchAll(/srcset\s*=\s*"([^"]*)"/g)) {
    for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1]);
  /* 페이로드에 escape 된 채 들어 있는 것까지 (\" 로 감싸인 경우 포함).
     % 를 빼면 안 된다 — Next 는 이 앱의 유일한 공개 라우트를
     /_next/static/chunks/app/%5B%5B...slug%5D%5D/… 로 인코딩해 심어 두는데,
     % 가 없으면 그 앞에서 끊겨 확장자 없는 조각이 되고 뒤의 필터에 걸러진다.
     그러면 이 '동적으로 불리는 청크' 안전망이 통째로 무용지물이 된다. */
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9._\-/%]+/g)) add(m[0]);

  return [...found].filter((u) => !u.endsWith('/') && /\.[a-z0-9]+$/i.test(u.split('?')[0]));
}

/** CSS 안의 @import / url() — 폰트와 배경 이미지가 여기 숨어 있다 */
export function collectCssUrls(css: string, cssUrl: string): string[] {
  const base = cssUrl.replace(/[^/]*$/, '');
  const found = new Set<string>();
  const add = (raw: string) => {
    const url = raw.trim();
    if (isSkippableUrl(url) || /^https?:/i.test(url)) return;
    found.add(url.startsWith('/') ? url : new URL(url, `http://x${base}`).pathname);
  };
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(m[1]);
  for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) add(m[1]);
  return [...found];
}

/* ---- HTML 손질 ------------------------------------------------------------- */

/**
 * 산출물임을 표시하고, 문의 접수·방문 분석이 원래 배포본으로 가도록
 * 절대 주소를 심는다(src/lib/apiBase.ts 가 읽는다).
 *
 * 주소가 없을 때도 표시는 남긴다. 그래야 폼이 "지금은 접수할 수 없습니다"를
 * 미리 보여 줄 수 있다 — 표시가 없으면 없는 /api 를 때려 404 를 받고 나서야
 * 실패를 알게 되고, 방문자는 문의를 이미 다 적은 뒤다.
 */
export function injectExportRuntime(html: string, apiBase?: string): string {
  const assigns = ['window.__KS_STATIC_EXPORT__=true'];
  if (apiBase) assigns.push(`window.__KS_API_BASE__=${JSON.stringify(apiBase.replace(/\/$/, ''))}`);
  const tag = `<script>${assigns.join(';')}</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : `${tag}${html}`;
}

/* ---- 본체 ------------------------------------------------------------------ */

/** 자산 요청이 오래 걸려도 내보내기 전체가 멈추지 않게 한다 */
const ASSET_TIMEOUT_MS = 20_000;
/** 같은 자산을 동시에 너무 많이 당기면 자기 서버를 스스로 굶긴다 */
const CONCURRENCY = 6;

export async function buildStaticExport(options: ExportOptions): Promise<ExportResult> {
  const { origin, paths, apiBase } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const base = origin.replace(/\/$/, '');

  const files: ExportFile[] = [];
  const warnings: string[] = [];
  const seenAssets = new Set<string>();
  const assetQueue: string[] = [];
  /* 같은 이름을 두 번 담으면 zip 안에서 하나로 합쳐져, 보고한 파일 수와
     실제 산출물이 어긋난다(favicon 처럼 본문에도 나오고 부속 파일로도 받는
     것들이 그렇다). 담는 쪽에서 한 번만 담는다. */
  const takenPaths = new Set<string>();
  const addFile = (path: string, body: Buffer) => {
    if (takenPaths.has(path)) return;
    takenPaths.add(path);
    files.push({ path, body });
  };

  /**
   * 한 번의 요청을 '본문까지' 받아 온다.
   *
   * 응답 객체만 돌려주고 타이머를 끄면 안 된다. fetch 는 헤더만 오면 resolve
   * 하므로, 그 시점에 abort 를 풀어 버리면 본문이 멈춘 요청은 아무도 못 끊는다.
   * 자산 하나 때문에 내보내기 전체가 maxDuration 까지 매달린다 —
   * 그 자산만 경고로 남기고 넘어가려던 의도가 죽는다.
   */
  const get = async (url: string, headers?: Record<string, string>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ASSET_TIMEOUT_MS);
    try {
      const res = await doFetch(`${base}${url}`, { headers, signal: controller.signal });
      if (!res.ok) return { ok: false as const, status: res.status };
      const buffer = Buffer.from(await res.arrayBuffer());
      return { ok: true as const, status: res.status, buffer, type: res.headers.get('content-type') ?? '' };
    } finally {
      clearTimeout(timer);
    }
  };

  /* --- 1) 페이지 --- */
  for (const route of paths) {
    let res: Awaited<ReturnType<typeof get>>;
    try {
      res = await get(route, { [EXPORT_HEADER]: '1' });
    } catch (err) {
      warnings.push(`${route} — 가져오지 못했습니다 (${err instanceof Error ? err.message : '알 수 없음'})`);
      continue;
    }
    if (!res.ok) {
      warnings.push(`${route} — 서버가 ${res.status} 로 응답했습니다`);
      continue;
    }
    const html = res.buffer.toString('utf8');
    for (const url of collectAssetUrls(html)) {
      if (!seenAssets.has(url)) {
        seenAssets.add(url);
        assetQueue.push(url);
      }
    }
    addFile(filePathForRoute(route), Buffer.from(injectExportRuntime(html, apiBase), 'utf8'));
  }

  if (!files.length) {
    warnings.push('내보낼 페이지가 하나도 없습니다 — 발행 상태인 페이지가 있는지 확인하세요.');
    return { files, warnings };
  }

  /* --- 2) 자산 (CSS 안에서 새로 나오는 것까지 따라간다) --- */
  while (assetQueue.length) {
    const batch = assetQueue.splice(0, CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const res = await get(url);
          if (!res.ok) return { url, error: `${res.status}` };
          return { url, body: res.buffer, isCss: res.type.includes('css') || url.endsWith('.css') };
        } catch (err) {
          return { url, error: err instanceof Error ? err.message : '알 수 없음' };
        }
      }),
    );

    for (const r of results) {
      if (!('body' in r) || !r.body) {
        warnings.push(`자산을 가져오지 못했습니다: ${r.url} (${'error' in r ? r.error : ''})`);
        continue;
      }
      addFile(filePathForAsset(r.url), r.body);
      if (r.isCss) {
        for (const nested of collectCssUrls(r.body.toString('utf8'), r.url)) {
          if (!seenAssets.has(nested)) {
            seenAssets.add(nested);
            assetQueue.push(nested);
          }
        }
      }
    }
  }

  /* --- 3) 검색엔진용 부속 파일 --- */
  for (const extra of ['/robots.txt', '/sitemap.xml', '/favicon.svg']) {
    if (takenPaths.has(filePathForAsset(extra))) continue; // 본문에서 이미 받았다
    try {
      const res = await get(extra);
      if (res.ok) addFile(filePathForAsset(extra), res.buffer);
    } catch {
      // 없어도 사이트는 뜬다 — 경고까지 낼 일은 아니다
    }
  }

  if (!apiBase) {
    warnings.push(
      '문의 폼과 방문 분석은 꺼진 상태로 나갑니다. SITE_URL(또는 내보내기 화면의 API 주소)을 지정하면 ' +
        '정적 사이트에서 들어온 문의도 원래 배포본으로 접수됩니다.',
    );
  }

  return { files, warnings };
}

/* ---- 함께 넣어 주는 안내문 -------------------------------------------------- */

/** 압축을 푼 사람이 무엇을 해야 하는지 — 이것이 없으면 대부분 여기서 막힌다 */
export function readmeText(opts: { pageCount: number; apiBase?: string; warnings: string[] }): string {
  return [
    'K-SOHO GLOBAL — 정적 HTML 내보내기',
    '='.repeat(60),
    '',
    `페이지 ${opts.pageCount}장이 들어 있습니다.`,
    '',
    '[올리는 방법]',
    '1. 이 압축을 풀면 index.html 과 _next 폴더가 나옵니다.',
    '2. 웹호스팅의 문서 루트(보통 public_html · www · htdocs)에',
    '   폴더 구조 그대로 올리세요.',
    '3. 하위 폴더에 올리면 링크가 깨집니다 — 반드시 루트에 올려야 합니다.',
    '',
    '[언어]',
    '6개 언어가 한 파일 안에 모두 들어 있어, 방문자의 브라우저 언어와',
    '?lang=en 같은 주소로 전환됩니다. 서버 설정은 필요 없습니다.',
    '',
    '[주의]',
    opts.apiBase
      ? `· 문의 폼과 방문 분석은 ${opts.apiBase} 로 전송됩니다.`
      : '· 문의 폼과 방문 분석은 꺼져 있습니다(정적 호스팅에는 서버가 없습니다).',
    '· 사진을 외부 주소(unsplash 등)로 넣었다면 그 이미지는 인터넷에서 불러옵니다.',
    '· 페이지를 고친 뒤에는 다시 내보내서 덮어써야 반영됩니다.',
    ...(opts.warnings.length ? ['', '[내보내는 중 알려 드릴 점]', ...opts.warnings.map((w) => `· ${w}`)] : []),
    '',
  ].join('\n');
}
