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
    /* '넘긴 페이지들을 저장한다'이지 '이 목록으로 통째로 바꾼다'가 아니다.
       예전처럼 파일을 통째로 덮어쓰면, 에디터가 고친 페이지만 보냈을 때
       나머지 페이지가 전부 사라진다. Postgres 드라이버도 upsert 다. */
    const normalized = pages.map((p) => ({ ...p, path: normalizePath(p.path) }));
    const existing = await readPages();
    const merged = [...existing];
    for (const page of normalized) {
      const index = merged.findIndex((p) => p.id === page.id);
      if (index === -1) merged.push(page);
      else merged[index] = page;
    }
    await writePages(merged);
    return normalized;
  },

  async deletePage(id) {
    await writePages((await readPages()).filter((p) => p.id !== id));
  },
};

/** 중복 이벤트 제거 — 재전송된 배치가 통계를 부풀리지 않게 한다 */
const seenEventIds = new Set<string>();
/* 무한히 담아 두면 오래 켜 둔 개발 서버에서 메모리가 계속 는다.
   재전송은 몇 초 안에 오므로 최근 것만 기억하면 충분하다. */
const MAX_SEEN_EVENTS = 50_000;

function rememberEvent(id: string): void {
  if (seenEventIds.size >= MAX_SEEN_EVENTS) {
    // Set 은 삽입 순서를 지키므로 앞쪽(가장 오래된) 절반을 버린다
    const drop = Math.floor(MAX_SEEN_EVENTS / 2);
    let n = 0;
    for (const key of seenEventIds) {
      seenEventIds.delete(key);
      if (++n >= drop) break;
    }
  }
  seenEventIds.add(id);
}

export const fsAnalyticsStorage: AnalyticsStorage = {
  name: 'filesystem',
  readOnly: false,

  async insert(rows) {
    const fresh = rows.filter((r) => r.eventId && !seenEventIds.has(r.eventId));
    if (!fresh.length) return 0;
    for (const r of fresh) rememberEvent(r.eventId);
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

  async updateStatus(id, status) {
    /* 추가 전용(ndjson) 파일이라 상태 변경은 전체를 다시 쓴다.
       문의 건수는 사람이 읽는 규모(수천 건)라 이 정도면 충분하다. */
    let raw = '';
    try {
      raw = await fs.readFile(INQUIRIES_FILE, 'utf8');
    } catch {
      return null;
    }
    let updated: InquiryRecord | null = null;
    const lines = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const record = JSON.parse(line) as InquiryRecord;
          if (record.id !== id) return line;
          updated = { ...record, status };
          return JSON.stringify(updated);
        } catch {
          return line;
        }
      });
    if (!updated) return null;
    await fs.writeFile(INQUIRIES_FILE, `${lines.join('\n')}\n`, 'utf8');
    return updated;
  },
};
