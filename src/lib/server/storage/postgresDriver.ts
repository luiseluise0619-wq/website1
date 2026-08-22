import 'server-only';
import { Pool } from 'pg';
import { SEED_PAGES } from '@/data/seed';
import { normalizePath } from '@/lib/id';
import type { AnalyticsStorage, InquiryRecord, InquiryStorage, PageStorage } from './types';
import type { AnalyticsEventRow } from '@/types/analytics';
import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * Postgres 드라이버 — 배포 환경(Vercel/Neon/Supabase/RDS) 기본값
 * -----------------------------------------------------------------------------
 * · 서버리스에서는 요청마다 인스턴스가 생길 수 있으므로 풀을 작게 유지하고
 *   전역에 캐싱한다(핫 리로드/람다 재사용 시 커넥션 폭증 방지).
 * · 스키마는 최초 접근 시 한 번 보장한다(CREATE TABLE IF NOT EXISTS).
 *   마이그레이션 도구를 붙이기 전까지의 실용적인 부트스트랩이다.
 * ========================================================================== */

const CONNECTION_STRING =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? '';

declare global {
  // eslint-disable-next-line no-var
  var __ksohoPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __ksohoSchemaReady: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!CONNECTION_STRING) throw new Error('POSTGRES_URL 이 설정되지 않았습니다.');
  if (!global.__ksohoPool) {
    global.__ksohoPool = new Pool({
      connectionString: CONNECTION_STRING,
      // 서버리스 함수 하나당 커넥션 몇 개면 충분하다 — 풀러(pgbouncer) 사용을 권장
      max: Number(process.env.POSTGRES_POOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: /sslmode=disable/.test(CONNECTION_STRING) ? undefined : { rejectUnauthorized: false },
    });
  }
  return global.__ksohoPool;
}

