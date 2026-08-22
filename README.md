# K-SOHO GLOBAL

대한민국 소상공인 브랜드를 위한 **캔버스 기반 노코드 웹 에디터 + 동적 사이트 엔진**.
관리자가 브라우저에서 페이지를 만들고, 방문자 언어로 자동 번역하며, 어떤 요소가 클릭되고
어디서 이탈하는지 히트맵으로 확인할 수 있습니다.

```
Next.js 14 (App Router) · TypeScript · Puck · Zustand · PostHog · Tolgee/DeepL
```

## 빠른 시작

```bash
npm install
cp .env.example .env.local     # 키 없이도 에디터/사이트는 동작합니다
npm run dev                    # http://localhost:3000
```

| 주소 | 설명 |
|---|---|
| `/` | 공개 사이트 (발행된 페이지) |
| `/admin/editor` | 캔버스 에디터 |
| `/admin/inquiries` | 문의 관리 (접수 목록·상태·CSV) |
| `/global/thailand`, `/business/buyer-inquiry` … | IA 의 모든 경로가 자동 생성됨 |

데모 분석 데이터를 넣어 히트맵을 바로 확인하려면:

```bash
npm run build && npm run start &
node scripts/seed-analytics.mjs        # 합성 클릭·스크롤·이탈 이벤트 생성
# 에디터 → 상단 [히트맵 ON]
```

## 기술 선택의 근거

에디터 엔진 후보를 실제 통합 관점에서 비교한 결과입니다.

| 후보 | 판단 |
|---|---|
| **Puck** ✅ | React 컴포넌트로 **우리 앱 안에 임베드**되고, 저장 포맷이 우리가 소유하는 순수 JSON. 그래서 블록 props 에 `LocalizedText` 와 `trackingId` 를 직접 심을 수 있다 — 다국어와 히트맵이 성립하는 전제. |
| Webstudio | 훌륭한 Webflow 대체재지만 **별도로 셀프호스팅하는 Remix 앱**이다. `@webstudio-is/sdk` 는 이미 발행된 사이트의 런타임일 뿐, 캔버스를 우리 관리자 화면에 끼워 넣을 수 없다. |
| GrapesJS | 스타일 패널은 강력하나 iframe 안에서 **HTML/CSS 문자열**을 뱉는다. 요소 단위 안정 ID 와 언어별 JSON 슬롯을 유지하기 어렵다. |
| Chai Builder | 임베드 가능하고 Tailwind 친화적이지만 4.0 이 베타. |
| OpenPage | npm `openpage` 는 해당 빌더가 아님(초기 단계). |

> 원 요구사항의 **X/Y/Z 자유 배치**는 Puck 의 흐름 배치만으로는 부족하므로,
> `FreeCanvas` 블록을 직접 만들어 절대좌표 레이어를 제공합니다 (`src/puck/blocks/index.tsx`).

분석은 **PostHog**(히트맵·세션 리플레이·퍼널, 셀프호스팅 가능), 번역은 **Tolgee + DeepL/Google**.
둘 다 우리 수집·저장 계층과 **병행**합니다 — 원본 데이터를 직접 소유하기 위해서입니다.

## 아키텍처

```
                        ┌──────────────────────────────┐
   관리자 ─ /admin/editor │  EditorShell                 │
                        │   좌: PageTree (IA 매핑)      │
                        │   중: Puck 캔버스 + 히트맵     │
                        │   우: 인스펙터 / SEO / 분석    │
                        └───────────┬──────────────────┘
                                    │ PuckPageData(JSON)
                                    ▼
                        /api/pages ── sanitizePage() ── .data/pages.json
                                    │
   방문자 ─ /[[...slug]] ────────────┤
                        PageRenderer │ ① Puck <Render> 로 JSON 복원
                                     │ ② RenderCtx 로 로케일 주입
                                     │ ③ useCanvasAnalytics 로 추적
                                     ▼
        ┌────────────┬───────────────┬──────────────┬─────────┐
        │ 내부 수집   │ PostHog       │ GA4/Mixpanel │ Umami   │
        │ (배치)     │ (히트맵/리플레이)│              │         │
        └─────┬──────┴───────────────┴──────────────┴─────────┘
              ▼
   /api/analytics/collect → .data/events.ndjson
   /api/analytics/summary → 집계 → 에디터 히트맵 오버레이 · 이탈 패널
```

