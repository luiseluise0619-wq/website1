import 'server-only';
import { SEED_PAGES } from '@/data/seed';
import { normalizePath } from '@/lib/id';
import { fsAnalyticsStorage, fsInquiryStorage, fsPageStorage } from './fsDriver';
import { hasPostgres, postgresAnalyticsStorage, postgresInquiryStorage, postgresPageStorage } from './postgresDriver';
import { StorageReadOnlyError, type AnalyticsStorage, type InquiryStorage, type PageStorage } from './types';

/* =============================================================================
 * 드라이버 선택
 * -----------------------------------------------------------------------------
 *   POSTGRES_URL 있음        → postgres  (배포 권장)
 *   서버리스 + DB 없음        → read-only (시드 페이지로 사이트는 서빙, 저장은 거부)
 *   그 외(로컬)              → filesystem
 *
 * 서버리스에서 파일시스템 드라이버를 쓰지 않는 이유:
 * 쓰기는 성공한 것처럼 보이지만 인스턴스가 사라지면 사라진다. 조용히 데이터를
 * 잃는 것보다, 저장을 명확히 거부하고 이유를 알려주는 편이 낫다.
 * ========================================================================== */

/** Vercel/Lambda 등 디스크가 휘발되는 환경인가 */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);
}

const READ_ONLY_REASON =
  '이 배포에는 데이터베이스가 연결되어 있지 않습니다. ' +
  'Vercel 프로젝트에 Postgres(Neon/Supabase 등)를 추가하고 POSTGRES_URL 환경 변수를 설정하세요.';

/** DB 없는 서버리스 배포용 — 시드 페이지를 읽기 전용으로 서빙한다 */
const readOnlyPageStorage: PageStorage = {
  name: 'read-only-seed',
  readOnly: true,

  async listPages() {
    return SEED_PAGES;
  },
  async getPageById(id) {
    return SEED_PAGES.find((p) => p.id === id) ?? null;
  },
  async getPageByPath(pathname) {
    const target = normalizePath(pathname);
    return SEED_PAGES.find((p) => p.path === target) ?? null;
  },
  async savePage() {
    throw new StorageReadOnlyError(READ_ONLY_REASON);
  },
  async saveAll() {
    throw new StorageReadOnlyError(READ_ONLY_REASON);
  },
  async deletePage() {
    throw new StorageReadOnlyError(READ_ONLY_REASON);
  },
};

/** 이벤트는 유실돼도 사이트가 멈추면 안 된다 — 조용히 버리되 상태는 보고한다 */
const noopAnalyticsStorage: AnalyticsStorage = {
  name: 'disabled',
  readOnly: true,
  async insert() {
    return 0;
  },
  async query() {
    return [];
  },
};

/** 문의는 유실되면 곧 매출 손실이다 — 저장할 곳이 없으면 접수를 명확히 거부한다 */
const rejectingInquiryStorage: InquiryStorage = {
  name: 'disabled',
  readOnly: true,
  async insert() {
    throw new StorageReadOnlyError(READ_ONLY_REASON);
  },
  async list() {
    return [];
  },
  async updateStatus() {
    throw new StorageReadOnlyError(READ_ONLY_REASON);
  },
};

export const pageStorage: PageStorage = hasPostgres()
  ? postgresPageStorage
  : isServerless()
    ? readOnlyPageStorage
    : fsPageStorage;

export const analyticsStorage: AnalyticsStorage = hasPostgres()
  ? postgresAnalyticsStorage
  : isServerless()
    ? noopAnalyticsStorage
    : fsAnalyticsStorage;

export const inquiryStorage: InquiryStorage = hasPostgres()
  ? postgresInquiryStorage
  : isServerless()
    ? rejectingInquiryStorage
    : fsInquiryStorage;

/** /api/health 가 노출하는 배포 진단 정보 */
export function storageStatus() {
  return {
    pages: { driver: pageStorage.name, readOnly: pageStorage.readOnly },
    analytics: { driver: analyticsStorage.name, readOnly: analyticsStorage.readOnly },
    inquiries: { driver: inquiryStorage.name, readOnly: inquiryStorage.readOnly },
    serverless: isServerless(),
    hint: pageStorage.readOnly ? READ_ONLY_REASON : undefined,
  };
}

export { StorageReadOnlyError };
