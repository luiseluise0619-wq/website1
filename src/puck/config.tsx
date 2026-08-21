'use client';

import React from 'react';
import type { Config } from '@puckeditor/core';
import {
  ButtonBlock,
  ContainerBlock,
  DividerBlock,
  EmbedBlock,
  FreeCanvasBlock,
  ImageBlock,
  SectionBlock,
  ShapeBlock,
  SpacerBlock,
  TextBlock,
  VideoBlock,
} from './blocks';
import { FormBlock, type FormBlockProps } from './blocks/FormBlock';
import { localizedText } from './fields/LocalizedTextField';
import { placementField, styleField } from './fields/StyleFields';
import type {
  BaseBlockProps,
  ContainerProps,
  DividerProps,
  ImageProps,
  ShapeProps,
  TextProps,
  VideoProps,
} from '@/types/schema';
import type { ButtonBlockProps } from './blocks';

/* =============================================================================
 * Puck Config — K-SOHO GLOBAL 블록 라이브러리 등록
 * -----------------------------------------------------------------------------
 * 모든 블록이 공통으로 갖는 필드:
 *   style      → 우측 스타일 인스펙터 (색/폰트/여백/테두리/그림자)
 *   placement  → FreeCanvas 안에서의 X/Y/Z 자유 좌표
 *   trackingId → data-element-id (히트맵 집계 키)
 * ========================================================================== */

/**
 * 블록 → props 매핑. Puck 의 Config 제네릭에 넘겨 필드와 렌더 props 의
 * 타입 정합성을 컴파일 타임에 강제한다.
 */
export type KsohoBlocks = {
  Section: ContainerProps & BaseBlockProps;
  FreeCanvas: { height: number; snap?: number } & BaseBlockProps;
  Container: ContainerProps & BaseBlockProps;
  Spacer: { size: number };
  Divider: DividerProps & BaseBlockProps;
  Text: TextProps & BaseBlockProps;
  Button: ButtonBlockProps & BaseBlockProps;
  Image: ImageProps & BaseBlockProps;
  Video: VideoProps & BaseBlockProps;
  Shape: ShapeProps & BaseBlockProps;
  Embed: { html: string } & BaseBlockProps;
  Form: FormBlockProps & BaseBlockProps;
};

export type KsohoRootProps = { background: string; fontFamily: string };

const commonFields = {
  style: styleField('스타일'),
  placement: placementField(),
  trackingId: { type: 'text' as const, label: '추적 ID (data-element-id)' },
  name: { type: 'text' as const, label: '레이어 이름' },
  conversionGoal: { type: 'text' as const, label: '전환 목표명 (선택)' },
};

const commonDefaults = {
  style: {},
  placement: undefined,
  trackingId: '',
  name: '',
  conversionGoal: '',
};