### 디렉터리

```
src/
├─ types/
│  ├─ schema.ts            # IA · 다국어 · 스타일 · 페이지 문서 전체 타입
│  └─ analytics.ts         # 이벤트/저장/집계 스키마 (DB DDL 주석 포함)
├─ data/navigation.ts      # BRAND·CEO STORY·GLOBAL·MARKET·VIDEO·BUY·BUSINESS IA
├─ lib/
│  ├─ style.ts             # ElementStyle → CSS (에디터·사이트 공용)
│  ├─ i18n.ts              # 로케일 정의 · 폴백 해석 · 브라우저 감지 · 번역 상태
│  ├─ sanitize.ts          # 저장 시점 HTML 정화 (XSS 경계)
│  ├─ translate/           # DeepL·Google·Tolgee 제공자 / 문서 워커 / 일괄 파이프라인
│  ├─ analytics/           # 전송 계층(PostHog·GA4·Mixpanel·Umami) · 방문자 식별
│  └─ server/              # 페이지 저장소 · 이벤트 저장소/집계 (교체 가능한 경계)
├─ puck/                   # 블록 라이브러리 + 커스텀 인스펙터 필드
├─ hooks/useCanvasAnalytics.ts
├─ components/{editor,site,analytics}/
└─ app/                    # [[...slug]] 공개 라우트 · /admin/editor · /api/*
```

## 자유 배치 편집 (FreeCanvas)

`자유 캔버스` 블록 안에서는 요소를 **마우스로 직접 옮기고 크기를 바꿉니다.**

- 요소 클릭 → 파란 선택 박스 + 8방향 리사이즈 핸들
- 박스를 끌면 이동, 핸들을 끌면 크기 변경 (좌/상단 핸들은 반대편 모서리 고정)
- 선택하면 **우측 인스펙터가 그 요소의 필드로 바뀐다** (텍스트·태그·스타일·추적 ID)
- 빈 곳 클릭 또는 `Esc` 로 선택 해제
- 캔버스 하단 **＋ 섹션 추가** 로 섹션(+자유 캔버스)을 바로 만든다 — 드래그 불필요

| 단축키 | 동작 |
|---|---|
| 방향키 | 1px 이동 |
| Shift + 방향키 | 10px 이동 |
| Delete / Backspace | 요소 삭제 |
| Ctrl/Cmd + D | 복제 |

### 왜 캔버스 "밖"에서 조작하는가

이 기능은 Puck 의 세 가지 전제를 우회해야 성립한다. 수정할 때 참고할 것:

1. **iframe + React 이벤트** — Puck 은 캔버스를 iframe 에 렌더한다. React 18 은
   이벤트를 트리 루트(부모 문서)에 위임하는데 iframe 내부 이벤트는 거기까지
   버블링되지 않아, 캔버스 안 요소의 `onPointerDown` 은 절대 호출되지 않는다.
2. **pointer-events: none** — Puck 은 캔버스 컴포넌트의 포인터 이벤트를 끄고
   자체 오버레이로 상호작용을 처리한다. 그래서 `elementFromPoint` 로도 우리
   요소를 찾을 수 없다. 히트 판정은 요소들의 사각형을 재서 기하학적으로 한다.
3. **중첩 선택** — 절대 좌표로 놓인 자식은 Puck 의 히트 테스트에 잡히지 않아
   언제나 부모 캔버스가 선택된다. `setUi` 로 중첩 항목을 직접 선택시켜도
   무시되므로, 자유 배치 요소의 선택은 `FreeTransformLayer` 가 자체 상태로
   관리한다(`editorStore.pickedElementId`).
   같은 이유로 Puck 인스펙터도 부모 캔버스를 계속 보여주기 때문에,
   `RightPanel` 이 `puck.config` 의 필드 정의를 읽어 직접 그린다
   (`FieldRenderer`). 필드를 추가해도 설정만 고치면 되고 렌더러는 그대로다.

