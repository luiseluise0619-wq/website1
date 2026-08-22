import { redirect } from 'next/navigation';
import { EditorShell } from '@/components/editor/EditorShell';
import { listPages } from '@/lib/server/pageStore';
import { isAdminRequest } from '@/lib/server/auth';
import { inquiryStorage, storageStatus } from '@/lib/server/storage';

/* 에디터는 항상 최신 문서를 읽어야 하므로 캐시하지 않는다 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '캔버스 에디터' };

export default async function EditorPage() {
  // 미들웨어는 쿠키 존재만 확인한다 — 서명 검증은 Node 런타임인 여기서 한다
  if (!isAdminRequest()) redirect('/admin/login?next=/admin/editor');

  const pages = await listPages();

  /* 새 문의가 와도 /admin/inquiries 를 열어보기 전에는 알 수가 없다.
     상단 [문의] 버튼에 미확인 건수를 띄워 준다. 저장소가 없으면 0. */
  const inquiries = await inquiryStorage.list({ limit: 200 }).catch(() => []);
  const newInquiries = inquiries.filter((i) => i.status === 'new').length;

  return <EditorShell initialPages={pages} storage={storageStatus()} newInquiries={newInquiries} />;
}
