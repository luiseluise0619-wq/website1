import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/* 로컬 개발과 자체 서버 배포가 쓰는 드라이버. 저장이 조용히 실패하면
   에디터에서 한 작업이 통째로 사라지므로 실제 디스크에 대고 검증한다. */

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ksoho-fs-'));
  process.env.PAGE_STORE_DIR = dir;
  process.env.ANALYTICS_STORE_DIR = dir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.PAGE_STORE_DIR;
  delete process.env.ANALYTICS_STORE_DIR;
});

async function driver() {
  return import('@/lib/server/storage/fsDriver');
}

function page(id: string, partial: Record<string, unknown> = {}) {
  return {
    id,
    path: `/${id}`,
    title: id,
    status: 'draft',
    revision: 1,
    sourceLocale: 'ko',
    seo: { title: { ko: id } },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: { root: { props: {} }, content: [], zones: {} },
    ...partial,
  } as never;
}

describe('fsPageStorage', () => {
  it('빈 저장소는 시드를 돌려준다 (첫 실행에도 사이트가 비어 보이지 않게)', async () => {
    const { fsPageStorage } = await driver();
    const pages = await fsPageStorage.listPages();
    expect(pages.length).toBeGreaterThan(30);
    expect(pages.some((p) => p.path === '/')).toBe(true);
  });

  it('저장한 페이지를 id·경로로 다시 찾는다', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.savePage(page('new-page'));
    expect((await fsPageStorage.getPageById('new-page'))?.title).toBe('new-page');
    expect((await fsPageStorage.getPageByPath('/new-page'))?.id).toBe('new-page');
  });

  it('경로를 정규화해 조회한다 (뒤 슬래시·대소문자 흔들림 방지)', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.savePage(page('norm', { path: 'brand/new-line/' }));
    expect((await fsPageStorage.getPageByPath('/brand/new-line'))?.id).toBe('norm');
  });

  it('같은 id 로 다시 저장하면 덮어쓴다 (중복 행이 생기지 않는다)', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.savePage(page('dup', { title: '처음' }));
    await fsPageStorage.savePage(page('dup', { title: '나중' }));
    const all = await fsPageStorage.listPages();
    expect(all.filter((p) => p.id === 'dup')).toHaveLength(1);
    expect((await fsPageStorage.getPageById('dup'))?.title).toBe('나중');
  });

  it('다른 페이지가 쓰는 경로는 거부한다 (조용히 덮어써 페이지를 잃지 않게)', async () => {
    const { fsPageStorage } = await driver();
    await expect(fsPageStorage.savePage(page('침입자', { path: '/brand/beauty' }))).rejects.toThrow(/이미 사용 중/);
  });

  it('여러 건 저장은 덮어쓰기가 아니라 병합이다 (안 보낸 페이지가 사라지면 안 된다)', async () => {
    const { fsPageStorage } = await driver();
    const before = await fsPageStorage.listPages();

    await fsPageStorage.saveAll([page('bulk1'), page('bulk2')]);

    const after = await fsPageStorage.listPages();
    expect(after.length).toBe(before.length + 2);
    expect(after.find((p) => p.id === 'bulk1')).toBeTruthy();
    // 시드 페이지가 그대로 남아 있어야 한다
    expect(after.some((p) => p.path === '/brand/beauty')).toBe(true);
  });

  it('여러 건 저장에서 같은 id 는 갱신된다', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.saveAll([page('dup2', { title: '처음' })]);
    await fsPageStorage.saveAll([page('dup2', { title: '나중' })]);
    const all = await fsPageStorage.listPages();
    expect(all.filter((p) => p.id === 'dup2')).toHaveLength(1);
    expect((await fsPageStorage.getPageById('dup2'))?.title).toBe('나중');
  });

  it('삭제하면 목록에서 사라진다', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.savePage(page('gone'));
    await fsPageStorage.deletePage('gone');
    expect(await fsPageStorage.getPageById('gone')).toBeNull();
  });

  it('프로세스를 새로 띄워도 남아 있다 (모듈 캐시가 아니라 디스크에 쓴다)', async () => {
    const { fsPageStorage } = await driver();
    await fsPageStorage.savePage(page('persisted'));

    vi.resetModules();
    const again = await driver();
    expect((await again.fsPageStorage.getPageById('persisted'))?.id).toBe('persisted');
  });
});

