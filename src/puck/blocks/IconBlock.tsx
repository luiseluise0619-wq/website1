'use client';

import React from 'react';
import {
  Award, Building2, Check, ChevronRight, Clock, Factory, Film, Globe, Handshake, Heart,
  Leaf, Mail, MapPin, Monitor, Package, Phone, Play, Send, Share2, Ship,
  ShoppingBag, Sparkles, Star, Truck,
} from 'lucide-react';
import { BlockShell } from './shared';
import type { CustomField } from '@puckeditor/core';
import type { BaseBlockProps } from '@/types/schema';

/* =============================================================================
 * Icon 블록
 * -----------------------------------------------------------------------------
 * lucide-react 는 6,000개 넘는 아이콘을 내보낸다. 전부 노출하면 관리자가 고르기도
 * 어렵고 번들도 커지므로, K-SOHO 도메인(커머스·수출·브랜드)에 맞는 세트만 고정한다.
 * 필요하면 이 맵에 한 줄 추가하는 것으로 늘릴 수 있다.
 * ========================================================================== */

export const ICON_SET = {
  star: Star, heart: Heart, check: Check, sparkles: Sparkles, award: Award,
  globe: Globe, ship: Ship, truck: Truck, package: Package, factory: Factory,
  'shopping-bag': ShoppingBag, building: Building2, handshake: Handshake, leaf: Leaf,
  mail: Mail, phone: Phone, send: Send, 'map-pin': MapPin, clock: Clock,
  /* lucide v1 은 상표 문제로 브랜드 아이콘(YouTube/Instagram 등)을 제거했다.
     영상·방송 섹션에는 일반 아이콘을 쓴다. */
  play: Play, film: Film, broadcast: Monitor, share: Share2, 'chevron-right': ChevronRight,
} as const;

export type IconName = keyof typeof ICON_SET;

export const ICON_OPTIONS = (Object.keys(ICON_SET) as IconName[]).map((name) => ({
  label: name,
  value: name,
}));

export interface IconBlockProps {
  /** `name` 이 아니라 `icon` 인 이유: 모든 블록의 공통 prop 인 레이어 이름(name)과
      충돌하면 인스펙터에서 한쪽을 편집할 수 없게 된다. */
  icon: IconName;
  size: number;
  color: string;
  strokeWidth?: number;
}

export function IconBlock(props: IconBlockProps & BaseBlockProps & { id?: string; free?: boolean }) {
  // 저장된 이름이 세트에서 빠졌더라도(이름 변경 등) 렌더가 깨지지 않게 기본값을 둔다
  const Icon = ICON_SET[props.icon] ?? Star;

  return (
    <BlockShell {...props} elementType="Icon" free={props.free}>
      <Icon
        size={props.size ?? 32}
        color={props.color ?? 'currentColor'}
        strokeWidth={props.strokeWidth ?? 2}
        aria-hidden
      />
    </BlockShell>
  );
}

/* =============================================================================
 * 아이콘 선택 필드
 * -----------------------------------------------------------------------------
 * 기본 select 는 'shopping-bag' 같은 키를 글자로만 보여 준다. 노코드 도구에서
 * 아이콘을 이름으로 고르라는 것은 결국 하나씩 눌러 보라는 뜻이라, 실제 모양을
 * 격자로 펼쳐 고르게 한다.
 * ========================================================================== */

function IconPicker({ value, onChange }: { value?: IconName; onChange: (next: IconName) => void }) {
  const current = value && value in ICON_SET ? value : 'star';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 4,
        maxHeight: 168,
        overflowY: 'auto',
        padding: 4,
        border: '1px solid var(--puck-color-grey-09, #d1d5db)',
        borderRadius: 8,
      }}
    >
      {(Object.keys(ICON_SET) as IconName[]).map((name) => {
        const Glyph = ICON_SET[name];
        const on = name === current;
        return (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={on}
            onClick={() => onChange(name)}
            style={{
              display: 'grid',
              placeItems: 'center',
              aspectRatio: '1 / 1',
              borderRadius: 6,
              border: `1px solid ${on ? '#3b82f6' : 'transparent'}`,
              background: on ? 'rgba(59,130,246,.14)' : 'transparent',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <Glyph size={18} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

/** Puck 필드로 쓰는 형태 — config 의 icon 필드에 그대로 넣는다 */
export function iconField(label: string): CustomField<IconName> {
  return {
    type: 'custom',
    label,
    render: ({ value, onChange }) => (
      <IconPicker value={value as IconName | undefined} onChange={(next) => onChange(next)} />
    ),
  };
}