좌표 환산: 화면 = 내부좌표 × 배율 + iframe오프셋. 드래그 델타는 배율로 나눠
캔버스 단위로 되돌린다 (46% 줌에서 화면 140px 이동 = 캔버스 302px).

**data prop 은 초기값이다.** `onChange` 결과를 그대로 `<Puck data>` 로 되먹이면
편집할 때마다 Puck 이 상태를 다시 세워 캔버스가 맨 위로 튀고 선택이 풀린다.
페이지가 바뀌거나 템플릿을 갈아끼울 때만 새 값을 넘긴다.

**중첩 존에는 insert 가 통하지 않는다.** 런타임에 등록되지 않은 존을 대상으로 한
`insert` 는 조용히 무시되므로, 섹션 추가는 `setData` 로 문서를 다시 쓰는 방식이다.

## 휴대폰에서의 자유 배치

자유 배치 좌표는 1440px 아트보드를 전제로 박혀 있습니다. 그대로 두면 390px 화면에서
제목이 잘리고 CTA 가 화면 밖으로 나갑니다. 그래서 방문자 화면에서만 두 단계로 대응합니다.

| 화면 폭 | 동작 |
|---|---|
| 1440px 이상 | 설계 그대로 |
| 768 ~ 1439px | 아트보드를 화면 폭에 맞춰 **비례 축소** (`min(1, 100vw / 설계폭)`) |
| 767px 이하 | 좌표를 풀고 **세로 스택**으로 흐름 배치. 순서는 각 요소가 남긴 `order`(= 화면에서 보이던 위→아래, 왼→오른쪽). 큰 제목은 화면 폭에 맞춰 줄이고, 여러 열 그리드는 1열로 접고, 장식 도형은 숨깁니다 |

비례 축소만으로 끝내지 않는 이유: 390px 에서 27% 로 줄이면 본문이 5px 이 되어 읽을 수
없습니다. 반대로 스택으로만 풀면 태블릿에서 굳이 디자인을 버리게 됩니다.

이 규칙은 `[data-ks-site]` 안에서만 적용됩니다. 에디터에서는 **휴대폰 뷰포트로 바꿀 때만**
캔버스 문서에 같은 표시를 붙여, 미리보기가 실제 사이트와 같아지도록 했습니다. 그 폭에서는
자유 배치 조작을 잠급니다 — 세로 스택 상태에서 끌면 화면에서 본 위치와 저장되는 x/y 가
서로 다른 것을 가리키기 때문입니다.

## 캔버스를 넓게 쓰기

좌우 패널이 화면 폭을 크게 잡아먹으면 자동 배율이 50% 아래로 떨어져 디자인이
사실상 불가능해진다. 그래서 두 가지 접기 수단을 둔다.

| 조작 | 1600px 화면 기준 |
|---|---|
| 기본 | 배율 50% · 캔버스 634px |
| 좌측 페이지 목록 접기 (`⟨`) | 배율 63% · 캔버스 800px |
| 상단 **넓게** (블록 목록까지 접기) | 배율 86% · 캔버스 1100px |

> Puck 의 사이드바 폭은 `--puck-user-sidebar-left/right-width` 로만 바뀐다.
> 파생 변수인 `--puck-sidebar-*-width` 를 덮어써도 레이아웃 그리드는 그대로다.

**줌 버튼은 원래 비활성이다.** Puck 의 배율은 "가용 폭에 맞추기, 최대 100%"라
맞춤 배율을 넘겨 확대할 수 없다. 크게 보려면 위 표대로 패널을 접거나
Medium·Small 뷰포트(각각 100%)로 전환한다.

