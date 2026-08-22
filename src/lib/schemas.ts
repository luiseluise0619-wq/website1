import { z } from 'zod';
import { LOCALE_ORDER } from '@/lib/i18n';

/* =============================================================================
 * API 입력 스키마 (zod)
 * -----------------------------------------------------------------------------
 * 손으로 쓴 if 검사 대신 스키마 하나로 검증·정규화·타입추론을 함께 얻는다.
 * 라우트는 parse 결과만 신뢰하며, 실패 메시지는 그대로 클라이언트에 돌려준다.
 * ========================================================================== */

export const localeSchema = z.enum(LOCALE_ORDER as [string, ...string[]]);

/* ---- 번역 ------------------------------------------------------------------ */

/** DeepL 권장 상한과 맞춘 값 — 초과하면 요청이 통째로 실패하므로 미리 자른다 */
const MAX_TEXTS = 50;
const MAX_CHARS = 30_000;

export const translateRequestSchema = z
  .object({
    texts: z.array(z.string()).min(1, 'texts 배열이 필요합니다.').max(MAX_TEXTS, `한 번에 최대 ${MAX_TEXTS}개까지 번역할 수 있습니다.`),
    source: localeSchema,
    targets: z.array(localeSchema).min(1),
    html: z.boolean().optional(),
  })
  .refine((v) => v.texts.reduce((n, t) => n + t.length, 0) <= MAX_CHARS, {
    message: `요청 문자 수 상한(${MAX_CHARS})을 초과했습니다.`,
  });

/* ---- 문의 ------------------------------------------------------------------ */

export const inquiryRequestSchema = z.object({
  formName: z.string().min(1).max(64).default('inquiry'),
  locale: localeSchema.default('ko'),
  path: z.string().max(512).default('/'),
  /* 값은 전부 문자열로 강제하고 길이를 제한한다 — 저장소 오염 방지 */
  fields: z
    .record(z.string().max(64), z.coerce.string().max(4000))
    .refine((f) => Object.keys(f).length > 0, '문의 내용이 비어 있습니다.')
    .refine((f) => Object.keys(f).length <= 25, '입력 항목이 너무 많습니다.'),
  utm: z.record(z.string().max(32), z.string().max(256)).optional(),
});

export const inquiryStatusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['new', 'read', 'archived']),
});

/* ---- 분석 수집 -------------------------------------------------------------- */

export const analyticsBatchSchema = z.object({
  v: z.literal(1),
  sentAt: z.number(),
  events: z
    .array(
      z.object({
        eventId: z.string().min(1).max(128),
        type: z.string().min(1).max(64),
        ts: z.number(),
        context: z.object({
          anonymousId: z.string().max(128),
          sessionId: z.string().max(128),
          pageId: z.string().max(128),
          path: z.string().max(512),
          locale: z.string().max(8),
          device: z
            .object({
              type: z.enum(['desktop', 'tablet', 'mobile']).catch('desktop'),
              viewportWidth: z.number().optional(),
              viewportHeight: z.number().optional(),
              dpr: z.number().optional(),
              country: z.string().max(8).nullish(),
            })
            .passthrough(),
        }).passthrough(),
        payload: z.record(z.string(), z.unknown()),
      }),
    )
    .max(200),
});

/* ---- 관리자 로그인 ----------------------------------------------------------- */

export const loginSchema = z.object({
  password: z.string().min(1, '비밀번호를 입력하세요.').max(256),
});

/** zod 오류를 사람이 읽을 수 있는 한 줄로 */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return '잘못된 요청입니다.';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}
