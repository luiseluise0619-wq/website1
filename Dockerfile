# =============================================================================
# K-SOHO GLOBAL — 컨테이너 이미지 (Fly.io / Railway / Render / 자체 서버 공용)
# 멀티스테이지로 빌드 도구를 최종 이미지에서 제외한다.
# =============================================================================

FROM node:22-alpine AS deps
WORKDIR /app
# 잠금 파일만 먼저 복사 — 소스가 바뀌어도 의존성 레이어 캐시가 살아남는다
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# standalone 출력을 켜는 스위치 (next.config.mjs 참조)
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
# 폰트는 빌드 시점에 내려받아 이미지에 포함된다 (런타임 외부 의존 없음)
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 루트로 실행하지 않는다
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# 헬스체크는 배포 직후 설정 상태까지 알려주는 /api/health 를 그대로 쓴다
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
