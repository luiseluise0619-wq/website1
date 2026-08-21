import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/editor/LoginForm';
import { authDisabledForDev, isAdminRequest, isAuthConfigured } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: '관리자 로그인' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  // 이미 인증된 세션이면 곧장 에디터로 보낸다
  if (isAdminRequest() && isAuthConfigured()) redirect(searchParams.next ?? '/admin/editor');
  if (authDisabledForDev()) redirect(searchParams.next ?? '/admin/editor');

  return <LoginForm next={searchParams.next ?? '/admin/editor'} configured={isAuthConfigured()} />;
}
