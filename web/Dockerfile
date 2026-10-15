# syntax=docker/dockerfile:1.7
#
# Savora — production image (Next.js standalone, multi-stage, non-root).
#
# Build:
#   docker build -t savora:$(git rev-parse --short HEAD) \
#     --build-arg APP_VERSION=$(git rev-parse --short HEAD) \
#     --build-arg NEXT_PUBLIC_APP_URL=https://savora.uz \
#     --build-arg ROOT_DOMAIN=savora.uz .
#
# DIQQAT: NEXT_PUBLIC_* va xavfsizlik sarlavhalari (CSP, ROOT_DOMAIN) BUILD vaqtida
# kodga "pishiriladi" — domen o'zgarsa image qayta yig'iladi. Sirlar (SESSION_SECRET,
# MONGO_URI, CRON_SECRET ...) image ichiga KIRMAYDI — faqat runtime'da env_file orqali.

ARG NODE_IMAGE=node:20-alpine

# ── 1) deps: faqat bog'liqliklar (kesh qatlami) ─────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── 2) build ────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ARG APP_VERSION=dev
ARG NEXT_PUBLIC_APP_URL=https://savora.uz
ARG NEXT_PUBLIC_ROOT_DOMAIN=savora.uz
ARG ROOT_DOMAIN=savora.uz
ARG NEXT_PUBLIC_USE_PATH_ROUTING=true
ARG CSP_MODE=enforce
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_ROOT_DOMAIN=${NEXT_PUBLIC_ROOT_DOMAIN} \
    ROOT_DOMAIN=${ROOT_DOMAIN} \
    NEXT_PUBLIC_USE_PATH_ROUTING=${NEXT_PUBLIC_USE_PATH_ROUTING} \
    CSP_MODE=${CSP_MODE}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── 3) runner: minimal, root bo'lmagan foydalanuvchi ─────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Standalone server + statik fayllar
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Lokal yuklamalar (R2 sozlanmagan bo'lsa) — docker-compose'da volume ulanadi
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

USER nextjs
EXPOSE 3000

# Readiness (DB ping bilan). wget — alpine busybox'da bor.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server.js"]
