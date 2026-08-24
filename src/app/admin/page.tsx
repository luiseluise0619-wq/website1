import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/server/auth';

/* =============================================================================
 * /admin — 관리 화면의 입구
 * -----------------------------------------------------------------------------
 * 이 파일이 없으면 /admin 은 동적 라우트([[...slug]])로 넘어가 "발행되지 않은
 * 페이지" 404 가 뜬다. 주소창에 /admin 을 치는 것이 가장 자연스러운 진입인데
 * 거기서 막히면 에디터로 가는 길을 찾지 못한다.
 * ========================================================================== */

export const dynamic = 'force-dynamic';

export default function AdminIndex() {
  redirect(isAdminRequest() ? '/admin/editor' : '/admin/login?next=/admin/editor');
}
