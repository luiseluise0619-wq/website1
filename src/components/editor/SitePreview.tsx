'use client';

import React from 'react';
import { LOCALES, LOCALE_ORDER } from '@/lib/i18n';
import type { LocaleCode } from '@/types/schema';

/* =============================================================================
 * 사이트 미리보기 — 에디터를 떠나지 않고 '진짜 화면'을 본다
 * -----------------------------------------------------------------------------
 * 캔버스는 편집용이라 선택 상자·핸들·드롭존 안내가 겹쳐 보인다. 발행 전에
 * 방문자가 볼 화면을 확인하려면 새 탭을 열어야 했고, 그러면 편집하던 자리를
 * 잃는다.
 *
 * 실제 사이트 주소를 iframe 으로 띄운다 — 렌더러를 따로 만들지 않으므로
 * "미리보기에서는 됐는데 실제로는 다르다"가 생기지 않는다.
 *
 * 주의: 미리보기는 '발행된 내용'이 아니라 '저장된 내용'을 보여 준다.
 * 서버가 저장소에서 읽어 오기 때문이다. 저장하지 않은 편집은 보이지 않으므로
 * 그 사실을 화면에 적어 둔다 — 안 그러면 "왜 방금 고친 게 없지"가 된다.
 * ========================================================================== */

/** 기기별 미리보기 폭 — 휴대폰 폭은 실제 사이트가 세로 스택으로 푸는 경계 아래 */
const DEVICES = [
  { key: 'desktop', label: '데스크톱', width: 1440, height: 900 },
  { key: 'tablet', label: '태블릿', width: 834, height: 1112 },
  { key: 'phone', label: '휴대폰', width: 390, height: 844 },
] as const;

type DeviceKey = (typeof DEVICES)[number]['key'];

export function SitePreview({
  path,
  locales,
  dirty,
  onClose,
}: {
  /** 미리 볼 페이지 경로 */
  path: string;
  /** 이 페이지가 노출하는 언어 */
  locales?: LocaleCode[];
  /** 저장하지 않은 편집이 있는가 — 있으면 미리보기와 어긋난다 */
  dirty: boolean;
  onClose: () => void;
}) {
  const [device, setDevice] = React.useState<DeviceKey>('desktop');
  const [locale, setLocale] = React.useState<LocaleCode>((locales ?? LOCALE_ORDER)[0]);
  /** 저장 후 다시 열지 않고 새로 고칠 수 있게 — key 를 바꿔 iframe 을 새로 띄운다 */
  const [nonce, setNonce] = React.useState(0);

  const shown = DEVICES.find((d) => d.key === device)!;
  /* ?preview=1 — '에디터 안에서 보는 중' 이라는 표시.
     첫 화면으로 들어오면 에디터로 보내는 규칙을 빠져나가고(없으면 홈
     미리보기가 미리보기 안에서 에디터를 연다), 방문 분석을 끄고, 내부 링크를
     미리보기 안에 가둔다. */
  const src = `${path}${path.includes('?') ? '&' : '?'}preview=1&lang=${locale}&_=${nonce}`;
  /* 새 탭으로 여는 것은 '미리보기를 벗어나 진짜 화면을 본다' 는 뜻이다 —
     preview=1 을 물려주면 분석이 꺼진 채로 열리고 주소창에도 그 표시가 남는다. */
  const realUrl = `${path}${path.includes('?') ? '&' : '?'}site=1&lang=${locale}`;

  /* Esc 로 닫는다 — 전체 화면을 덮으므로 나가는 길이 분명해야 한다 */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label="사이트 미리보기">
      <div style={bar}>
        <strong style={{ fontSize: 13 }}>미리보기</strong>
        <code style={pathChip}>{path}</code>

        <div style={{ display: 'flex', gap: 4 }}>
          {DEVICES.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDevice(d.key)}
              style={{ ...chip, ...(device === d.key ? chipOn : null) }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as LocaleCode)}
          title="미리 볼 언어"
          style={{ ...chip, paddingRight: 6 }}
        >
          {(locales?.length ? locales : LOCALE_ORDER).map((l) => (
            <option key={l} value={l}>
              {LOCALES[l].flag} {LOCALES[l].koName}
            </option>
          ))}
        </select>

        <span style={{ flex: 1 }} />

        {dirty ? (
          <span style={warn} title="미리보기는 서버에 저장된 내용을 보여 줍니다">
            저장하지 않은 편집은 보이지 않습니다
          </span>
        ) : null}

        <button type="button" onClick={() => setNonce((n) => n + 1)} style={chip} title="다시 불러오기">
          새로 고침
        </button>
        <a href={realUrl} target="_blank" rel="noreferrer" title="공개 화면 그대로 새 탭에서 엽니다" style={{ ...chip, textDecoration: 'none' }}>
          새 탭 ↗
        </a>
        <button type="button" onClick={onClose} style={{ ...chip, ...chipClose }} title="닫기 (Esc)">
          ✕ 닫기
        </button>
      </div>

      <div style={stage}>
        <iframe
          key={`${device}:${locale}:${nonce}`}
          src={src}
          title="사이트 미리보기"
          style={{
            width: shown.width,
            height: '100%',
            maxWidth: '100%',
            border: 0,
            background: '#fff',
            borderRadius: device === 'desktop' ? 0 : 12,
            boxShadow: device === 'desktop' ? 'none' : '0 10px 40px rgba(0,0,0,.5)',
          }}
        />
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  background: '#0d0f14',
  display: 'flex',
  flexDirection: 'column',
};

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid #262d3a',
  background: '#151922',
  color: '#e6ebf5',
  flexWrap: 'wrap',
};

const stage: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: 12,
  overflow: 'auto',
};

const chip: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid #262d3a',
  background: '#0d0f14',
  color: '#e6ebf5',
  fontSize: 12,
  cursor: 'pointer',
};

const chipOn: React.CSSProperties = { background: '#1d4ed8', borderColor: '#1d4ed8', fontWeight: 700 };
const chipClose: React.CSSProperties = { borderColor: '#3f2730', color: '#fca5a5' };

const pathChip: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  color: '#8b95a7',
  background: '#0d0f14',
  padding: '3px 7px',
  borderRadius: 4,
};

const warn: React.CSSProperties = {
  fontSize: 11,
  color: '#fcd34d',
  background: 'rgba(245,158,11,.12)',
  border: '1px solid rgba(245,158,11,.35)',
  padding: '4px 9px',
  borderRadius: 999,
};
