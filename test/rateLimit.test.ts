import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from '@/lib/server/rateLimit';

/* 문의 폼과 관리자 로그인이 공유하는 방어선이다. 창 리셋이 틀리면 정상 사용자가
   막히고, 청소가 없으면 IP 마다 한 칸씩 쌓여 인스턴스 메모리가 계속 늘어난다. */

describe('createRateLimiter', () => {
  it('한도까지는 통과시키고 넘으면 막는다', () => {
    const limited = createRateLimiter({ windowMs: 1000, max: 3 });
    expect([1, 2, 3].map(() => limited('1.1.1.1', 0))).toEqual([false, false, false]);
    expect(limited('1.1.1.1', 0)).toBe(true);
  });

  it('창이 지나면 다시 열린다', () => {
    const limited = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limited('1.1.1.1', 0)).toBe(false);
    expect(limited('1.1.1.1', 500)).toBe(true);
    expect(limited('1.1.1.1', 1500)).toBe(false);
  });

  it('키(IP)마다 따로 센다', () => {
    const limited = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limited('a', 0)).toBe(false);
    expect(limited('b', 0)).toBe(false);
    expect(limited('a', 0)).toBe(true);
    expect(limited('b', 0)).toBe(true);
  });

  it('만료된 키를 청소해 무한히 쌓이지 않는다', () => {
    const limited = createRateLimiter({ windowMs: 1000, max: 5, maxKeys: 10 });
    for (let i = 0; i < 10; i += 1) limited(`ip${i}`, 0);
    expect(limited.size()).toBe(10);
    // 창이 지난 뒤 새 키가 들어오면 옛 항목이 정리된다
    limited('새IP', 5000);
    expect(limited.size()).toBe(1);
  });

  it('전부 유효한데도 한도를 넘으면 비우고 계속 동작한다', () => {
    const limited = createRateLimiter({ windowMs: 10_000, max: 5, maxKeys: 5 });
    for (let i = 0; i < 5; i += 1) limited(`ip${i}`, 0);
    limited('새IP', 100);
    expect(limited.size()).toBe(1);
    expect(limited('새IP', 100)).toBe(false);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://x/', { headers });

  it('x-forwarded-for 의 첫 주소를 쓴다', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('x-real-ip 로 폴백한다', () => {
    expect(clientIp(req({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('빈 헤더는 unknown 으로 묶는다', () => {
    expect(clientIp(req({ 'x-forwarded-for': '  ' }))).toBe('unknown');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
