import { EditorShell } from '@/components/editor/EditorShell';
import { listPages } from '@/lib/server/pageStore';

/* 에디터는 항상 최신 문서를 읽어야 하므로 캐시하지 않는다 */
export const dynamic = 'force-dynamic';

export const metadata = { title: '캔버스 에디터' };

export default async function EditorPage() {
  const pages = await listPages();
  return <EditorShell initialPages={pages} />;
}
