'use client';

import React from 'react';
import { useEditorStore } from '@/store/editorStore';
import type { ElementStat, PageAnalyticsSummary } from '@/types/analytics';

/* =============================================================================
 * Heatmap Overlay — 에디터 캔버스 위에 클릭 데이터를 덮어 그린다
 * -----------------------------------------------------------------------------
 * 동작 원리
 *  1) 캔버스(에디터는 iframe 안에서 렌더된다)에서 [data-element-id] 를 모두 찾는다
 *  2) 각 요소의 화면 좌표를 측정한다
 *  3) 분석 요약의 elementId 와 매칭해 그 위에 색상 박스 + 수치 배지를 그린다
 * 캔버스 DOM 은 건드리지 않는다 — 오버레이는 형제 레이어로 절대배치된다.
 * ========================================================================== */

interface Box {
  id: string;
  name?: string;
  type?: string;
  top: number;
  left: number;
  width: number;
  height: number;
  stat?: ElementStat;
}

/** 강도(0~1) → 색상. 파랑(낮음) → 빨강(높음) */
function heatColor(intensity: number, alpha = 0.55): string {
  const clamped = Math.min(1, Math.max(0, intensity));
  // 240deg(파랑) → 0deg(빨강)
  const hue = 240 - clamped * 240;
  return `hsla(${hue}, 90%, 52%, ${alpha})`;
}

function metricValue(
  stat: ElementStat,
  metric: 'clicks' | 'ctr' | 'rage' | 'dead',
): { value: number; display: string; intensity: number } {
  if (metric === 'ctr') {
    return { value: stat.ctr, display: `${(stat.ctr * 100).toFixed(1)}%`, intensity: Math.min(1, stat.ctr * 2) };
  }
  if (metric === 'rage') {
    const rate = stat.clicks ? stat.rageClicks / stat.clicks : 0;
    return { value: stat.rageClicks, display: `${stat.rageClicks}회`, intensity: Math.min(1, rate * 5) };
  }
  if (metric === 'dead') {
    /* 데드 클릭 = 링크도 액션도 없는 곳을 눌렀다. 눌러도 아무 일이 없다는
       뜻이라, 한 번만 있어도 눈에 띄어야 한다(비율을 크게 잡는다). */
    const rate = stat.clicks ? stat.deadClicks / stat.clicks : 0;
    return { value: stat.deadClicks, display: `${stat.deadClicks}회`, intensity: Math.min(1, rate * 3) };
  }
  return { value: stat.clicks, display: `${stat.clicks.toLocaleString()}회`, intensity: stat.intensity };
}

/** 지표 이름은 한 곳에서만 정한다 — 범례와 선택 상자가 어긋나지 않게 */
const METRIC_LABEL: Record<'clicks' | 'ctr' | 'rage' | 'dead', string> = {
  clicks: '클릭 수',
  ctr: '노출 대비 클릭률',
  rage: '분노 클릭',
  dead: '데드 클릭',
};

/** Puck 캔버스 iframe 을 찾는 선택자 — 버전에 따라 클래스명이 바뀌므로 여러 개를 둔다 */
const CANVAS_FRAME_SELECTOR = 'iframe#preview-frame, .Puck-frame iframe, iframe';

export interface HeatmapOverlayProps {
  /**
   * 측정 대상 iframe 을 찾을 선택자.
   * 요소나 document 를 미리 잡아 두지 않는 이유: Puck 은 캔버스 iframe 을
   * 다시 마운트하기 때문에, 한 번 잡아 둔 참조는 곧 화면에서 떨어져 나간
   * 빈 문서를 가리킨다. 그 문서에는 [data-element-id] 가 하나도 없어
   * 히트맵이 통째로 비어 보였다 — 측정할 때마다 새로 찾는다.
   */
  frameSelector?: string;
  /** 오버레이가 놓일 컨테이너 (좌표 보정 기준) */
  containerRef?: React.RefObject<HTMLElement>;
  summary?: PageAnalyticsSummary | null;
}

