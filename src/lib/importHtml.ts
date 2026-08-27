import { DEFAULT_LOCALE } from '@/lib/i18n';
import { sanitizeEmbedHtml, sanitizeHtml } from '@/lib/sanitize';
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
 *
 * 정화는 여기서도 한 번 한다. 신뢰 경계는 여전히 서버(저장 시점)지만,
 * 가져온 HTML 은 저장하기 전에 이미 편집 캔버스에서 그려진다 —
 * <img onerror=…> 하나면 관리자 자신의 세션에서 실행된다. 게다가 저장 때
 * 잘려 나갈 것을 미리 보여 주면 "가져올 땐 있었는데 저장하니 사라졌다"가
 * 생긴다. 들여오는 순간 서버와 같은 규칙을 적용해 둘을 일치시킨다.
 * ========================================================================== */

export interface ImportOptions {
  /** 가져온 문구가 어느 언어인지 — 번역 원문이 된다 */
  locale?: LocaleCode;
  /**
   * 블록 종류별 기본 props (puckConfig 의 defaultProps).
   *
   * Puck 은 에디터에서만 기본값을 채워 넣고 <Render> 에서는 채우지 않는다.
   * 그래서 기본값 없이 만든 블록은 캔버스에서는 멀쩡한데 공개 사이트에서는
   * 서식이 빠진 채 나온다(가져온 문단이 캔버스에서만 36px 굵게 보이는 등).
   * 만들 때 함께 박아 두면 두 화면이 같아진다.
   */
  defaults?: Record<string, Record<string, unknown>>;
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

/**
 * 유튜브/비메오 iframe → Video 블록의 provider + source.
 *
 * Video 블록은 provider 와 source 를 둘 다 요구한다. 주소만 넣으면
 * toEmbedUrl 이 undefined 를 trim 하다 터져 캔버스가 통째로 죽는다.
 */
function videoProps(el: Element): { provider: 'youtube' | 'vimeo'; source: string } | null {
  const src = el.getAttribute('src') ?? '';
  if (/vimeo\.com/i.test(src)) return { provider: 'vimeo', source: src };
  if (/youtube\.com|youtu\.be/i.test(src)) return { provider: 'youtube', source: src };
  return null;
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

  /** 종류별 기본값을 깔고 그 위에 우리가 읽어낸 값을 얹는다 */
  const make = (type: string, props: Record<string, unknown>): PuckBlock => ({
    type,
    props: { ...(options.defaults?.[type] ?? {}), ...props } as PuckBlock['props'],
  });

  /**
   * 글 블록.
   *
   * style 을 반드시 직접 준다. Text 의 기본값은 '새로 놓는 제목' 을 위한 것이라
   * 36px 굵게가 박혀 있어서, 그대로 두면 가져온 본문 문단이 전부 제목 크기로
   * 나온다. 비워 두면 제목 태그는 TextBlock 의 태그별 기본 서식을 따르고,
   * 본문은 페이지 기본 글꼴을 그대로 쓴다 — 원본에 가장 가깝다.
   */
  const textBlock = (tag: string, value: string, extra: Record<string, unknown> = {}) =>
    make('Text', { id: nextId(), tag, html: localized(value, locale), style: { color: '#111827' }, ...extra });

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
      return textBlock(tag.toLowerCase(), sanitizeHtml(el.innerHTML.trim()), { name: value.slice(0, 40) });
    }

    if (RICH_TAGS.has(tag)) {
      const value = text(el);
      if (!value) return null;
      blocks++;
      return textBlock('p', sanitizeHtml(el.innerHTML.trim()));
    }

    if (tag === 'IMG') {
      const src = el.getAttribute('src');
      if (!src) return null;
      images++;
      blocks++;
      return make('Image', {
        id: nextId(),
        src,
        alt: localized(el.getAttribute('alt') ?? '', locale),
        style: { width: '100%' },
      });
    }

