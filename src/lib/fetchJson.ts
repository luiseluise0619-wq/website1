'use client';

/* =============================================================================
 * JSON 요청 헬퍼
 * -----------------------------------------------------------------------------
 * res.json() 을 그대로 부르면, 서버가 HTML 오류 페이지를 돌려줬을 때
 * "Unexpected token '<'" 같은 메시지만 남아 원인을 알 수 없다.
 * (배포 보호 페이지, 라우트 누락, 프록시 오류 등에서 흔히 발생한다)
 * 본문을 먼저 텍스트로 읽고, JSON 이 아니면 상태 코드와 함께 알려준다.
 * ========================================================================== */

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    throw new ApiError(
      `서버에 연결하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* JSON 이 아니다 — HTML 오류 페이지일 가능성이 높다 */
    const looksHtml = /^\s*<(!doctype|html)/i.test(text);
    const hint = looksHtml
      ? '서버가 JSON 대신 HTML 페이지를 반환했습니다. 배포가 최신인지, 로그인 세션이 만료되지 않았는지 확인하세요.'
      : '서버 응답을 해석할 수 없습니다.';
    throw new ApiError(`${hint} (HTTP ${res.status})`, res.status, text.slice(0, 200));
  }

  if (!res.ok) {
    const message = (parsed as { error?: string } | null)?.error ?? `요청이 실패했습니다 (HTTP ${res.status})`;
    throw new ApiError(message, res.status);
  }
  return parsed as T;
}