**캔버스 세로 스크롤은 iframe 내부에서 일어난다.** Puck 은 프레임 높이를 자기
래퍼로 재는데 그 래퍼가 프레임 높이에 묶여 있어(min-height: 프레임 높이),
섹션을 추가해도 프레임이 자라지 않고 넘친 부분이 `overflow:clip` 에 잘린다.
그래서 편집 중일 때만 iframe 안쪽에 스크롤을 켠다(`CanvasScrollFix`).
조작 오버레이는 포인터를 가로채므로 휠 이벤트를 캔버스로 전달하고,
body 스크롤을 구독해 선택 박스가 따라 움직인다.

## 페이지 템플릿

새 페이지를 만들 때 7가지 시작점 중에서 고릅니다 (`src/data/templates.ts`).
백지에서 시작하면 무엇을 놓을지 막막하므로, 섹션 구조가 짜인 상태에서
내용만 바꾸도록 했습니다.

| 템플릿 | 구성 | 어울리는 곳 |
|---|---|---|
| 히어로 + 소개 | 자유 배치 히어로 + 본문 | 기본 |
| 브랜드 카드 3열 | 히어로 + 이미지 카드 그리드 | BRAND · MARKET |
| 제품 캐러셀 | 히어로 + 좌우 슬라이더 | BUY |
| 스토리 | 큰 이미지 + 긴 본문 | CEO STORY |
| 문의 폼 | 히어로 + 접수 폼 | BUSINESS |
| 비디오 갤러리 | 영상 3열 그리드 | VIDEO |
| 빈 페이지 | 섹션 하나 | 직접 구성 |

- 좌측 **＋ 새 페이지** → 제목·경로·템플릿을 한 화면에서 지정 (제목을 쓰면 경로 자동 생성)
- 메뉴 옆 **＋** → 그 메뉴에 맞는 템플릿이 기본 선택된 상태로 열림
- 상단 **템플릿 적용…** → 현재 페이지 내용을 다른 템플릿으로 교체
- 시드 39개 페이지도 IA 섹션에 맞는 템플릿으로 생성된다
  (BUSINESS → 문의 폼, VIDEO → 갤러리, CEO STORY → 스토리)

## 핵심 계약 3가지

**1. 모든 요소는 `data-element-id` 를 갖는다.**
`BlockShell`(`src/puck/blocks/shared.tsx`)이 예외 없이 부여합니다. 이 값이 히트맵 집계 키입니다.
관리자가 인스펙터에서 **추적 ID** 를 지정하면 요소를 옮기거나 다시 만들어도 기록이 이어집니다.

**2. 사용자 노출 문자열은 단일 string 이 아니다.**
```ts
html: { ko: '안녕하세요', en: 'Hello', th: 'สวัสดี',
        _meta: { en: { source: 'auto', provider: 'deepl', sourceHash: 'x1f', reviewed: false } } }
```
`_meta.sourceHash` 덕분에 **원문이 바뀌면 해당 번역이 `stale` 로 표시**되고, 사람이 검수한
번역(`manual`)은 자동번역이 덮어쓰지 않습니다.

**3. 스타일 계산 경로는 하나뿐이다.**
에디터 캔버스와 실제 사이트가 같은 `blockCSS()` 를 부르므로 "에디터에서 본 것 = 배포된 것"이
구조적으로 보장됩니다.

## 외부 서비스 연동

### PostHog (히트맵 · 세션 리플레이 · 퍼널)
```bash
# 셀프호스팅
git clone https://github.com/PostHog/posthog && cd posthog && docker compose up -d
```
```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://posthog.your-domain.com
```
키가 없으면 PostHog 전송만 건너뛰고 내부 수집은 그대로 동작합니다.

### Tolgee (번역 관리) / DeepL · Google
`TRANSLATION_PROVIDER` 로 우선순위를 정하고, 실패 시 자동 폴백합니다.
DeepL 은 **태국어·베트남어를 지원하지 않아** 해당 언어는 자동으로 Google 로 넘어갑니다
(`src/lib/i18n.ts` 의 `deeplCode: null`).

### 저장소를 DB 로 교체
`src/lib/server/pageStore.ts` 와 `analyticsStore.ts` 의 함수 시그니처만 유지하면
나머지 코드는 그대로입니다. 두 파일 상단 주석에 Postgres DDL 예시가 있습니다.

