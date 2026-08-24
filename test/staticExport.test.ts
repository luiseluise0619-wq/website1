import { describe, expect, it } from 'vitest';
import {
  buildStaticExport,
  collectAssetUrls,
  collectCssUrls,
  filePathForAsset,
  filePathForRoute,
  injectExportRuntime,
  readmeText,
} from '@/lib/server/export/staticExport';

/* =============================================================================
 * 정적 HTML 내보내기 — 주소를 파일 이름으로 바꾸는 규칙과 자산 수집.
 * 여기가 틀리면 산출물은 "받아지긴 하는데 웹호스팅에 올리면 깨지는" 상태가 된다.
 * ========================================================================== */

describe('filePathForRoute — 주소를 디스크 이름으로', () => {
  it('루트는 index.html', () => {
    expect(filePathForRoute('/')).toBe('index.html');
  });

  it('하위 경로는 디렉터리 + index.html (확장자 없는 주소가 열리도록)', () => {
    expect(filePathForRoute('/brand/beauty')).toBe('brand/beauty/index.html');
  });

  it('끝의 슬래시와 쿼리는 떨어낸다', () => {
    expect(filePathForRoute('/brand/beauty/?lang=en')).toBe('brand/beauty/index.html');
  });

  it('한글 경로는 디코딩해서 저장한다 (웹서버가 디코딩해서 찾으므로)', () => {
    expect(filePathForRoute('/%EB%B8%8C%EB%9E%9C%EB%93%9C')).toBe('브랜드/index.html');
  });
});

describe('filePathForAsset', () => {
  it('앞의 슬래시와 쿼리를 떨어낸다', () => {
    expect(filePathForAsset('/_next/static/chunks/a.js?dpl=1')).toBe('_next/static/chunks/a.js');
  });

  /* 이걸 놓치면 그 청크만 404 가 나고 페이지는 하이드레이션에 실패해
     오류 화면으로 떨어진다 — 겉보기엔 내보내기 전체가 깨진 것처럼 보인다 */
  it('퍼센트 인코딩된 Next 청크 경로를 실제 폴더 이름으로 되돌린다', () => {
    expect(filePathForAsset('/_next/static/chunks/app/%5B%5B...slug%5D%5D/page-abc.js')).toBe(
      '_next/static/chunks/app/[[...slug]]/page-abc.js',
    );
  });

  it('망가진 인코딩이어도 던지지 않고 원본을 쓴다', () => {
    expect(filePathForAsset('/_next/static/%E0%A4%A.js')).toBe('_next/static/%E0%A4%A.js');
  });
});

describe('collectAssetUrls — 무엇을 같이 받아야 하는가', () => {
  const html = `
    <html><head>
      <link rel="stylesheet" href="/_next/static/css/app.css"/>
      <link rel="icon" href="/favicon.svg"/>
      <script src="/_next/static/chunks/main.js"></script>
    </head><body>
      <img src="/images/hero.jpg" srcset="/images/hero.jpg 1x, /images/hero@2x.jpg 2x"/>
      <img src="https://images.unsplash.com/photo-1.jpg"/>
      <div style="background:url('/images/bg.png')"></div>
      <a href="/brand/beauty">브랜드</a>
      <a href="mailto:a@b.com">메일</a>
      <script>self.__next_f.push([1,"\\"/_next/static/chunks/lazy-9f.js\\""])</script>
    </body></html>`;

  const urls = collectAssetUrls(html);

  it('CSS·JS·이미지·아이콘을 모은다', () => {
    expect(urls).toEqual(
      expect.arrayContaining([
        '/_next/static/css/app.css',
        '/_next/static/chunks/main.js',
        '/favicon.svg',
        '/images/hero.jpg',
        '/images/hero@2x.jpg',
        '/images/bg.png',
      ]),
    );
  });

  /* 태그로 나오지 않고 나중에 동적으로 불리는 청크가 있다 —
     하이드레이션 페이로드 문자열까지 훑지 않으면 그 페이지만 조용히 깨진다 */
  it('하이드레이션 페이로드 안의 청크 주소도 놓치지 않는다', () => {
    expect(urls).toContain('/_next/static/chunks/lazy-9f.js');
  });

  it('외부 주소와 mailto 는 건드리지 않는다', () => {
    expect(urls.some((u) => u.includes('unsplash'))).toBe(false);
    expect(urls.some((u) => u.startsWith('mailto'))).toBe(false);
  });

  it('페이지 링크는 자산으로 오해하지 않는다 (별도 큐에서 다룬다)', () => {
    expect(urls).not.toContain('/brand/beauty');
  });

  it('정적 산출물에는 서버가 없으므로 /api 는 받지 않는다', () => {
    expect(collectAssetUrls('<img src="/api/og.png"/>')).toEqual([]);
  });
});

