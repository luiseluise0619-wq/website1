import { DEFAULT_LOCALE } from '@/lib/i18n';
import type { LocaleCode, PuckBlock, PuckPageData } from '@/types/schema';

/* =============================================================================
 * HTML 가져오기 — 남의 HTML 을 우리 블록으로 바꾼다
 * -----------------------------------------------------------------------------
 * 목적은 '완벽한 재현'이 아니라 '고칠 수 있는 상태로 들여오기'다.
 * 알아보는 것은 진짜 블록(Text·Image·Button·Video·Divider)으로 바꿔 인스펙터로
 * 편집·번역할 수 있게 하고, 못 알아보는 것은 Embed 로 원본 그대로 남긴다.
 *
 * 통째로 Embed 하나에 넣어 버리면 "가져와졌다"는 말은 성립하지만 아무것도
 * 고칠 수 없다 — 그러면 가져올 이유가 없다. 반대로 전부 블록으로 바꾸려 들면
 * 알 수 없는 마크업에서 내용을 잃는다. 그 중간을 택한다.
 *
 * 배치는 흐름(Container flex column)으로 들여온다. 자유 배치는 좌표가 필요한데
 * 남의 HTML 에는 그런 정보가 없어, 좌표를 지어내면 화면이 무너진다.
 * ========================================================================== */

export interface ImportOptions {
  /** 가져온 문구가 어느 언어인지 — 번역 원문이 된다 */
  locale?: LocaleCode;
  /** 테스트·서버에서 DOM 을 주입하기 위한 구멍 (기본: 브라우저 DOMParser) */
  parseDocument?: (html: string) => Document;
}

export interface ImportResult {
  data: PuckPageData;
  /** 화면에 그대로 보여 줄 요약 — 무엇이 블록이 되고 무엇이 원본으로 남았는지 */
  summary: {
    sections: number;
    blocks: number;
    /** 알아보지 못해 원본 HTML 로 남긴 개수 */
    embedded: number;
    images: number;
    /** 사람이 알아야 하는 것들 (스크립트 제거 등) */
    notes: string[];
  };
}

/** 내용이 없는 것으로 보는 태그 — 가져와도 화면에 아무 일도 하지 않는다 */
const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'BASE', 'TITLE']);

/** 그대로 한 덩어리 글로 들여오는 태그 (안쪽 서식을 살린다) */
const RICH_TAGS = new Set(['P', 'BLOCKQUOTE', 'UL', 'OL', 'PRE', 'FIGCAPTION', 'SPAN', 'STRONG', 'EM', 'SMALL']);

const HEADINGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Container 블록이 렌더하는 자식 존 이름 (src/puck/blocks/index.tsx) */
const CONTAINER_ZONE = 'items';

/** 안을 들여다봐야 하는 껍데기 태그 */
const WRAPPERS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV',
  'FIGURE', 'PICTURE', 'CENTER', 'FORM', 'TBODY', 'TR', 'TD', 'TH', 'TABLE', 'LI',
]);

/** 버튼처럼 보이는 링크인가 — 클래스 이름이 가장 믿을 만한 단서다 */
function looksLikeButton(el: Element): boolean {
  const cls = (el.getAttribute('class') ?? '').toLowerCase();
  if (/\b(btn|button|cta)\b/.test(cls)) return true;
  const role = el.getAttribute('role');
  return role === 'button';
}

/** 유튜브/비메오 iframe 은 Video 블록으로 (그래야 인스펙터에서 주소를 바꿀 수 있다) */
function videoSrc(el: Element): string | null {
  const src = el.getAttribute('src') ?? '';
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(src) ? src : null;
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 가져온 문구는 원문 언어 한 칸에만 넣는다 — 나머지는 자동번역이 채운다 */
function localized(value: string, locale: LocaleCode) {
  return { [locale]: value };
}

/**
 * 기본 파서. 브라우저에서만 쓸 수 있으므로 없으면 분명히 알린다
 * (조용히 빈 페이지를 돌려주면 "가져왔는데 아무것도 없다"가 된다).
 */
function defaultParse(html: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new Error('HTML 을 해석할 수 없는 환경입니다 (DOMParser 없음).');
  }
  return new DOMParser().parseFromString(html, 'text/html');
}