## 사용한 오픈소스

| 영역 | 라이브러리 | 역할 |
|---|---|---|
| 에디터 엔진 | **Puck** (`@puckeditor/core`) | 드래그앤드롭 캔버스, JSON 저장, 인스펙터 |
| 분석 | **PostHog** | 히트맵·세션 리플레이·퍼널 (셀프호스팅 가능) |
| 분석(경량) | **Umami** | 병행 수집 |
| 번역 | **Tolgee** + DeepL / Google | 자동번역 및 번역 관리 |
| HTML 정화 | **DOMPurify** (`isomorphic-dompurify`) | 저장 시점 XSS 차단 |
| 입력 검증 | **Zod** | API 요청 스키마 검증·정규화 |
| 아이콘 | **Lucide** (`lucide-react`) | Icon 블록 |
| 캐러셀 | **Embla Carousel** | 브랜드·제품 슬라이더 |
| 폰트 | **Google Fonts** (`next/font`) | Noto Sans KR/Thai/JP/SC, Inter |
| DB | **Postgres** (`pg`) | 페이지·이벤트·문의 저장 |
| 테스트 | **Vitest** | 핵심 로직 87개 테스트 |

### 직접 만들지 않고 라이브러리를 쓴 이유

- **DOMPurify** — 처음엔 정규식 정화기를 직접 만들었다. 테스트를 붙이자마자
  DOMPurify 설정 실수(`USE_PROFILES` 가 허용목록을 덮어써 `<form>` 통과)와
  `#text` 누락으로 본문이 통째로 사라지는 문제가 드러났다. 정규식은 원리상
  브라우저 파서와 해석이 어긋날 수 있어(mXSS), 실제 DOM 을 만들어 검사하는
  라이브러리가 옳다.
- **Zod** — 손으로 쓴 검사에서는 값 타입 강제(숫자 → 문자열)와 오류 메시지를
  매번 다시 작성해야 했다.
- **Lucide** — v1 부터 상표 문제로 브랜드 아이콘(YouTube/Instagram)이 빠졌다.
  영상·방송 섹션에는 일반 아이콘을 쓴다.

## 테스트

```bash
npm test           # 187개 테스트
npm run test:watch
npm run a11y       # 실행 중인 사이트에 axe-core (WCAG 2.1 AA) — 위반 시 종료 코드 1
```

| 파일 | 검증 대상 |
|---|---|
| `test/sanitize.test.ts` | XSS 차단 + 정상 서식·다국어 보존 |
| `test/sanitizePage.test.ts` | 저장 경로 전체 정화 — 다국어 슬롯·중첩 zone·Embed raw HTML |
| `test/i18n.test.ts` | 폴백 체인, 원문 변경(stale) 감지, Accept-Language, `?lang=` 유지 |
| `test/id.test.ts` | 경로 정규화(한글·퍼센트 인코딩·NFC), 슬러그 |
| `test/style.test.ts` | absolute/flex/grid 레이아웃 분기, 반응형 상속, hover 규칙 |
| `test/templates.test.ts` | 7개 템플릿의 구조·다국어·원문 언어 결정 |
| `test/translate.test.ts` | 번역 대상 수집, 검수본 보존, 중첩 zone 왕복 |
| `test/pipeline.test.ts` | 자동 번역 파이프라인 (원문 제외, HTML 분리, 실패 격리, 진행률) |
| `test/analytics.test.ts` | 클릭 점유율·CTR, 스크롤 퍼널, 섹션 이탈률, 바운스 |
| `test/fsDriver.test.ts` | 파일 드라이버 — 시드, 경로 충돌, 재기동 후 잔존, 문의 상태 변경 |
| `test/rateLimit.test.ts` | 창 제한과 만료 항목 청소(메모리 누수 방지) |

브라우저가 필요한 것(에디터 드래그, 히트맵 좌표, 모바일 레이아웃, 접근성)은
Playwright 로 실제 렌더를 띄워 확인했습니다. `npm run a11y` 가 그중 접근성 부분입니다.

