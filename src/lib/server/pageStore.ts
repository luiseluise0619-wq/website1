import 'server-only';
import { pageStorage } from './storage';
import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * Page Store — 라우트/에디터가 쓰는 얇은 파사드.
 * 실제 저장은 storage 드라이버(filesystem | postgres | read-only)가 담당한다.
 * ========================================================================== */

export const listPages = (): Promise<PageDocument[]> => pageStorage.listPages();
export const getPageById = (id: string) => pageStorage.getPageById(id);
export const getPageByPath = (path: string) => pageStorage.getPageByPath(path);
export const upsertPage = (page: PageDocument) => pageStorage.savePage(page);
export const savePages = (pages: PageDocument[]) => pageStorage.saveAll(pages);
export const deletePage = (id: string) => pageStorage.deletePage(id);

/** 발행된 페이지 경로만 — 정적 생성 대상 */
export async function listPublishedPaths(): Promise<string[]> {
  const pages = await pageStorage.listPages();
  return pages.filter((p) => p.status === 'published').map((p) => p.path);
}
