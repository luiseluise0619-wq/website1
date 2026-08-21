import type { AnalyticsEventRow } from '@/types/analytics';
import type { PageDocument } from '@/types/schema';

/* =============================================================================
 * Storage Driver 계약
 * -----------------------------------------------------------------------------
 * 로컬(파일시스템)과 배포 환경(Postgres)이 같은 인터페이스를 구현한다.
 * 라우트·에디터는 어떤 드라이버가 붙어 있는지 알 필요가 없다.
 * ========================================================================== */

export interface PageStorage {
  /** 드라이버 이름 — 진단 엔드포인트에 노출된다 */
  readonly name: string;
  /** 쓰기 불가 드라이버인가 (예: DB 미설정 상태의 Vercel) */
  readonly readOnly: boolean;

  listPages(): Promise<PageDocument[]>;
  getPageById(id: string): Promise<PageDocument | null>;
  getPageByPath(path: string): Promise<PageDocument | null>;
  savePage(page: PageDocument): Promise<PageDocument>;
  saveAll(pages: PageDocument[]): Promise<PageDocument[]>;
  deletePage(id: string): Promise<void>;
}

export interface AnalyticsStorage {
  readonly name: string;
  readonly readOnly: boolean;

  insert(rows: AnalyticsEventRow[]): Promise<number>;
  /** 집계는 순수 함수가 담당하므로, 드라이버는 필터링된 행만 돌려주면 된다 */
  query(filters: {
    pageId?: string;
    from?: string;
    to?: string;
    device?: string;
    locale?: string;
    country?: string;
  }): Promise<AnalyticsEventRow[]>;
}

/** BUSINESS 섹션의 문의 폼 제출 기록 */
export interface InquiryRecord {
  id: string;
  createdAt: string;
  /** 어떤 폼에서 왔는가 — 'buyer' | 'distribution' | 'partnership' | 'media' 등 */
  formName: string;
  pageId: string;
  path: string;
  locale: string;
  /** 폼 필드 값 (필드 구성은 관리자가 에디터에서 정한다) */
  fields: Record<string, string>;
  /** 마케팅 귀속용 — 어느 채널에서 들어와 문의했는가 */
  utm?: Record<string, string>;
  country?: string | null;
  status: 'new' | 'read' | 'archived';
}

export interface InquiryStorage {
  readonly name: string;
  readonly readOnly: boolean;
  insert(record: InquiryRecord): Promise<InquiryRecord>;
  list(filters?: { formName?: string; limit?: number }): Promise<InquiryRecord[]>;
}

/** 저장이 불가능한 환경에서 명확히 실패시키기 위한 오류 */
export class StorageReadOnlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageReadOnlyError';
  }
}
