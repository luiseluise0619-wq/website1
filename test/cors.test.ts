import { afterEach, describe, expect, it } from 'vitest';
import { corsHeaders, corsPreflight, isStaticSiteConfigured } from '@/lib/server/cors';

/* =============================================================================
 * 정적 사본이 원본 API 로 문의를 되돌려 보낼 때의 허용 규칙.
 * 여기가 느슨하면 아무 사이트나 방문자 쿠키로 이 API 를 부를 수 있게 된다.
 * ========================================================================== */

const req = (origin?: string) =>
  new Request('https://api.example.com/api/inquiry', {
    method: 'POST',
    headers: origin ? { origin } : {},
  });

afterEach(() => {
  delete process.env.STATIC_SITE_ORIGINS;
});

describe('corsHeaders', () => {
  it('허용 목록에 있는 출처만 통과시킨다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr, https://www.ksoho.co.kr';
    expect(corsHeaders(req('https://ksoho.co.kr'))['Access-Control-Allow-Origin']).toBe('https://ksoho.co.kr');
    expect(corsHeaders(req('https://www.ksoho.co.kr'))['Access-Control-Allow-Origin']).toBe('https://www.ksoho.co.kr');
  });

  /* Origin 을 그대로 되비추면 사실상 전체 공개가 된다 */
  it('목록에 없는 출처는 되비추지 않는다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    expect(corsHeaders(req('https://evil.example'))).toEqual({});
  });

  it('설정이 없으면 교차 출처를 전부 막는다 (켜는 것은 명시적 선택)', () => {
    expect(corsHeaders(req('https://ksoho.co.kr'))).toEqual({});
  });

  it('같은 출처 요청(Origin 없음)에는 헤더를 붙이지 않는다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    expect(corsHeaders(req())).toEqual({});
  });

  it('끝의 슬래시 차이로 막히지 않는다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr/';
    expect(corsHeaders(req('https://ksoho.co.kr'))['Access-Control-Allow-Origin']).toBe('https://ksoho.co.kr');
  });

  /* 같은 주소가 출처마다 다른 헤더를 내므로 캐시가 섞이면 안 된다 */
  it('Vary: Origin 을 알린다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    expect(corsHeaders(req('https://ksoho.co.kr')).Vary).toBe('Origin');
  });
});

describe('corsPreflight', () => {
  it('허용된 출처에는 204 와 허용 헤더', async () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    const res = corsPreflight(req('https://ksoho.co.kr'));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('허용되지 않은 출처에는 403 이고 허용 헤더가 없다', () => {
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    const res = corsPreflight(req('https://evil.example'));
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('isStaticSiteConfigured', () => {
  it('목록이 있어야 켜진 것으로 본다', () => {
    expect(isStaticSiteConfigured()).toBe(false);
    process.env.STATIC_SITE_ORIGINS = 'https://ksoho.co.kr';
    expect(isStaticSiteConfigured()).toBe(true);
  });

  it('쉼표만 있는 값은 켜진 것이 아니다', () => {
    process.env.STATIC_SITE_ORIGINS = ' , ,';
    expect(isStaticSiteConfigured()).toBe(false);
  });
});
