import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SEED_PAGES } from '@/data/seed';
import { normalizePath } from '@/lib/id';
import type { AnalyticsStorage, InquiryRecord, InquiryStorage, PageStorage } from './types';
import type { AnalyticsEventRow } from '@/types/analytics';
import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * 파일시스템 드라이버 — 로컬 개발 기본값
 * 서버리스에서는 디스크가 휘발되므로 사용하지 않는다(index.ts 가 선택을 막는다).
 * ========================================================================== */

const DATA_DIR = process.env.PAGE_STORE_DIR ?? path.join(process.cwd(), '.data');
const PAGES_FILE = path.join(DATA_DIR, 'pages.json');
const EVENTS_FILE = path.join(process.env.ANALYTICS_STORE_DIR ?? DATA_DIR, 'events.ndjson');

async function readPages(): Promise<PageDocument[]> {
  try {
    const raw = await fs.readFile(PAGES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PageDocument[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* 최초 실행 — 시드로 초기화 */
  }
  await writePages(SEED_PAGES);
  return SEED_PAGES;
}

async function writePages(pages: PageDocument[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PAGES_FILE, JSON.stringify(pages, null, 2), 'utf8');
}

export const fsPageStorage: PageStorage = {
  name: 'filesystem',
  readOnly: false,

  listPages: readPages,

  async getPageById(id) {
    return (await readPages()).find((p) => p.id === id) ?? null;
  },

  async getPageByPath(pathname) {
    const target = normalizePath(pathname);
    return (await readPages()).find((p) => p.path === target) ?? null;
  },

  async savePage(page) {
    const pages = await readPages();
    const normalized: PageDocument = { ...page, path: normalizePath(page.path), updatedAt: new Date().toISOString() };
    const conflict = pages.find((p) => p.path === normalized.path && p.id !== normalized.id);
    if (conflict) throw new Error(`경로가 이미 사용 중입니다: ${normalized.path} (페이지 ${conflict.id})`);

    const index = pages.findIndex((p) => p.id === normalized.id);
    if (index === -1) pages.push(normalized);
    else pages[index] = normalized;
    await writePages(pages);
    return normalized;
  },

  async saveAll(pages) {
    const normalized = pages.map((p) => ({ ...p, path: normalizePath(p.path) }));
    await writePages(normalized);
    return normalized;
  },

  async deletePage(id) {
    await writePages((await readPages()).filter((p) => p.id !== id));
  },
};

/** 중복 이벤트 제거 — 재전송된 배치가 통계를 부풀리지 않게 한다 */
const seenEventIds = new Set<string>();

export const fsAnalyticsStorage: AnalyticsStorage = {
  name: 'filesystem',
  readOnly: false,

  async insert(rows) {
    const fresh = rows.filter((r) => r.eventId && !seenEventIds.has(r.eventId));
    if (!fresh.length) return 0;
    for (const r of fresh) seenEventIds.add(r.eventId);
    await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
    await fs.appendFile(EVENTS_FILE, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    return fresh.length;
  },

  async query(filters) {
    let raw = '';
    try {
      raw = await fs.readFile(EVENTS_FILE, 'utf8');
    } catch {
      return [];
    }
    const rows = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AnalyticsEventRow;
        } catch {
          return null;
        }
      })
      .filter((r): r is AnalyticsEventRow => r !== null);

    return rows.filter((r) => {
      if (filters.pageId && r.pageId !== filters.pageId) return false;
      if (filters.from && r.day < filters.from) return false;
      if (filters.to && r.day > filters.to) return false;
      if (filters.device && filters.device !== 'all' && r.deviceType !== filters.device) return false;
      if (filters.locale && filters.locale !== 'all' && r.locale !== filters.locale) return false;
      if (filters.country && filters.country !== 'all' && r.country !== filters.country) return false;
      return true;
    });
  },
};

/* ---- 문의(Inquiry) ---------------------------------------------------------- */

const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.ndjson');

export const fsInquiryStorage: InquiryStorage = {
  name: 'filesystem',
  readOnly: false,

  async insert(record) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(INQUIRIES_FILE, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  },

  async list(filters = {}) {
    let raw = '';
    try {
      raw = await fs.readFile(INQUIRIES_FILE, 'utf8');
    } catch {
      return [];
    }
    const rows = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as InquiryRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is InquiryRecord => r !== null)
      .filter((r) => !filters.formName || r.formName === filters.formName)
      .reverse();
    return filters.limit ? rows.slice(0, filters.limit) : rows;
  },
};