    if (tag === 'A') {
      const href = el.getAttribute('href') ?? '';
      const label = text(el);
      /* 글자 없이 그림만 감싼 링크(로고·배너)가 흔하다. 여기서 null 을
         돌려주면 그 그림이 통째로 사라진다 — 안의 그림을 꺼내 온다. */
      if (!label) {
        const img = el.querySelector('img');
        return img ? toBlock(img) : null;
      }
      blocks++;
      /* 버튼처럼 생긴 링크만 Button 으로. 본문 속 링크까지 버튼으로 만들면
         문단이 버튼 더미로 쪼개져 원문을 알아볼 수 없게 된다. */
      if (looksLikeButton(el)) {
        return make('Button', {
          id: nextId(),
          label: localized(label, locale),
          action: href ? { type: 'navigate', value: href } : { type: 'none' },
        });
      }
      return textBlock('p', sanitizeHtml(el.outerHTML.trim()));
    }

    if (tag === 'HR') {
      blocks++;
      return make('Divider', { id: nextId(), orientation: 'horizontal' });
    }

    if (tag === 'IFRAME') {
      const video = videoProps(el);
      if (video) {
        blocks++;
        return make('Video', { id: nextId(), ...video, controls: true });
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
    const hasMedia = el.matches(MEDIA) || el.querySelector(MEDIA);
    if (!text(el).length && !hasMedia) return null;

    /* 서버가 저장할 때 쓰는 것과 같은 규칙 — 허용 밖 iframe 출처와
       onerror 같은 실행 경로가 여기서 이미 떨어져 나간다. */
    const safe = sanitizeEmbedHtml(raw);
    /* 껍데기만 남았는지 본다.
       정화 목록에 svg·video·audio 가 없어서 <div><svg…></div> 는 '<div></div>'
       가 되는데, 그것을 Embed 로 세면 요약은 "원본 그대로 1개" 라고 말하지만
       실제 내용은 사라진 상태다. 남은 것이 글도 미디어도 아니면 보존이 아니다. */
    const kept = safe.trim();
    const keptSomething = kept && (/<(img|iframe|video|audio|svg|canvas|embed|object)\b/i.test(kept) || text(el).length > 0);
    if (kept && keptSomething) {
      embedded++;
      blocks++;
      return make('Embed', { id: nextId(), html: safe });
    }
    if (hasMedia && !text(el).length) {
      notes.push('그림·영상 일부는 안전 목록에 없어 가져오지 못했습니다 (svg 등).');
      return null;
    }

    /* 정화하고 나니 마크업이 통째로 사라진 경우(사용자 정의 태그 등).
       글이 남아 있으면 버리지 않고 Text 로 건진다 — 태그는 포기하되 내용은
       지킨다. 그냥 null 을 돌려주면 붙여넣은 문장이 소리 없이 사라진다. */
    const inner = text(el);
    if (!inner) return null;
    blocks++;
    return textBlock('p', sanitizeHtml(inner));
  };

  /** 자식들을 훑어 블록 목록을 만든다 (껍데기는 뚫고 들어간다) */
  const collect = (parent: Element): PuckBlock[] => {
    const out: PuckBlock[] = [];

    /* children 만 돌면 요소 옆에 놓인 맨 텍스트를 잃는다.
       <div>바깥 문장 <p>안쪽</p></div> 에서 '바깥 문장'이 소리 없이 사라졌다. */
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === 3 /* TEXT_NODE */) {
        const value = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!value) continue;
        blocks++;
        out.push(textBlock('p', sanitizeHtml(value)));
        continue;
      }
      if (node.nodeType !== 1 /* ELEMENT_NODE */) continue;
      const el = node as Element;
      const tag = el.tagName.toUpperCase();

      if (DROPPED_TAGS.has(tag)) {
        if (tag === 'SCRIPT') notes.push('<script> 는 가져오지 않았습니다 (보안).');
        else if (tag === 'STYLE' || tag === 'LINK') notes.push('바깥 스타일시트는 가져오지 않았습니다 — 서식이 달라 보일 수 있습니다.');
        continue;
      }

      const block = toBlock(el);
      if (block) {
        out.push(block);
        continue;
      }

      if (WRAPPERS.has(tag)) {
        const inner = collect(el);
        if (inner.length) {
          out.push(...inner);
          continue;
        }
        // 안에서 아무것도 못 건졌으면 통째로 원본 보존
      }