export function htmlToPage(html: string, options: ImportOptions = {}): ImportResult {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const parse = options.parseDocument ?? defaultParse;
  const doc = parse(html);

  let counter = 0;
  const nextId = () => `imp${(counter += 1)}`;

  const notes: string[] = [];
  let embedded = 0;
  let images = 0;
  let blocks = 0;

  const zones: Record<string, PuckBlock[]> = {};

  /** 한 요소를 블록으로. 못 알아보면 null 을 돌려주고 부모가 Embed 로 감싼다 */
  const toBlock = (el: Element): PuckBlock | null => {
    const tag = el.tagName.toUpperCase();

    if (HEADINGS.has(tag)) {
      const value = text(el);
      if (!value) return null;
      blocks++;
      return {
        type: 'Text',
        props: { id: nextId(), tag: tag.toLowerCase(), html: localized(el.innerHTML.trim(), locale), name: value.slice(0, 40) },
      };
    }

    if (RICH_TAGS.has(tag)) {
      const value = text(el);
      if (!value) return null;
      blocks++;
      return {
        type: 'Text',
        props: { id: nextId(), tag: 'p', html: localized(el.innerHTML.trim(), locale) },
      };
    }

    if (tag === 'IMG') {
      const src = el.getAttribute('src');
      if (!src) return null;
      images++;
      blocks++;
      return {
        type: 'Image',
        props: {
          id: nextId(),
          src,
          alt: localized(el.getAttribute('alt') ?? '', locale),
          style: { width: '100%' },
        },
      };
    }

    if (tag === 'A') {
      const href = el.getAttribute('href') ?? '';
      const label = text(el);
      if (!label) return null;
      blocks++;
      /* 버튼처럼 생긴 링크만 Button 으로. 본문 속 링크까지 버튼으로 만들면
         문단이 버튼 더미로 쪼개져 원문을 알아볼 수 없게 된다. */
      if (looksLikeButton(el)) {
        return {
          type: 'Button',
          props: {
            id: nextId(),
            label: localized(label, locale),
            action: href ? { type: 'navigate', value: href } : { type: 'none' },
          },
        };
      }
      return { type: 'Text', props: { id: nextId(), tag: 'p', html: localized(el.outerHTML.trim(), locale) } };
    }

    if (tag === 'HR') {
      blocks++;
      return { type: 'Divider', props: { id: nextId(), orientation: 'horizontal' } };
    }

    if (tag === 'IFRAME') {
      const src = videoSrc(el);
      if (src) {
        blocks++;
        return { type: 'Video', props: { id: nextId(), src } };
      }
      return null; // 그 밖의 iframe 은 Embed 로
    }

    if (tag === 'BR') return null;
    return null;
  };

  /** 못 알아본 요소를 원본 그대로 남긴다 */
  const toEmbed = (el: Element): PuckBlock | null => {
    const raw = el.outerHTML.trim();
    if (!raw) return null;
    /* 글자도 이미지도 없는 껍데기는 버린다 — 빈 Embed 가 쌓이면 편집 화면이
       정체 모를 상자로 가득 찬다.
       자기 자신이 미디어인 경우도 봐야 한다: 지도 iframe 은 글자가 없고
       자손에도 미디어가 없어서, 자손만 확인하면 통째로 사라졌다. */
    const MEDIA = 'img, iframe, video, audio, svg, canvas, embed, object';
    if (!text(el).length && !el.matches(MEDIA) && !el.querySelector(MEDIA)) return null;
    embedded++;
    blocks++;
    return { type: 'Embed', props: { id: nextId(), html: raw } };
  };

  /** 자식들을 훑어 블록 목록을 만든다 (껍데기는 뚫고 들어간다) */
  const collect = (parent: Element): PuckBlock[] => {
    const out: PuckBlock[] = [];

    for (const node of Array.from(parent.children)) {
      const tag = node.tagName.toUpperCase();

      if (DROPPED_TAGS.has(tag)) {
        if (tag === 'SCRIPT') notes.push('<script> 는 가져오지 않았습니다 (보안).');
        else if (tag === 'STYLE' || tag === 'LINK') notes.push('바깥 스타일시트는 가져오지 않았습니다 — 서식이 달라 보일 수 있습니다.');
        continue;
      }

      const block = toBlock(node);
      if (block) {
        out.push(block);
        continue;
      }

      if (WRAPPERS.has(tag)) {
        const inner = collect(node);
        if (inner.length) {
          out.push(...inner);
          continue;
        }
        // 안에서 아무것도 못 건졌으면 통째로 원본 보존
      }

      const embed = toEmbed(node);
      if (embed) out.push(embed);
    }

    return out;
  };

  const body = doc.body ?? doc.documentElement;
  const collected = body ? collect(body) : [];

  /* 섹션 하나에 담는다. 남의 HTML 은 어디가 '섹션'인지 알 수 없고, 억지로
     쪼개면 나중에 합치는 것보다 나누는 쪽이 훨씬 번거롭다. */
  const sectionId = nextId();
  const containerId = nextId();

  zones[`${sectionId}:content`] = [
    {
      type: 'Container',
      props: {
        id: containerId,
        name: '가져온 내용',
        layoutMode: 'flex',
        style: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%' },
      },
    },
  ];
  /* Container 의 자식 존 이름은 'items' 다 (Section 만 'content').
     'content' 로 넣으면 저장은 되지만 화면에는 아무것도 나오지 않는다 —
     가져오기가 조용히 실패한 것처럼 보인다. */
  zones[`${containerId}:${CONTAINER_ZONE}`] = collected;

  const data: PuckPageData = {
    root: { props: {} },
    content: [
      {
        type: 'Section',
        props: { id: sectionId, name: '가져온 HTML', style: { padding: { top: 48, bottom: 48, left: 24, right: 24 } } },
      },
    ],
    zones,
  };

  if (!collected.length) {
    notes.push('가져올 내용을 찾지 못했습니다 — 본문(<body>)이 비어 있는 HTML 인지 확인하세요.');
  }

  return {
    data,
    summary: {
      sections: 1,
      blocks,
      embedded,
      images,
      notes: notes.filter((n, i) => notes.indexOf(n) === i),
    },
  };
}

