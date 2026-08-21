'use client';

import React from 'react';
import {
  Award, Building2, Check, ChevronRight, Clock, Factory, Film, Globe, Handshake, Heart,
  Leaf, Mail, MapPin, Monitor, Package, Phone, Play, Send, Share2, Ship,
  ShoppingBag, Sparkles, Star, Truck,
} from 'lucide-react';
import { BlockShell } from './shared';
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
