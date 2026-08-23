import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TranslationError, cleanLlmOutput, providerStatus, translate } from '@/lib/translate/providers';

/* =============================================================================
 * 무료·오픈소스 번역 경로(LibreTranslate / Ollama)를 실제 HTTP 로 확인한다.
 * 목 서버를 진짜로 띄워서 요청 본문까지 검사해야 "코드는 맞는데 필드 이름이
 * 틀려서 안 되는" 종류의 오류를 잡을 수 있다.
 * ========================================================================== */

interface Recorded {
  url: string;
  body: Record<string, unknown>;
}

const recorded: Recorded[] = [];
let server: Server;
let origin: string;
/** 다음 요청에 서버가 어떻게 답할지 — 테스트마다 갈아 끼운다 */
let handler: (body: Record<string, unknown>, url: string) => { status?: number; json: unknown };

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      recorded.push({ url: req.url ?? '', body });
      const out = handler(body, req.url ?? '');
      res.writeHead(out.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const ENV_KEYS = [
  'TRANSLATION_PROVIDER', 'DEEPL_API_KEY', 'DEEPL_API_URL',
  'GOOGLE_TRANSLATE_API_KEY', 'GOOGLE_TRANSLATE_API_URL',
  'LIBRETRANSLATE_URL', 'LIBRETRANSLATE_API_KEY',
  'OLLAMA_URL', 'OLLAMA_MODEL', 'TOLGEE_API_URL', 'TOLGEE_API_KEY',
];

/** 개발자 로컬 .env 값이 테스트에 새어 들어오지 않게 매번 지운다 */
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  recorded.length = 0;
});
for (const k of ENV_KEYS) delete process.env[k];

describe('LibreTranslate — 키 없이 셀프호스팅으로 쓰는 경로', () => {
  it('배열 요청을 한 번에 보내고 순서대로 돌려받는다', async () => {
    process.env.LIBRETRANSLATE_URL = origin;
    handler = (body) => ({
      json: { translatedText: (body.q as string[]).map((t) => `TH:${t}`) },
    });

    const out = await translate({ texts: ['안녕', '문의하기'], source: 'ko', target: 'th' });
    expect(out).toEqual({ texts: ['TH:안녕', 'TH:문의하기'], provider: 'libretranslate' });
    expect(recorded[0].url).toBe('/translate');
    expect(recorded[0].body).toMatchObject({ source: 'ko', target: 'th', format: 'text' });
  });

  it('DeepL 이 못 하는 태국어·베트남어를 대신 처리한다', async () => {
    process.env.DEEPL_API_KEY = 'dummy';
    process.env.DEEPL_API_URL = `${origin}/deepl`;
    process.env.LIBRETRANSLATE_URL = origin;
    handler = (_body, url) => {
      if (url.startsWith('/deepl')) throw new Error('DeepL 은 호출되면 안 된다');
      return { json: { translatedText: ['Xin chào'] } };
    };

    const out = await translate({ texts: ['안녕'], source: 'ko', target: 'vi' });
    expect(out.provider).toBe('libretranslate');
    // deeplCode 가 null 이라 네트워크를 아예 타지 않는다
    expect(recorded.map((r) => r.url)).toEqual(['/translate']);
  });

  it('HTML 요소는 format:html 로 보내 태그를 보존한다', async () => {
    process.env.LIBRETRANSLATE_URL = `${origin}/`; // 끝의 슬래시도 허용
    handler = () => ({ json: { translatedText: ['<b>Bold</b> body'] } });

    await translate({ texts: ['<b>굵은</b> 본문'], source: 'ko', target: 'en', html: true });
    expect(recorded[0].url).toBe('/translate');
    expect(recorded[0].body.format).toBe('html');
  });

  it('API 키를 설정하면 함께 보낸다 (공개 인스턴스용)', async () => {
    process.env.LIBRETRANSLATE_URL = origin;
    process.env.LIBRETRANSLATE_API_KEY = 'lt-key';
    handler = () => ({ json: { translatedText: ['Hello'] } });

    await translate({ texts: ['안녕'], source: 'ko', target: 'en' });
    expect(recorded[0].body.api_key).toBe('lt-key');
  });

  it('단건 응답이 문자열로 와도 배열로 정규화한다', async () => {
    process.env.LIBRETRANSLATE_URL = origin;
    handler = () => ({ json: { translatedText: 'Hello' } });
    expect((await translate({ texts: ['안녕'], source: 'ko', target: 'en' })).texts).toEqual(['Hello']);
  });

  it('응답 개수가 어긋나면 조용히 밀려 쓰지 않고 실패한다', async () => {
    process.env.LIBRETRANSLATE_URL = origin;
    handler = () => ({ json: { translatedText: ['A'] } });
    await expect(translate({ texts: ['1', '2'], source: 'ko', target: 'en' })).rejects.toThrow(/개수 불일치/);
  });

  it('모델이 없는 언어(400)는 미지원으로 보고 다음 제공자로 넘긴다', async () => {
    process.env.LIBRETRANSLATE_URL = origin;
    process.env.OLLAMA_URL = origin;
    handler = (_body, url) =>
      url === '/translate'
        ? { status: 400, json: { error: 'th is not supported' } }
        : { json: { message: { content: 'สวัสดี' } } };

    const out = await translate({ texts: ['안녕'], source: 'ko', target: 'th' });
    expect(out).toEqual({ texts: ['สวัสดี'], provider: 'ollama' });
  });
});