/**
 * 가져온 내용을 지금 문서 뒤에 붙인다.
 * id 가 겹치면 앞의 블록이 사라지므로, 붙이기 전에 새 id 를 부여한다.
 */
export function appendImported(current: PuckPageData, imported: PuckPageData): PuckPageData {
  const used = new Set<string>();
  const walk = (blocks: PuckBlock[] | undefined) => {
    for (const b of blocks ?? []) used.add(String(b.props.id));
  };
  walk(current.content);
  for (const list of Object.values(current.zones ?? {})) walk(list);

  const rename = new Map<string, string>();
  let n = 0;
  const uniqueId = (id: string) => {
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
    let next = `${id}_${(n += 1)}`;
    while (used.has(next)) next = `${id}_${(n += 1)}`;
    used.add(next);
    rename.set(id, next);
    return next;
  };

  const remapBlocks = (blocks: PuckBlock[]): PuckBlock[] =>
    blocks.map((b) => ({ ...b, props: { ...b.props, id: uniqueId(String(b.props.id)) } }));

  const content = remapBlocks(imported.content);
  const zones: Record<string, PuckBlock[]> = { ...(current.zones ?? {}) };
  for (const [key, list] of Object.entries(imported.zones ?? {})) {
    /* zone 키는 '소유자id:존이름' 이다 — 소유자 id 를 바꿨으면 키도 따라가야
       한다. 안 그러면 컨테이너는 새 id 인데 내용은 옛 키에 남아 빈 상자가 된다. */
    const [owner, zone] = key.split(':');
    const nextKey = `${rename.get(owner) ?? owner}:${zone}`;
    zones[nextKey] = remapBlocks(list);
  }

  return {
    root: current.root,
    content: [...current.content, ...content],
    zones,
  };
}
