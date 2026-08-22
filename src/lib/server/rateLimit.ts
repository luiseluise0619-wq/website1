/* =============================================================================
 * 창(window) 기반 요청 제한
 * -----------------------------------------------------------------------------
 * 인스턴스 메모리에만 기록한다. 서버리스에서는 인스턴스마다 따로 세므로 완벽한
 * 방어가 아니라, 자동화된 대량 제출을 늦추는 1차 방어선이다.
 *
 * 만료 항목을 청소하는 것이 핵심이다 — 청소하지 않으면 방문한 IP 마다 한 칸씩
 * 영원히 쌓여, 오래 살아 있는 인스턴스에서 메모리가 계속 늘어난다.
 * ========================================================================== */

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** 이 수를 넘으면 만료 항목을 청소한다 */
  maxKeys?: number;
}

export interface RateLimiter {
  (key: string, now?: number): boolean;
  /** 테스트·진단용 — 현재 추적 중인 키 수 */
  size: () => number;
}

export function createRateLimiter({ windowMs, max, maxKeys = 10_000 }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, { count: number; first: number }>();

  const limited = (key: string, now: number = Date.now()): boolean => {
    if (hits.size >= maxKeys) {
      for (const [k, v] of hits) {
        if (now - v.first > windowMs) hits.delete(k);
      }
      /* 전부 유효한데도 한도를 넘었다면 대량 공격이다. 무한히 늘리느니
         통째로 비운다 — 제한이 잠깐 느슨해지는 편이 메모리 고갈보다 낫다. */
      if (hits.size >= maxKeys) hits.clear();
    }

    const record = hits.get(key);
    if (!record || now - record.first > windowMs) {
      hits.set(key, { count: 1, first: now });
      return false;
    }
    record.count += 1;
    return record.count > max;
  };

  limited.size = () => hits.size;
  return limited;
}

/** 프록시가 붙인 헤더에서 방문자 IP 를 읽는다 (없으면 하나의 버킷으로 묶인다) */
export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
