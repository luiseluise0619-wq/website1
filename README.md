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
npm run build      # 프로덕션 빌드 (발행 페이지는 정적 생성)
npm run typecheck  # 타입 검사
npm run lint
```

## 보안

- 캔버스 HTML 은 **저장 시점**(`/api/pages`)에 허용목록 기반으로 정화됩니다.
  클라이언트 정화는 우회 가능하므로 신뢰 경계는 항상 서버입니다.
- 번역 API 키는 서버 라우트(`/api/translate`)에만 존재하며 브라우저로 내려가지 않습니다.
- 방문자 식별은 1st-party 익명 ID 이며 PII 를 수집하지 않습니다.
  `requireConsent: true` 로 동의 이전 전송을 차단할 수 있습니다.