describe('collectCssUrls — 폰트와 배경은 CSS 안에 숨어 있다', () => {
  it('url() 과 @import 를 따라간다', () => {
    const css = `@import "./base.css"; @font-face{src:url(/_next/static/media/noto.woff2)}
                 .a{background:url("../media/bg.png")}`;
    const urls = collectCssUrls(css, '/_next/static/css/app.css');
    expect(urls).toContain('/_next/static/media/noto.woff2');
    expect(urls).toContain('/_next/static/css/base.css');
    expect(urls).toContain('/_next/static/media/bg.png');
  });

  it('외부 주소와 data URI 는 건너뛴다', () => {
    const css = `.a{background:url(https://cdn.example.com/x.png)} .b{background:url(data:image/png;base64,AA)}`;
    expect(collectCssUrls(css, '/_next/static/css/app.css')).toEqual([]);
  });
});

describe('injectExportRuntime', () => {
  it('산출물 표시를 남긴다 (주소가 없어도)', () => {
    const out = injectExportRuntime('<html><head></head><body></body></html>');
    expect(out).toContain('window.__KS_STATIC_EXPORT__=true');
    expect(out).not.toContain('__KS_API_BASE__');
  });

  it('주소가 있으면 문의·분석이 그쪽으로 가도록 심는다', () => {
    const out = injectExportRuntime('<html><head></head><body></body></html>', 'https://ksoho.co.kr/');
    expect(out).toContain('window.__KS_API_BASE__="https://ksoho.co.kr"');
    expect(out.indexOf('__KS_API_BASE__')).toBeLessThan(out.indexOf('</head>'));
  });

  it('head 가 없는 문서도 깨뜨리지 않는다', () => {
    expect(injectExportRuntime('<div>x</div>', 'https://a.b')).toContain('<div>x</div>');
  });
});

/* ---- 전체 흐름 (가짜 서버로) ---------------------------------------------- */