      const embed = toEmbed(el);
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
    make('Container', {
      id: containerId,
      name: '가져온 내용',
      layoutMode: 'flex',
      style: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%' },
    }),
  ];
  /* Container 의 자식 존 이름은 'items' 다 (Section 만 'content').
     'content' 로 넣으면 저장은 되지만 화면에는 아무것도 나오지 않는다 —
     가져오기가 조용히 실패한 것처럼 보인다. */
  zones[`${containerId}:${CONTAINER_ZONE}`] = collected;

  const data: PuckPageData = {
    root: { props: {} },
    content: [
      make('Section', {
        id: sectionId,
        name: '가져온 HTML',
        style: { padding: { top: 48, bottom: 48, left: 24, right: 24 } },
      }),
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
 * 이 문서가 '종이 한 장'인가 — 맨 위가 자유 캔버스 하나뿐.
 * 종이에는 섹션이라는 칸이 없으므로 가져오기도 칸을 만들면 안 된다.
 */
function paperOf(data: PuckPageData): string | null {
  if (data.content?.length !== 1) return null;
  const only = data.content[0];
  return only.type === 'FreeCanvas' ? String(only.props.id) : null;
}

/** 종이 위에 이미 놓인 것들의 아래끝 — 새로 오는 것은 그 밑에 놓는다 */
function bottomOfPaper(layers: PuckBlock[] | undefined): number {
  let bottom = 0;
  for (const block of layers ?? []) {
    const placement = block.props.placement as { y?: number; height?: number } | undefined;
    if (!placement) continue;
    /* 높이를 안 정한 것(글처럼 내용이 정하는 것)은 알 수 없다 —
       넉넉히 잡아 겹치지 않게 한다. 정확한 자리는 끌어서 맞추면 된다. */
    bottom = Math.max(bottom, (placement.y ?? 0) + (placement.height ?? 240));
  }
  return bottom;
}

/**
 * 가져온 내용을 지금 문서 뒤에 붙인다.
 * id 가 겹치면 앞의 블록이 사라지므로, 붙이기 전에 새 id 를 부여한다.
 *
 * 종이 페이지면 섹션을 만들지 않고 종이 위에 얹는다. 예전에는 종이든
 * 아니든 섹션을 하나 붙였고, 그 순간 페이지는 '자유 캔버스 하나'가 아니게
 * 되어 종이이기를 그만뒀다 — 아래 버튼이 [＋ 섹션 추가] 로 돌아가고,
 * 없앴던 칸 개념이 가져오기 한 번으로 되살아났다.
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

  const paperId = paperOf(current);
  if (paperId) {
    /* 가져온 것은 '섹션 하나 → 그 안에 컨테이너 하나' 모양이다.
       종이에서는 섹션 껍데기를 벗기고, 안의 컨테이너를 종이 위에 놓는다. */
    const importedSection = content[0];
    const sectionZone = importedSection ? `${String(importedSection.props.id)}:content` : null;
    const inner = sectionZone ? zones[sectionZone] : undefined;

    if (inner?.length) {
      const layersKey = `${paperId}:layers`;
      const y = bottomOfPaper(zones[layersKey]) + 60;

      const placed = inner.map((block, i) => ({
        ...block,
        props: {
          ...block.props,
          /* 세로로 나란히 — 한 자리에 겹쳐 놓으면 무엇이 왔는지 볼 수 없다 */
          placement: { x: 80, y: y + i * 320, width: 1120 },
        },
      }));

      delete zones[sectionZone as string];
      zones[layersKey] = [...(zones[layersKey] ?? []), ...placed];

      /* 종이는 내용에 맞춰 저절로 늘어나지만, 최소 길이도 함께 올려 둔다 —
         가져온 뒤 아래가 잘려 보이지 않게. */
      const paperBlock = current.content[0];
      const grown = Math.max(
        Number(paperBlock.props.height) || 640,
        y + placed.length * 320 + 120,
      );

      return {
        root: current.root,
        content: [{ ...paperBlock, props: { ...paperBlock.props, height: grown } }],
        zones,
      };
    }
  }

  return {
    root: current.root,
    content: [...current.content, ...content],
    zones,
  };
}