describe('fsInquiryStorage', () => {
  const record = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    createdAt: new Date().toISOString(),
    formName: 'buyer',
    pageId: 'p',
    path: '/business/buyer-inquiry',
    locale: 'ko',
    fields: { company: id },
    status: 'new' as const,
    ...extra,
  });

  it('접수 순서의 역순(최신 먼저)으로 돌려준다', async () => {
    const { fsInquiryStorage } = await driver();
    await fsInquiryStorage.insert(record('a'));
    await fsInquiryStorage.insert(record('b'));
    expect((await fsInquiryStorage.list()).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('폼 이름으로 거르고 개수를 제한한다', async () => {
    const { fsInquiryStorage } = await driver();
    await fsInquiryStorage.insert(record('a'));
    await fsInquiryStorage.insert(record('m', { formName: 'media' }));
    expect((await fsInquiryStorage.list({ formName: 'media' })).map((r) => r.id)).toEqual(['m']);
    expect(await fsInquiryStorage.list({ limit: 1 })).toHaveLength(1);
  });

  it('상태를 바꾸면 파일에 반영되고 나머지 기록은 남는다', async () => {
    const { fsInquiryStorage } = await driver();
    await fsInquiryStorage.insert(record('a'));
    await fsInquiryStorage.insert(record('b'));

    const updated = await fsInquiryStorage.updateStatus('a', 'archived');
    expect(updated?.status).toBe('archived');

    const all = await fsInquiryStorage.list();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === 'a')?.status).toBe('archived');
    expect(all.find((r) => r.id === 'b')?.status).toBe('new');
  });

  it('없는 id 는 null 이고 파일을 건드리지 않는다', async () => {
    const { fsInquiryStorage } = await driver();
    await fsInquiryStorage.insert(record('a'));
    expect(await fsInquiryStorage.updateStatus('없음', 'read')).toBeNull();
    expect(await fsInquiryStorage.list()).toHaveLength(1);
  });

  it('깨진 줄이 섞여 있어도 나머지를 읽는다', async () => {
    const { fsInquiryStorage } = await driver();
    await fsInquiryStorage.insert(record('a'));
    await fs.appendFile(path.join(dir, 'inquiries.ndjson'), '{깨진 JSON\n', 'utf8');
    await fsInquiryStorage.insert(record('b'));
    expect((await fsInquiryStorage.list()).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('fsAnalyticsStorage', () => {
  const event = (extra: Record<string, unknown> = {}) => ({
    eventId: Math.random().toString(36).slice(2),
    type: 'page_view',
    ts: Date.now(),
    receivedAt: new Date().toISOString(),
    day: '2026-08-22',
    pageId: 'page_home',
    path: '/',
    locale: 'ko',
    sessionId: 's1',
    anonymousId: 'a1',
    deviceType: 'desktop',
    payload: {},
    ...extra,
  });

  it('넣은 만큼 세고 필터로 다시 찾는다', async () => {
    const { fsAnalyticsStorage } = await driver();
    expect(await fsAnalyticsStorage.insert([event(), event({ locale: 'en' })] as never)).toBe(2);
    expect(await fsAnalyticsStorage.query({ locale: 'en' })).toHaveLength(1);
    expect(await fsAnalyticsStorage.query({ pageId: 'page_home' })).toHaveLength(2);
    expect(await fsAnalyticsStorage.query({ pageId: '없는페이지' })).toHaveLength(0);
  });

  it('같은 이벤트를 다시 보내도 한 번만 적재한다 (비콘 재전송)', async () => {
    const { fsAnalyticsStorage } = await driver();
    const e = event({ eventId: 'dup-1' });
    expect(await fsAnalyticsStorage.insert([e] as never)).toBe(1);
    expect(await fsAnalyticsStorage.insert([e] as never)).toBe(0);
    expect(await fsAnalyticsStorage.query({})).toHaveLength(1);
  });

  it('이벤트가 하나도 없으면 빈 배열 (파일이 없어도 던지지 않는다)', async () => {
    const { fsAnalyticsStorage } = await driver();
    expect(await fsAnalyticsStorage.query({})).toEqual([]);
  });
});
