import { redirect } from 'next/navigation';
import { InquiryTable } from '@/components/admin/InquiryTable';
import { isAdminRequest } from '@/lib/server/auth';
import { inquiryStorage, storageStatus } from '@/lib/server/storage';

/* 문의는 계속 들어오므로 캐시하지 않는다 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '문의 관리' };

export default async function InquiriesPage() {
  // 미들웨어는 쿠키 존재만 확인한다 — 서명 검증은 Node 런타임인 여기서 한다
  if (!isAdminRequest()) redirect('/admin/login?next=/admin/inquiries');

  const inquiries = await inquiryStorage.list({ limit: 500 });
  return <InquiryTable initial={inquiries} storage={storageStatus()} />;
}