export const puckConfig: Config<KsohoBlocks, KsohoRootProps> = {
  categories: {
    layout: { title: '레이아웃', components: ['Section', 'FreeCanvas', 'Container', 'Spacer', 'Divider'] },
    content: { title: '콘텐츠', components: ['Text', 'Button', 'Image'] },
    media: { title: '미디어', components: ['Video', 'Shape', 'Embed'] },
    business: { title: '비즈니스', components: ['Form'] },
  },

  components: {
    /* ---- 레이아웃 ---- */
    Section: {
      label: '섹션',
      fields: {
        layoutMode: {
          type: 'select',
          label: '자식 배치',
          options: [
            { label: 'Flex', value: 'flex' },
            { label: 'Grid', value: 'grid' },
            { label: '자유(Absolute)', value: 'absolute' },
          ],
        },
        contentMaxWidth: { type: 'number', label: '콘텐츠 최대 폭' },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        layoutMode: 'flex',
        contentMaxWidth: 1280,
        name: 'Section',
        style: { padding: { top: 80, right: 24, bottom: 80, left: 24 }, background: { color: '#ffffff' } },
      },
      render: (props) => <SectionBlock {...props} />,
    },

    FreeCanvas: {
      label: '자유 캔버스 (X/Y 배치)',
      fields: {
        height: { type: 'number', label: '캔버스 높이' },
        snap: { type: 'number', label: '스냅 간격(px)' },
        ...commonFields,
      },
      defaultProps: { ...commonDefaults, height: 640, snap: 8, name: 'Free Canvas', style: { background: { color: '#0d0f14' } } },
      render: (props) => <FreeCanvasBlock {...props} />,
    },

    Container: {
      label: '컨테이너',
      fields: {
        layoutMode: {
          type: 'radio',
          label: '레이아웃',
          options: [
            { label: 'Flex', value: 'flex' },
            { label: 'Grid', value: 'grid' },
          ],
        },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        layoutMode: 'flex',
        name: 'Container',
        style: {
          width: '100%',
          padding: { top: 24, right: 24, bottom: 24, left: 24 },
          flex: { direction: 'row', gap: 24, align: 'stretch', justify: 'flex-start', wrap: 'wrap' },
          grid: { columns: 3, gap: 24 },
        },
      },
      render: (props) => <ContainerBlock {...props} />,
    },

    Spacer: {
      label: '여백',
      fields: { size: { type: 'number', label: '높이(px)' } },
      defaultProps: { size: 64 },
      render: (props) => <SpacerBlock {...props} />,
    },

    Divider: {
      label: '구분선',
      fields: {
        orientation: {
          type: 'radio',
          label: '방향',
          options: [
            { label: '가로', value: 'horizontal' },
            { label: '세로', value: 'vertical' },
          ],
        },
        thickness: { type: 'number', label: '두께' },
        color: { type: 'text', label: '색상' },
        ...commonFields,
      },
      defaultProps: { ...commonDefaults, orientation: 'horizontal', thickness: 1, color: '#e5e7eb', name: 'Divider' },
      render: (props) => <DividerBlock {...props} />,
    },

    /* ---- 콘텐츠 ---- */
    Text: {
      label: '텍스트',
      fields: {
        html: localizedText('텍스트 (다국어)', true),
        tag: {
          type: 'select',
          label: '태그',
          options: [
            { label: 'H1', value: 'h1' },
            { label: 'H2', value: 'h2' },
            { label: 'H3', value: 'h3' },
            { label: '본문 P', value: 'p' },
            { label: '인용', value: 'blockquote' },
          ],
        },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        html: { ko: '제목을 입력하세요' },
        tag: 'h2',
        name: 'Text',
        style: { color: '#111827', typography: { fontSize: 36, fontWeight: 700, lineHeight: 1.3 } },
      },
      render: (props) => <TextBlock {...props} />,
    },

    Button: {
      label: '버튼',
      fields: {
        label: localizedText('버튼 라벨 (다국어)'),
        action: {
          type: 'object',
          label: '동작',
          objectFields: {
            type: {
              type: 'select',
              label: '유형',
              options: [
                { label: '내부 이동', value: 'navigate' },
                { label: '외부 링크', value: 'externalLink' },
                { label: '스크롤 이동', value: 'scrollTo' },
                { label: '없음', value: 'none' },
              ],
            },
            value: { type: 'text', label: '대상 (경로/URL/요소ID)' },
            target: {
              type: 'radio',
              label: '창',
              options: [
                { label: '현재 창', value: '_self' },
                { label: '새 창', value: '_blank' },
              ],
            },
          },
        },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        label: { ko: '자세히 보기' },
        action: { type: 'navigate', value: '/brand', target: '_self' },
        name: 'Button',
        conversionGoal: '',
        style: {
          width: 190,
          height: 54,
          color: '#ffffff',
          background: { color: '#111827' },
          border: { radius: 999, style: 'none' },
          typography: { fontSize: 15, fontWeight: 600, textAlign: 'center' },
          flex: { direction: 'row', justify: 'center', align: 'center', gap: 8 },
          cursor: 'pointer',
          transition: 'all .18s ease',
        },
        states: { hover: { background: { color: '#3b82f6' }, transform: { scale: 1.03 } } },
      },
      render: (props) => <ButtonBlock {...props} />,
    },

    Image: {
      label: '이미지',
      fields: {
        src: { type: 'text', label: '이미지 URL' },
        alt: localizedText('대체 텍스트 (다국어)'),
        objectFit: {
          type: 'select',
          label: '채우기',
          options: [
            { label: 'Cover', value: 'cover' },
            { label: 'Contain', value: 'contain' },
            { label: 'Fill', value: 'fill' },
          ],
        },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        src: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&q=80',
        alt: { ko: '이미지 설명' },
        objectFit: 'cover',
        name: 'Image',
        style: { width: 480, height: 320, border: { radius: 12 }, overflow: 'hidden' },
      },
      render: (props) => <ImageBlock {...props} />,
    },

    /* ---- 미디어 ---- */
    Video: {
      label: '동영상 / Shorts',
      fields: {
        provider: {
          type: 'select',
          label: '제공자',
          options: [
            { label: 'YouTube', value: 'youtube' },
            { label: 'YouTube Shorts', value: 'youtube-shorts' },
            { label: 'Vimeo', value: 'vimeo' },
            { label: '직접 파일', value: 'file' },
          ],
        },
        source: { type: 'text', label: '비디오 ID 또는 URL' },
        autoplay: { type: 'radio', label: '자동재생', options: [{ label: '켬', value: true }, { label: '끔', value: false }] },
        loop: { type: 'radio', label: '반복', options: [{ label: '켬', value: true }, { label: '끔', value: false }] },
        controls: { type: 'radio', label: '컨트롤', options: [{ label: '표시', value: true }, { label: '숨김', value: false }] },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        provider: 'youtube',
        source: 'dQw4w9WgXcQ',
        autoplay: false,
        loop: false,
        controls: true,
        name: 'Video',
        style: { width: 640, height: 360, border: { radius: 12 }, overflow: 'hidden' },
      },
      render: (props) => <VideoBlock {...props} />,
    },

    Shape: {
      label: '도형',
      fields: {
        kind: {
          type: 'select',
          label: '형태',
          options: [
            { label: '사각형', value: 'rect' },
            { label: '원', value: 'circle' },
            { label: '타원', value: 'ellipse' },
            { label: '선', value: 'line' },
            { label: '삼각형', value: 'triangle' },
            { label: '커스텀 SVG', value: 'svg' },
          ],
        },
        fill: { type: 'text', label: '채우기 색' },
        stroke: { type: 'text', label: '선 색' },
        strokeWidth: { type: 'number', label: '선 두께' },
        svgPath: { type: 'textarea', label: 'SVG path (d)' },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        kind: 'rect',
        fill: '#3b82f6',
        strokeWidth: 0,
        name: 'Shape',
        style: { width: 240, height: 240 },
      },
      render: (props) => <ShapeBlock {...props} />,
    },

    Embed: {
      label: 'HTML 임베드',
      fields: {
        html: { type: 'textarea', label: 'HTML' },
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        html: '<div style="padding:24px;text-align:center">임베드 HTML</div>',
        name: 'Embed',
        style: { width: '100%', minHeight: 200 },
      },
      render: (props) => <EmbedBlock {...props} />,
    },

    /* ---- 비즈니스 ---- */
    Form: {
      label: '문의 폼',
      fields: {
        formName: { type: 'text', label: '폼 이름 (접수 데이터 분류 키)' },
        fields: {
          type: 'array',
          label: '입력 항목',
          arrayFields: {
            name: { type: 'text', label: '저장 키 (영문)' },
            label: localizedText('라벨 (다국어)'),
            type: {
              type: 'select',
              label: '유형',
              options: [
                { label: '한 줄 텍스트', value: 'text' },
                { label: '이메일', value: 'email' },
                { label: '전화번호', value: 'tel' },
                { label: '여러 줄', value: 'textarea' },
                { label: '선택', value: 'select' },
              ],
            },
            required: { type: 'radio', label: '필수', options: [{ label: '예', value: true }, { label: '아니오', value: false }] },
            placeholder: localizedText('안내 문구 (다국어)'),
            options: { type: 'textarea', label: '선택지 (줄바꿈 구분)' },
          },
          getItemSummary: (item: { name?: string }) => item?.name || '항목',
        },
        submitLabel: localizedText('제출 버튼 (다국어)'),
        successMessage: localizedText('접수 완료 메시지 (다국어)', true),
        consentLabel: localizedText('개인정보 동의 문구 (다국어)', true),
        ...commonFields,
      },
      defaultProps: {
        ...commonDefaults,
        formName: 'buyer-inquiry',
        name: 'Inquiry Form',
        conversionGoal: 'inquiry_submit',
        fields: [
          { name: 'company', label: { ko: '회사명', en: 'Company' }, type: 'text', required: true },
          { name: 'name', label: { ko: '담당자명', en: 'Contact name' }, type: 'text', required: true },
          { name: 'email', label: { ko: '이메일', en: 'Email' }, type: 'email', required: true },
          { name: 'country', label: { ko: '국가', en: 'Country' }, type: 'select', required: false, options: 'Thailand\nJapan\nVietnam\nSingapore\nUSA\nOther' },
          { name: 'message', label: { ko: '문의 내용', en: 'Message' }, type: 'textarea', required: true },
        ],
        submitLabel: { ko: '문의하기', en: 'Send inquiry' },
        successMessage: { ko: '문의가 접수되었습니다. 확인 후 연락드리겠습니다.', en: 'Thank you. We will get back to you shortly.' },
        consentLabel: { ko: '개인정보 수집 및 이용에 동의합니다.', en: 'I agree to the collection and use of my personal data.' },
        style: {
          width: '100%',
          maxWidth: 620,
          padding: { top: 32, right: 32, bottom: 32, left: 32 },
          background: { color: '#f8fafc' },
          border: { radius: 16, style: 'solid', width: 1, color: '#e2e8f0' },
        },
      },
      render: (props) => <FormBlock {...props} />,
    },
  },

  root: {
    fields: {
      background: { type: 'text', label: '페이지 배경색' },
      fontFamily: { type: 'text', label: '기본 폰트' },
    },
    defaultProps: { background: '#ffffff', fontFamily: "'Pretendard', system-ui, sans-serif" },
    render: ({ children, background, fontFamily }) => (
      <div style={{ background, fontFamily, minHeight: '100%' }}>{children}</div>
    ),
  },
};

export default puckConfig;