describe('Ollama — 로컬 LLM 번역', () => {
  it('문장을 한 건씩 보내 순서 대응을 지킨다', async () => {
    process.env.OLLAMA_URL = origin;
    handler = (body) => {
      const msgs = body.messages as Array<{ role: string; content: string }>;
      return { json: { message: { content: `EN:${msgs[1].content}` } } };
    };

    const out = await translate({ texts: ['하나', '둘'], source: 'ko', target: 'en' });
    expect(out).toEqual({ texts: ['EN:하나', 'EN:둘'], provider: 'ollama' });
    expect(recorded).toHaveLength(2);
    expect(recorded[0].url).toBe('/api/chat');
  });

  it('모델과 결정론적 옵션을 지정해 부른다', async () => {
    process.env.OLLAMA_URL = origin;
    process.env.OLLAMA_MODEL = 'gemma3:12b';
    handler = () => ({ json: { message: { content: 'Hello' } } });

    await translate({ texts: ['안녕'], source: 'ko', target: 'en' });
    expect(recorded[0].body).toMatchObject({ model: 'gemma3:12b', stream: false, options: { temperature: 0 } });
  });

  it('HTML 이면 태그 보존을 지시한다', async () => {
    process.env.OLLAMA_URL = origin;
    handler = () => ({ json: { message: { content: '<b>Bold</b>' } } });

    await translate({ texts: ['<b>굵은</b>'], source: 'ko', target: 'en', html: true });
    const system = (recorded[0].body.messages as Array<{ content: string }>)[0].content;
    expect(system).toMatch(/HTML fragment/);
  });

  it('본문에 error 가 담긴 200 응답도 실패로 처리한다', async () => {
    process.env.OLLAMA_URL = origin;
    handler = () => ({ json: { error: 'model "qwen2.5:7b" not found' } });
    await expect(translate({ texts: ['안녕'], source: 'ko', target: 'en' })).rejects.toThrow(/not found/);
  });
});

describe('cleanLlmOutput — LLM 이 덧붙인 껍데기 제거', () => {
  it('코드펜스를 벗긴다', () => {
    expect(cleanLlmOutput('```\nHello\n```', '안녕')).toBe('Hello');
    expect(cleanLlmOutput('```html\n<b>Hi</b>\n```', '<b>안녕</b>')).toBe('<b>Hi</b>');
  });

  it('원문에 없던 따옴표만 벗긴다', () => {
    expect(cleanLlmOutput('"Hello"', '안녕')).toBe('Hello');
    expect(cleanLlmOutput('"Hello"', '"안녕"')).toBe('"Hello"');
  });

  it('빈 응답이면 원문을 지켜 화면이 비지 않게 한다', () => {
    expect(cleanLlmOutput('   ', '안녕')).toBe('안녕');
  });

  it('멀쩡한 문장은 그대로 둔다', () => {
    expect(cleanLlmOutput('Contact us', '문의하기')).toBe('Contact us');
  });
});