function fakeServer(routes: Record<string, { body: string | Buffer; type?: string; status?: number }>) {
  const seen: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    const hit = routes[url.pathname];
    if (!hit) return new Response('nope', { status: 404 });
    return new Response(hit.body, {
      status: hit.status ?? 200,
      headers: { 'Content-Type': hit.type ?? 'text/html' },
    });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

describe('buildStaticExport', () => {
  const routes = {
    '/': { body: '<html><head><link rel="stylesheet" href="/_next/static/css/a.css"></head><body>홈</body></html>' },
    '/brand': { body: '<html><head></head><body>브랜드<img src="/img/b.png"></body></html>' },
    '/_next/static/css/a.css': { body: '@font-face{src:url(/_next/static/media/f.woff2)}', type: 'text/css' },
    '/_next/static/media/f.woff2': { body: 'FONT', type: 'font/woff2' },
    '/img/b.png': { body: 'PNG', type: 'image/png' },
  };

  it('페이지와 자산을 모아 파일 목록을 만든다', async () => {
    const { impl } = fakeServer(routes);
    const out = await buildStaticExport({ origin: 'http://x', paths: ['/', '/brand'], fetchImpl: impl });
    const names = out.files.map((f) => f.path);
    expect(names).toEqual(
      expect.arrayContaining([
        'index.html',
        'brand/index.html',
        '_next/static/css/a.css',
        '_next/static/media/f.woff2',
        'img/b.png',
      ]),
    );
  });

  it('CSS 안에서 새로 나온 폰트까지 따라간다', async () => {
    const { impl, seen } = fakeServer(routes);
    await buildStaticExport({ origin: 'http://x', paths: ['/'], fetchImpl: impl });
    expect(seen).toContain('/_next/static/media/f.woff2');
  });

  it('같은 자산을 두 번 받지 않는다', async () => {
    const shared = {
      ...routes,
      '/brand': { body: '<html><head><link rel="stylesheet" href="/_next/static/css/a.css"></head><body>x</body></html>' },
    };
    const { impl, seen } = fakeServer(shared);
    await buildStaticExport({ origin: 'http://x', paths: ['/', '/brand'], fetchImpl: impl });
    expect(seen.filter((p) => p === '/_next/static/css/a.css')).toHaveLength(1);
  });

  it('못 가져온 페이지는 조용히 빠지지 않고 경고로 남는다', async () => {
    const { impl } = fakeServer({ ...routes, '/brand': { body: 'boom', status: 500 } });
    const out = await buildStaticExport({ origin: 'http://x', paths: ['/', '/brand'], fetchImpl: impl });
    expect(out.files.map((f) => f.path)).not.toContain('brand/index.html');
    expect(out.warnings.join(' ')).toMatch(/\/brand.*500/);
  });

  it('API 주소가 없으면 문의·분석이 꺼진다는 사실을 알린다', async () => {
    const { impl } = fakeServer(routes);
    const out = await buildStaticExport({ origin: 'http://x', paths: ['/'], fetchImpl: impl });
    expect(out.warnings.join(' ')).toMatch(/문의 폼/);
  });

  it('API 주소를 주면 HTML 에 심는다', async () => {
    const { impl } = fakeServer(routes);
    const out = await buildStaticExport({
      origin: 'http://x',
      paths: ['/'],
      apiBase: 'https://ksoho.co.kr',
      fetchImpl: impl,
    });
    const home = out.files.find((f) => f.path === 'index.html')!;
    expect(home.body.toString()).toContain('window.__KS_API_BASE__="https://ksoho.co.kr"');
  });

  it('발행된 페이지가 하나도 없으면 그렇게 말한다', async () => {
    const { impl } = fakeServer({});
    const out = await buildStaticExport({ origin: 'http://x', paths: ['/'], fetchImpl: impl });
    expect(out.files).toHaveLength(0);
    expect(out.warnings.join(' ')).toMatch(/내보낼 페이지가 하나도 없습니다/);
  });
});

describe('readmeText — 압축을 푼 사람이 막히지 않도록', () => {
  it('올리는 위치를 못 박아 알려 준다', () => {
    const text = readmeText({ pageCount: 3, warnings: [] });
    expect(text).toContain('문서 루트');
    expect(text).toMatch(/하위 폴더에 올리면 링크가 깨집니다/);
    expect(text).toContain('페이지 3장');
  });

  it('경고가 있으면 안내문에도 싣는다', () => {
    const text = readmeText({ pageCount: 1, warnings: ['/x — 서버가 500 로 응답했습니다'] });
    expect(text).toContain('서버가 500 로 응답했습니다');
  });
});

describe('중복 파일', () => {
  it('본문에서 받은 favicon 을 부속 파일로 또 담지 않는다', async () => {
    /* zip 은 같은 이름을 하나로 합친다 — 두 번 담으면 "파일 422개" 라고
       보고해 놓고 실제로는 421개가 나간다 */
    const impl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/') {
        return new Response('<html><head><link rel="icon" href="/favicon.svg"></head><body>홈</body></html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.pathname === '/favicon.svg') return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const out = await buildStaticExport({ origin: 'http://x', paths: ['/'], fetchImpl: impl });
    expect(out.files.filter((f) => f.path === 'favicon.svg')).toHaveLength(1);
    expect(new Set(out.files.map((f) => f.path)).size).toBe(out.files.length);
  });
});

describe('회귀 — 코드 리뷰에서 잡힌 것들', () => {
  /* % 를 빼면 이 앱의 유일한 공개 라우트 청크가 앞에서 끊겨 필터에 걸러진다.
     그러면 '동적으로 불리는 청크' 안전망이 통째로 무용지물이 된다. */
  it('페이로드 안의 퍼센트 인코딩된 청크 주소도 잡는다', () => {
    const html = `<script>self.__next_f.push([1,"\\"/_next/static/chunks/app/%5B%5B...slug%5D%5D/page-abc.js\\""])</script>`;
    expect(collectAssetUrls(html)).toContain('/_next/static/chunks/app/%5B%5B...slug%5D%5D/page-abc.js');
  });

  it('그 주소는 실제 폴더 이름으로 저장된다 (왕복 확인)', () => {
    const html = `<script>self.__next_f.push([1,"/_next/static/chunks/app/%5B%5B...slug%5D%5D/page-abc.js"])</script>`;
    expect(filePathForAsset(collectAssetUrls(html)[0])).toBe(
      '_next/static/chunks/app/[[...slug]]/page-abc.js',
    );
  });

  /* fetch 는 헤더만 오면 resolve 한다. 본문이 멈춘 요청을 끊지 못하면
     자산 하나 때문에 내보내기 전체가 매달린다. */
  it('본문이 멈춘 자산은 내보내기를 붙잡지 않고 경고로 남는다', async () => {
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/') {
        return new Response('<html><head><link rel="stylesheet" href="/stall.css"></head><body>홈</body></html>', {
          headers: { 'Content-Type': 'text/html' },
        });
      }
      // 헤더는 즉시, 본문은 영원히 오지 않는 응답
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      return new Response(body, { headers: { 'Content-Type': 'text/css' } });
    }) as unknown as typeof fetch;

    const out = await buildStaticExport({ origin: 'http://x', paths: ['/'], fetchImpl: impl, timeoutMs: 300 });
    expect(out.files.map((f) => f.path)).toEqual(['index.html']);
    expect(out.warnings.join(' ')).toMatch(/stall\.css/);
  }, 10_000);
});
