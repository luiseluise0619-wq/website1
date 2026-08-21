import { NextResponse } from 'next/server';
import { deletePage, getPageById } from '@/lib/server/pageStore';
import { assertAdmin } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const page = await getPageById(params.id);
  if (!page) return NextResponse.json({ error: '페이지를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json({ page });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = assertAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await deletePage(params.id);
  return NextResponse.json({ ok: true });
}