/** 스키마 보장 + 최초 1회 시드 주입 */
async function ensureSchema(): Promise<void> {
  if (!global.__ksohoSchemaReady) {
    global.__ksohoSchemaReady = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pages (
          id            TEXT PRIMARY KEY,
          path          TEXT UNIQUE NOT NULL,
          document      JSONB NOT NULL,
          status        TEXT NOT NULL DEFAULT 'draft',
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS pages_status_idx ON pages (status);

        CREATE TABLE IF NOT EXISTS analytics_events (
          event_id      TEXT PRIMARY KEY,
          day           DATE NOT NULL,
          ts            TIMESTAMPTZ NOT NULL,
          received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          type          TEXT NOT NULL,
          anonymous_id  TEXT NOT NULL,
          session_id    TEXT NOT NULL,
          page_id       TEXT NOT NULL,
          path          TEXT NOT NULL,
          locale        TEXT NOT NULL,
          element_id    TEXT,
          device_type   TEXT,
          country       TEXT,
          payload       JSONB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS analytics_page_day_idx ON analytics_events (page_id, day, type);
        CREATE INDEX IF NOT EXISTS analytics_element_idx  ON analytics_events (element_id) WHERE element_id IS NOT NULL;

        CREATE TABLE IF NOT EXISTS inquiries (
          id          TEXT PRIMARY KEY,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          form_name   TEXT NOT NULL,
          page_id     TEXT NOT NULL,
          path        TEXT NOT NULL,
          locale      TEXT NOT NULL,
          fields      JSONB NOT NULL,
          utm         JSONB,
          country     TEXT,
          status      TEXT NOT NULL DEFAULT 'new'
        );
        CREATE INDEX IF NOT EXISTS inquiries_form_idx ON inquiries (form_name, created_at DESC);
      `);

      // 빈 DB 라면 시드를 넣어 첫 배포에서도 사이트가 비어 보이지 않게 한다
      const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM pages');
      if (rows[0]?.count === '0') {
        for (const page of SEED_PAGES) await writePage(page);
      }
    })().catch((err) => {
      // 실패한 프로미스를 캐시하면 이후 요청이 전부 같은 오류로 막힌다
      global.__ksohoSchemaReady = undefined;
      throw err;
    });
  }
  return global.__ksohoSchemaReady;
}

async function writePage(page: PageDocument): Promise<PageDocument> {
  const normalized: PageDocument = { ...page, path: normalizePath(page.path), updatedAt: new Date().toISOString() };
  await getPool().query(
    `INSERT INTO pages (id, path, document, status, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (id) DO UPDATE
       SET path = EXCLUDED.path, document = EXCLUDED.document,
           status = EXCLUDED.status, updated_at = now()`,
    [normalized.id, normalized.path, JSON.stringify(normalized), normalized.status],
  );
  return normalized;
}

export const postgresPageStorage: PageStorage = {
  name: 'postgres',
  readOnly: false,

  async listPages() {
    await ensureSchema();
    const { rows } = await getPool().query<{ document: PageDocument }>(
      'SELECT document FROM pages ORDER BY path',
    );
    return rows.map((r) => r.document);
  },

  async getPageById(id) {
    await ensureSchema();
    const { rows } = await getPool().query<{ document: PageDocument }>(
      'SELECT document FROM pages WHERE id = $1',
      [id],
    );
    return rows[0]?.document ?? null;
  },

  async getPageByPath(pathname) {
    await ensureSchema();
    const { rows } = await getPool().query<{ document: PageDocument }>(
      'SELECT document FROM pages WHERE path = $1',
      [normalizePath(pathname)],
    );
    return rows[0]?.document ?? null;
  },

  async savePage(page) {
    await ensureSchema();
    const path = normalizePath(page.path);
    // 경로 중복은 라우팅을 깨뜨린다 — UNIQUE 제약보다 친절한 메시지를 먼저 준다
    const { rows } = await getPool().query<{ id: string }>(
      'SELECT id FROM pages WHERE path = $1 AND id <> $2',
      [path, page.id],
    );
    if (rows.length) throw new Error(`경로가 이미 사용 중입니다: ${path} (페이지 ${rows[0].id})`);
    return writePage(page);
  },

  async saveAll(pages) {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const page of pages) {
        const normalized = { ...page, path: normalizePath(page.path), updatedAt: new Date().toISOString() };
        await client.query(
          `INSERT INTO pages (id, path, document, status, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, now())
           ON CONFLICT (id) DO UPDATE
             SET path = EXCLUDED.path, document = EXCLUDED.document,
                 status = EXCLUDED.status, updated_at = now()`,
          [normalized.id, normalized.path, JSON.stringify(normalized), normalized.status],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return pages.map((p) => ({ ...p, path: normalizePath(p.path) }));
  },

  async deletePage(id) {
    await ensureSchema();
    await getPool().query('DELETE FROM pages WHERE id = $1', [id]);
  },
};

export const postgresAnalyticsStorage: AnalyticsStorage = {
  name: 'postgres',
  readOnly: false,

  async insert(rows) {
    if (!rows.length) return 0;
    await ensureSchema();

    // 배치 전체를 한 번의 INSERT 로 — 서버리스에서 라운드트립이 비싸다
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      const b = i * 13;
      values.push(
        r.eventId, r.day, r.ts, r.type, r.anonymousId, r.sessionId,
        r.pageId, r.path, r.locale, r.elementId, r.deviceType, r.country,
        JSON.stringify(r.payload),
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13}::jsonb)`;
    });

    const result = await getPool().query(
      `INSERT INTO analytics_events
         (event_id, day, ts, type, anonymous_id, session_id, page_id, path, locale, element_id, device_type, country, payload)
       VALUES ${tuples.join(',')}
       ON CONFLICT (event_id) DO NOTHING`,
      values,
    );
    return result.rowCount ?? 0;
  },

  async query(filters) {
    await ensureSchema();
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (filters.pageId) add('page_id = ?', filters.pageId);
    if (filters.from) add('day >= ?::date', filters.from);
    if (filters.to) add('day <= ?::date', filters.to);
    if (filters.device && filters.device !== 'all') add('device_type = ?', filters.device);
    if (filters.locale && filters.locale !== 'all') add('locale = ?', filters.locale);
    if (filters.country && filters.country !== 'all') add('country = ?', filters.country);

    const { rows } = await getPool().query(
      `SELECT event_id, day::text, ts, received_at, type, anonymous_id, session_id,
              page_id, path, locale, element_id, device_type, country, payload
         FROM analytics_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ts DESC
        LIMIT 200000`,
      params,
    );

    return rows.map((r): AnalyticsEventRow => ({
      eventId: r.event_id,
      day: r.day,
      ts: new Date(r.ts).toISOString(),
      receivedAt: new Date(r.received_at).toISOString(),
      type: r.type,
      anonymousId: r.anonymous_id,
      sessionId: r.session_id,
      pageId: r.page_id,
      path: r.path,
      locale: r.locale,
      elementId: r.element_id,
      deviceType: r.device_type,
      country: r.country,
      payload: r.payload,
    }));
  },
};

export function hasPostgres(): boolean {
  return Boolean(CONNECTION_STRING);
}


/* ---- 문의(Inquiry) ---------------------------------------------------------- */

export const postgresInquiryStorage: InquiryStorage = {
  name: 'postgres',
  readOnly: false,

  async insert(record) {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO inquiries (id, created_at, form_name, page_id, path, locale, fields, utm, country, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        record.id, record.createdAt, record.formName, record.pageId, record.path, record.locale,
        JSON.stringify(record.fields), record.utm ? JSON.stringify(record.utm) : null,
        record.country ?? null, record.status,
      ],
    );
    return record;
  },

  async list(filters = {}) {
    await ensureSchema();
    const params: unknown[] = [];
    let where = '';
    if (filters.formName) {
      params.push(filters.formName);
      where = 'WHERE form_name = $1';
    }
    params.push(filters.limit ?? 200);
    const { rows } = await getPool().query(
      `SELECT id, created_at, form_name, page_id, path, locale, fields, utm, country, status
         FROM inquiries ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(toInquiry);
  },

  async updateStatus(id, status) {
    await ensureSchema();
    const { rows } = await getPool().query(
      `UPDATE inquiries SET status = $2 WHERE id = $1
       RETURNING id, created_at, form_name, page_id, path, locale, fields, utm, country, status`,
      [id, status],
    );
    return rows[0] ? toInquiry(rows[0]) : null;
  },
};

function toInquiry(r: Record<string, unknown>): InquiryRecord {
  return {
    id: String(r.id),
    createdAt: new Date(r.created_at as string).toISOString(),
    formName: String(r.form_name),
    pageId: String(r.page_id),
    path: String(r.path),
    locale: String(r.locale),
    fields: r.fields as Record<string, string>,
    utm: (r.utm as Record<string, string> | null) ?? undefined,
    country: (r.country as string | null) ?? null,
    status: r.status as InquiryRecord['status'],
  };
}
