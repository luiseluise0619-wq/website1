import { nanoid } from 'nanoid';

/** 요소/페이지 ID 생성기. 타입 접두사 덕에 로그와 JSON 을 눈으로 읽을 수 있다. */
export const newElementId = (type: string = 'el') => `${type}_${nanoid(8)}`;
export const newPageId = () => `page_${nanoid(10)}`;

/** 임의 문자열 → URL 안전 슬러그 (한글은 그대로 유지, 공백은 하이픈) */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}\-/]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 경로 정규화: 선행 슬래시 보장, 후행 슬래시 제거, 중복 슬래시 축약,
 * 퍼센트 인코딩 해제, 유니코드 NFC 정규화.
 *
 * 뒤의 둘이 없으면 한글 경로가 조회되지 않는다. 저장할 때는 '/부산-상담회' 로
 * 들어오지만 브라우저는 '/%eb%b6%80...' 로 요청하고, 자모 분리(NFD)로 들어오는
 * 입력도 있어 눈에 똑같아 보이는 두 문자열이 서로 다른 키가 된다.
 */
export function normalizePath(path: string): string {
  const decoded = decodePath(path).normalize('NFC');
  const p = `/${decoded}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return p === '' ? '/' : p;
}

/** 잘못된 인코딩(단독 %)은 원문을 그대로 쓴다 — 조회 실패보다 낫다 */
function decodePath(path: string): string {
  if (!path.includes('%')) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
