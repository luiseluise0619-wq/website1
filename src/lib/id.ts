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

/** 경로 정규화: 선행 슬래시 보장, 후행 슬래시 제거, 중복 슬래시 축약 */
export function normalizePath(path: string): string {
  const p = `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return p === '' ? '/' : p;
}
