import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SEED_PAGES } from '@/data/seed';
import { normalizePath } from '@/lib/id';
import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * Page Store — 파일 기반 영속 계층
 * -----------------------------------------------------------------------------
 * 개발/데모 단계에서는 JSON 파일 하나로 충분하다.
 * 운영 전환 시 이 파일의 함수 시그니처만 유지한 채 Postgres/Prisma 구현으로
 * 갈아끼우면 나머지 코드는 그대로다. (라우트·에디터는 이 인터페이스만 안다)
 *
 *   Postgres 스키마 예시:
 *     CREATE TABLE pages (
 *       id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
 *       nav_id TEXT, status TEXT NOT NULL, seo JSONB NOT NULL,
 *       content JSONB NOT NULL, source_locale TEXT NOT NULL,
 *       enabled_locales TEXT[], canvas_width INT,
 *       created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, revision INT
 *     );
 * ========================================================================== */

const DATA_DIR = process.env.PAGE_STORE_DIR ?? path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'pages.json');

async function readAll(): Promise<PageDocument[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PageDocument[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* 최초 실행 — 시드로 초기화한다 */
  }
  await writeAll(SEED_PAGES);
  return SEED_PAGES;
}

async function writeAll(pages: PageDocument[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(pages, null, 2), 'utf8');
}

export async function listPages(): Promise<PageDocument[]> {
  return readAll();
}

export async function getPageById(id: string): Promise<PageDocument | null> {
  const pages = await readAll();
  return pages.find((p) => p.id === id) ?? null;
}

export async function getPageByPath(pathname: string): Promise<PageDocument | null> {
  const pages = await readAll();
  const target = normalizePath(pathname);
  return pages.find((p) => p.path === target) ?? null;
}

/** 발행된 페이지만 — 공개 사이트의 라우트 생성에 쓰인다 */
export async function listPublishedPaths(): Promise<string[]> {
  const pages = await readAll();
  return pages.filter((p) => p.status === 'published').map((p) => p.path);
}

export async function upsertPage(page: PageDocument): Promise<PageDocument> {
  const pages = await readAll();
  const normalized: PageDocument = { ...page, path: normalizePath(page.path), updatedAt: new Date().toISOString() };

  // 경로 중복은 라우팅을 깨뜨리므로 저장 시점에 막는다
  const conflict = pages.find((p) => p.path === normalized.path && p.id !== normalized.id);
  if (conflict) throw new Error(`경로가 이미 사용 중입니다: ${normalized.path} (페이지 ${conflict.id})`);

  const index = pages.findIndex((p) => p.id === normalized.id);
  if (index === -1) pages.push(normalized);
  else pages[index] = normalized;

  await writeAll(pages);
  return normalized;
}

export async function savePages(pages: PageDocument[]): Promise<PageDocument[]> {
  const seen = new Set<string>();
  for (const page of pages) {
    const p = normalizePath(page.path);
    if (seen.has(p)) throw new Error(`중복된 경로: ${p}`);
    seen.add(p);
  }
  const normalized = pages.map((p) => ({ ...p, path: normalizePath(p.path) }));
  await writeAll(normalized);
  return normalized;
}

export async function deletePage(id: string): Promise<void> {
  const pages = await readAll();
  await writeAll(pages.filter((p) => p.id !== id));
}