## Netlify 배포

`netlify.toml` 이 포함되어 있어 저장소만 연결하면 됩니다.

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → 저장소 선택
2. 빌드 설정은 `netlify.toml` 이 정의하므로 그대로 두기
3. **Site configuration → Environment variables** 에 추가:

| Key | 값 |
|---|---|
| `POSTGRES_URL` | Neon pooled 연결 문자열 |
| `ADMIN_PASSWORD` | 관리자 비밀번호 |
| `ADMIN_SESSION_SECRET` | `openssl rand -base64 32` |
| `SITE_URL` | 커스텀 도메인 사용 시에만 (미설정 시 Netlify 도메인 자동 인식) |

4. Deploy → `https://<사이트>.netlify.app/api/health` 확인

Netlify Functions 는 Node 런타임이라 `pg`(Postgres TCP)와 `node:crypto` 가 그대로 동작하며,
Deploy Preview 와 branch 배포는 `robots.txt` 가 자동으로 색인을 막습니다.

**무료 한도**: 월 300 빌드분, 함수 호출 월 125,000회. (Vercel 의 "하루 100회 배포" 같은
일일 제한은 없습니다.)

## 다른 호스팅 (Docker / Fly.io / Railway)

Node 런타임이면 코드 수정 없이 그대로 돕니다. `Dockerfile` 과 `fly.toml` 이 포함되어 있습니다.

```bash
# Fly.io
fly launch --no-deploy
fly secrets set POSTGRES_URL="..." ADMIN_PASSWORD="..." ADMIN_SESSION_SECRET="..."
fly deploy

# 아무 Docker 호스트
docker build -t k-soho-global .
docker run -p 3000:3000 -e POSTGRES_URL="..." -e ADMIN_PASSWORD="..." k-soho-global
```

`DOCKER_BUILD=1` 일 때만 Next 의 standalone 출력을 켜므로 Vercel 배포와 간섭하지 않습니다.

## 페이지별 노출 언어

SEO 탭의 **노출 언어** 칩으로 페이지마다 보여 줄 언어를 정합니다
(예: 태국 전용 랜딩은 `ko`·`en`·`th` 만). 지정하면:

- 언어 스위처에 끈 언어가 나오지 않습니다.
- `hreflang` 과 사이트맵에서 빠집니다.
- 끈 언어로 들어온 요청(`?lang=th`)은 실제로 보여 줄 언어로 **307 리다이렉트**됩니다.
  그대로 두면 `<html lang>` 은 요청 언어인데 본문은 다른 언어로 나가, 화면과 선언이
  어긋난 페이지가 색인됩니다.

최소 한 개 언어는 남습니다(전부 끄면 보여 줄 것이 없습니다).

## 다국어 SEO

- 방문자 언어 우선순위: **`?lang=` → 쿠키(직접 선택) → Accept-Language → 기본(ko)**
- `?lang=` 은 서버 렌더에도 반영된다. hreflang 으로 그 주소를 검색엔진에 알리므로,
  링크를 타고 들어온 사람과 크롤러 모두 해당 언어의 HTML 을 받아야 한다.
- `canonical`·`hreflang`·`og:image` 는 절대 URL 이어야 한다.
  루트 레이아웃의 `metadataBase` 가 페이지의 상대 경로를 승격시킨다.
  (도메인은 `SITE_URL` → 호스팅 주입 도메인 순으로 런타임에 정해진다)

> 쿼리 없는 주소는 정적으로 생성되고, `?lang=` 이 붙으면 그 요청만 서버에서
> 렌더된다. 두 경로 모두 같은 로케일 해석 함수를 쓴다.

## 보안 주석

- **이미지 최적화기 비활성** — 이미지 블록은 관리자가 임의 URL 을 넣을 수 있어야 해서
  `next/image` 대신 `<img>` 를 쓴다. 최적화기를 열어두면(`remotePatterns: '**'`)
  외부에서 임의 이미지를 우리 도메인으로 프록시시켜 대역폭을 소모시킬 수 있으므로
  `images.unoptimized` 로 꺼두었다. `npm audit` 이 Next 버전 범위로 이 항목을
  계속 보고하지만, 해당 코드 경로 자체가 비활성이다.