describe('폴백 순서와 안내', () => {
  it('TRANSLATION_PROVIDER 로 무료 경로를 1순위로 올릴 수 있다', async () => {
    process.env.TRANSLATION_PROVIDER = 'libretranslate';
    process.env.LIBRETRANSLATE_URL = origin;
    process.env.DEEPL_API_KEY = 'dummy';
    process.env.DEEPL_API_URL = `${origin}/deepl`;
    handler = (_b, url) =>
      url === '/translate' ? { json: { translatedText: ['Hello'] } } : { json: { translations: [{ text: 'X' }] } };

    expect((await translate({ texts: ['안녕'], source: 'ko', target: 'en' })).provider).toBe('libretranslate');
    expect(recorded.map((r) => r.url)).toEqual(['/translate']);
  });

  it('유료 제공자가 죽으면 무료 제공자가 이어받는다', async () => {
    process.env.DEEPL_API_KEY = 'dummy';
    process.env.DEEPL_API_URL = `${origin}/deepl`;
    process.env.LIBRETRANSLATE_URL = origin;
    handler = (_b, url) =>
      url.startsWith('/deepl') ? { status: 456, json: { message: 'quota exceeded' } } : { json: { translatedText: ['Hello'] } };

    const out = await translate({ texts: ['안녕'], source: 'ko', target: 'en' });
    expect(out.provider).toBe('libretranslate');
  });

  it('아무것도 없으면 무료 대안을 알려 준다', async () => {
    await expect(translate({ texts: ['안녕'], source: 'ko', target: 'en' })).rejects.toMatchObject({
      unconfigured: true,
    });
    await translate({ texts: ['안녕'], source: 'ko', target: 'en' }).catch((e: TranslationError) => {
      expect(e.message).toMatch(/LIBRETRANSLATE_URL/);
      expect(e.message).toMatch(/libretranslate\/libretranslate/);
    });
  });

  it('DeepL 만 있고 미지원 언어면 무료 대안을 함께 안내한다', async () => {
    process.env.DEEPL_API_KEY = 'dummy';
    await translate({ texts: ['안녕'], source: 'ko', target: 'th' }).catch((e: TranslationError) => {
      expect(e.message).toMatch(/태국어/);
      expect(e.message).toMatch(/DeepL/);
      expect(e.message).toMatch(/LIBRETRANSLATE_URL/);
    });
    expect.assertions(3);
  });

  it('번역할 것이 없거나 같은 언어면 호출하지 않는다', async () => {
    expect(await translate({ texts: [], source: 'ko', target: 'en' })).toEqual({ texts: [], provider: 'none' });
    expect(await translate({ texts: ['안녕'], source: 'ko', target: 'ko' })).toEqual({
      texts: ['안녕'], provider: 'none',
    });
  });
});

describe('providerStatus — 설정 여부만 보고한다', () => {
  it('환경 변수 유무를 그대로 반영한다', () => {
    expect(providerStatus()).toEqual({
      deepl: false, google: false, libretranslate: false, ollama: false, tolgee: false,
    });
    process.env.LIBRETRANSLATE_URL = origin;
    process.env.OLLAMA_URL = origin;
    expect(providerStatus()).toMatchObject({ libretranslate: true, ollama: true });
  });

  it('Tolgee 는 주소와 키가 모두 있어야 설정된 것으로 본다', () => {
    process.env.TOLGEE_API_URL = origin;
    expect(providerStatus().tolgee).toBe(false);
    process.env.TOLGEE_API_KEY = 'k';
    expect(providerStatus().tolgee).toBe(true);
  });
});