export function HeatmapOverlay({ frameSelector = CANVAS_FRAME_SELECTOR, containerRef, summary: summaryProp }: HeatmapOverlayProps) {
  const enabled = useEditorStore((s) => s.heatmapEnabled);
  const metric = useEditorStore((s) => s.heatmapMetric);
  const storeSummary = useEditorStore((s) => s.analytics);
  const summary = summaryProp ?? storeSummary;

  const [boxes, setBoxes] = React.useState<Box[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);

  /** 요소 위치 측정 — 캔버스 스크롤/줌/리사이즈에 따라 다시 계산한다 */
  const measure = React.useCallback(() => {
    // 매 측정마다 iframe 과 그 문서를 새로 찾는다 — 위 주석의 이유
    const frameEl =
      typeof document !== 'undefined' ? document.querySelector<HTMLIFrameElement>(frameSelector) : null;
    const doc = frameEl?.contentDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc || !summary) {
      setBoxes([]);
      return;
    }

    const statMap = new Map(summary.elements.map((s) => [s.elementId, s]));
    const containerRect = containerRef?.current?.getBoundingClientRect();

    /* 에디터 캔버스는 iframe 이며, Puck 이 줌 배율(예: 25%)을 CSS transform 으로 건다.
       iframe 내부의 getBoundingClientRect() 는 배율이 적용되지 않은 좌표를 주므로,
       바깥에서 잰 iframe 크기와의 비율로 직접 환산해야 오버레이가 정확히 겹친다. */
    const frame = doc.defaultView?.frameElement as HTMLElement | undefined;
    const frameRect = frame?.getBoundingClientRect();
    const scale = frameRect && frame?.offsetWidth ? frameRect.width / frame.offsetWidth : 1;
    const offsetX = (frameRect?.left ?? 0) - (containerRect?.left ?? 0);
    const offsetY = (frameRect?.top ?? 0) - (containerRect?.top ?? 0);

    const next: Box[] = [];
    doc.querySelectorAll<HTMLElement>('[data-element-id]').forEach((el) => {
      if (el.dataset.noTrack === 'true') return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      next.push({
        id: el.dataset.elementId as string,
        name: el.dataset.elementName,
        type: el.dataset.elementType,
        top: rect.top * scale + offsetY,
        left: rect.left * scale + offsetX,
        width: rect.width * scale,
        height: rect.height * scale,
        stat: statMap.get(el.dataset.elementId as string),
      });
    });
    setBoxes(next);
  }, [frameSelector, containerRef, summary]);

  React.useEffect(() => {
    if (!enabled) {
      setBoxes([]);
      return;
    }
    measure();
    const doc = document.querySelector<HTMLIFrameElement>(frameSelector)?.contentDocument ?? document;
    const win = doc.defaultView;
    if (!win) return;

    // 캔버스가 바뀌면 좌표도 바뀐다 — 리사이즈/스크롤/DOM 변경 모두 재측정 트리거
    const observer = new ResizeObserver(measure);
    if (doc.body) observer.observe(doc.body);
    const mutation = new MutationObserver(() => requestAnimationFrame(measure));
    if (doc.body) mutation.observe(doc.body, { subtree: true, childList: true, attributes: true });

    win.addEventListener('scroll', measure, { passive: true });
    win.addEventListener('resize', measure);

    /* 위 관찰자들은 '지금' 문서에 붙는다. Puck 이 문서를 갈아끼우면 관찰이
       끊기므로, 주기적 재측정으로 새 문서를 다시 집는다. */
    const timer = setInterval(measure, 1000);

    return () => {
      observer.disconnect();
      mutation.disconnect();
      clearInterval(timer);
      win.removeEventListener('scroll', measure);
      win.removeEventListener('resize', measure);
    };
  }, [enabled, measure, frameSelector]);

  if (!enabled) return null;

  if (!summary) {
    return (
      <div style={panelStyle}>
        <strong>히트맵</strong>
        <p style={{ margin: '6px 0 0', opacity: 0.7 }}>이 기간에 수집된 데이터가 없습니다.</p>
      </div>
    );
  }

  const tracked = boxes.filter((b) => b.stat);
  const untracked = boxes.length - tracked.length;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, overflow: 'hidden' }}>
      {/* --- 요소별 오버레이 --- */}
      {boxes.filter((box) => box.stat).map((box) => {
        const stat = box.stat;
        const m = stat ? metricValue(stat, metric) : null;
        const isHovered = hovered === box.id;

        return (
          <div
            key={box.id}
            style={{
              position: 'absolute',
              top: box.top,
              left: box.left,
              width: box.width,
              height: box.height,
              background: m ? heatColor(m.intensity, isHovered ? 0.7 : 0.45) : 'rgba(120,130,150,0.12)',
              border: m ? `1.5px solid ${heatColor(m.intensity, 0.95)}` : '1px dashed rgba(120,130,150,0.5)',
              borderRadius: 4,
              pointerEvents: 'auto',
              transition: 'background .12s ease',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              overflow: 'visible',
            }}
            onMouseEnter={() => setHovered(box.id)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* 클릭 수 + 비율(%) 배지 */}
            {stat && m ? (
              <span
                style={{
                  transform: 'translate(6px, -10px)',
                  background: '#111827',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 6px rgba(0,0,0,.25)',
                }}
              >
                {m.display} · {(stat.clickShare * 100).toFixed(1)}%
              </span>
            ) : null}

            {/* 상세 툴팁 */}
            {isHovered && stat ? (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  background: '#0d0f14',
                  color: '#e6ebf5',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  lineHeight: 1.7,
                  minWidth: 190,
                  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
                  zIndex: 60,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{box.name ?? box.type ?? box.id}</div>
                <Row label="클릭" value={stat.clicks.toLocaleString()} />
                <Row label="클릭 비율" value={`${(stat.clickShare * 100).toFixed(1)}%`} />
                <Row label="노출" value={stat.impressions.toLocaleString()} />
                <Row label="CTR" value={`${(stat.ctr * 100).toFixed(1)}%`} />
                <Row label="순 클릭자" value={stat.uniqueClickers.toLocaleString()} />
                {stat.rageClicks > 0 ? <Row label="⚠ 분노 클릭" value={`${stat.rageClicks}`} /> : null}
                {stat.deadClicks > 0 ? <Row label="⚠ 데드 클릭" value={`${stat.deadClicks}`} /> : null}
                {stat.deadClicks > 0 ? <Row label="⚠ 반응 없는 클릭" value={`${stat.deadClicks}`} /> : null}
                <div style={{ opacity: 0.5, marginTop: 4, fontFamily: 'monospace' }}>{box.id}</div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* --- 범례 & 요약 --- */}
      <div style={panelStyle}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          히트맵 · {METRIC_LABEL[metric]}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, opacity: 0.7 }}>낮음</span>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              background: `linear-gradient(90deg, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})`,
            }}
          />
          <span style={{ fontSize: 10, opacity: 0.7 }}>높음</span>
        </div>
        <Row label="기간" value={`${summary.range.from} ~ ${summary.range.to}`} />
        <Row label="세션" value={summary.sessions.toLocaleString()} />
        <Row label="총 클릭" value={summary.totalClicks.toLocaleString()} />
        <Row label="측정 요소" value={`${tracked.length}개${untracked ? ` (데이터 없음 ${untracked})` : ''}`} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ opacity: 0.65 }}>{label}</span>
      <strong style={{ fontWeight: 600 }}>{value}</strong>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  right: 16,
  bottom: 16,
  width: 240,
  background: 'rgba(13,15,20,.92)',
  color: '#e6ebf5',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 11,
  lineHeight: 1.8,
  pointerEvents: 'auto',
  boxShadow: '0 10px 30px rgba(0,0,0,.4)',
  backdropFilter: 'blur(6px)',
  zIndex: 50,
};