- **Next 15/16 업그레이드**는 `cookies()`·`headers()`·`params` 가 비동기로 바뀌는
  파괴적 변경이라 별도 작업으로 남겨두었다.

## Vercel 배포

### 1. 저장소 연결
[vercel.com/new](https://vercel.com/new) → 이 GitHub 저장소 선택 → 프레임워크는 **Next.js** 로 자동 인식됩니다.
빌드 설정은 그대로 두면 됩니다.

### 2. 데이터베이스 연결 (필수)

**서버리스에는 영구 디스크가 없습니다.** DB 없이 배포하면 사이트는 정상 동작하지만
에디터 저장·문의 접수가 `503` 으로 거부됩니다 (조용히 사라지는 것보다 낫기 때문에 의도한 동작입니다).

Vercel 대시보드 → **Storage** → **Neon**(또는 Supabase) 추가 → 프로젝트에 연결하면
`POSTGRES_URL` 이 자동 주입됩니다. 테이블은 첫 요청 때 자동 생성되고, 비어 있으면
IA 기반 시드 페이지 39개가 들어갑니다. 별도 마이그레이션 명령은 필요 없습니다.

> `DATABASE_URL` 이나 `POSTGRES_PRISMA_URL` 도 인식하므로 Supabase·RDS 등도 그대로 쓸 수 있습니다.
> 서버리스에서는 커넥션이 빨리 고갈되므로 **풀러(pgbouncer) 연결 문자열**을 권장합니다.

### 3. 환경 변수

Vercel → Settings → Environment Variables 에 등록합니다.

| 변수 | 필수 | 설명 |
|---|:--:|---|
| `POSTGRES_URL` | ✅ | Storage 연결 시 자동 주입 |
| `ADMIN_PASSWORD` | ✅ | 관리자 로그인 비밀번호 |
| `ADMIN_SESSION_SECRET` | 권장 | 세션 서명 키. 없으면 비밀번호를 키로 사용 (비밀번호 변경 시 전체 로그아웃) |
| `NEXT_PUBLIC_SITE_URL` | 권장 | `https://your-domain.com` — sitemap/hreflang 절대경로 |
| `DEEPL_API_KEY` / `GOOGLE_TRANSLATE_API_KEY` | 선택 | 자동번역 |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | 선택 | 히트맵·리플레이 |

**`ADMIN_PASSWORD` 를 설정하지 않으면 프로덕션에서 모든 쓰기가 차단됩니다.**
비밀번호 없이 공개된 에디터보다 안전한 쪽을 기본값으로 두었습니다.

### 4. 배포 확인

```bash
curl https://your-app.vercel.app/api/health
```
```jsonc
{
  "storage": { "pages": { "driver": "postgres", "readOnly": false }, ... },
  "features": { "adminAuth": true, "deepl": false, ... },
  "todo": ["번역 API 키가 없어 자동번역이 비활성화됩니다."]   // 남은 설정을 알려준다
}
```

`todo` 가 비면 설정이 끝난 것입니다. 이후 `/admin/login` 으로 접속하세요.

### 배포 후 동작

| 항목 | 동작 |
|---|---|
| 발행된 페이지 | 빌드 시 정적 생성 (`generateStaticParams`) |
| 초안/보관 페이지 | 공개 사이트에서 404 |
| `/admin/*` | 로그인 필요 + `X-Robots-Tag: noindex` |
| 프리뷰 배포 | `robots.txt` 가 전체 차단 (운영 도메인만 색인) |
| `/sitemap.xml` | 발행 페이지 + 언어별 `hreflang` 자동 생성 |

## 관리자 인증

비밀번호 → HMAC 서명 세션 쿠키(12시간). 외부 의존성이 없습니다.

- 로컬에서 `ADMIN_PASSWORD` 미설정 시에는 인증 없이 통과합니다(개발 편의).
- 프로덕션에서 미설정 시에는 **모든 쓰기를 거부**합니다.
- 미들웨어는 Edge 런타임이라 쿠키 존재만 확인하고, 실제 서명 검증은
  Node 런타임(페이지·API 라우트)에서 수행합니다.

사용자가 늘면 `src/lib/server/auth.ts` 만 NextAuth/Clerk 로 교체하면 됩니다.

## BUSINESS 문의 폼

`Form` 블록으로 Buyer Inquiry / Distribution / Partnership / Media Inquiry 폼을 만듭니다.
입력 항목·라벨·선택지를 에디터에서 정의하며 라벨은 언어별로 저장됩니다.

- 제출 → `POST /api/inquiry` (공개, IP당 10분 8건 제한)
- 조회 → `GET /api/inquiry` (관리자 전용)
- 상태 변경 → `PATCH /api/inquiry` (관리자 전용)
- **관리 화면 → `/admin/inquiries`** — 목록·상세·검색, 신규/확인함/보관 상태,
  CSV 내보내기(엑셀에서 한글이 깨지지 않도록 BOM 포함).
- 에디터 상단 **[문의] 버튼에 미확인 건수 배지** — 관리 화면을 열어 보지 않아도
  새 문의가 들어온 것을 알 수 있습니다.
- UTM 파라미터가 함께 저장되어 **어느 채널의 유입이 문의로 이어졌는지** 추적됩니다
- 제출 버튼은 전환 목표로 집계되어 히트맵/퍼널에 나타납니다

## 저장소 드라이버

| 환경 | 드라이버 | 동작 |
|---|---|---|
| 로컬 | `filesystem` | `.data/` 에 JSON/NDJSON |
| `POSTGRES_URL` 설정 | `postgres` | 스키마 자동 생성 + 시드 주입 |
| 서버리스 + DB 없음 | `read-only-seed` | 사이트는 서빙, 쓰기는 503 으로 거부 |

서버리스에서 파일시스템 드라이버를 쓰지 않는 이유: 쓰기가 성공한 것처럼 보이지만
인스턴스가 사라지면 데이터도 사라집니다. 조용히 잃는 것보다 명확히 거부하는 편이 낫습니다.

## 분석 이벤트

| 이벤트 | 수집 시점 |
|---|---|
| `page_view` | 페이지 진입 |
| `element_click` | `[data-element-id]` 클릭 (요소 상대좌표 + 페이지 절대좌표) |
| `element_impression` | IntersectionObserver, 50% 노출 시 1회 |
| `scroll_depth` | 20 / 50 / 80 / 100% 도달 |
| `section_dwell` | 섹션별 누적 체류 시간 |
| `exit` | **이탈 시 마지막으로 보던 섹션** = 드롭오프 지점 |
| `rage_click` | 800ms 내 동일 요소 3회 이상 (UX 문제 신호) |
| `dead_click` | 링크·액션 없는 요소 클릭 |
| `conversion` | `전환 목표명` 이 지정된 요소 클릭 |
| `locale_change` | 언어 전환 (`switcher` / `auto`) |

이탈 이벤트는 `visibilitychange` → `pagehide` 순으로 잡고 `sendBeacon` 으로 보냅니다.
탭이 닫히는 중에도 전송이 보장되는 유일한 경로입니다.

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm start          # 프로덕션 서버
npm test           # 단위 테스트
npm run typecheck  # 타입 검사
npm run lint
npm run a11y       # 접근성 점검 (서버가 떠 있어야 함, BASE_URL 로 주소 변경)
```

## 보안

- 캔버스 HTML 은 **저장 시점**(`/api/pages`)에 허용목록 기반으로 정화됩니다.
  클라이언트 정화는 우회 가능하므로 신뢰 경계는 항상 서버입니다.
- 번역 API 키는 서버 라우트(`/api/translate`)에만 존재하며 브라우저로 내려가지 않습니다.
- 방문자 식별은 1st-party 익명 ID 이며 PII 를 수집하지 않습니다.
  `requireConsent: true` 로 동의 이전 전송을 차단할 수 있습니다.
