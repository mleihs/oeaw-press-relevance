# syntax=docker/dockerfile:1
#
# Multi-stage build for self-hosting on Coolify/Docker (Next.js 16 standalone).
# Vercel ignores this file (it builds via its own Build Output API), so adding
# it does not affect the existing Vercel deployment.
#
# Build flow: deps (npm ci) -> builder (fumadocs-mdx prebuild + next build,
# output:standalone) -> runner (minimal, non-root, node server.js).

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- Dependencies (cached on package*.json) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-baked public vars: pass the REAL values as Coolify *Build* variables.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NODE_ENV=production

# `npm run build` runs the `prebuild` hook (fumadocs-mdx codegen -> .source/)
# then `next build` (type-checking on; ignoreBuildErrors:false).
# Server-only build placeholders are passed INLINE (not as ENV) so any
# boot-time env validation that may run during the build (instrumentation.ts
# -> validateEnv) passes. Inline => they never persist in an image layer and
# don't trip the SecretsUsedInArgOrEnv linter; real values come from Coolify
# at runtime.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder \
    GATE_PASSWORD=build-placeholder \
    GATE_TOKEN=build-placeholder \
    npm run build

# ---- Runner (standalone) ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone output: server.js + pruned node_modules + .next/server.
# static assets and public/ must be copied alongside it.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Liveness: server responds at all (gate may 3xx/401, that's still "up").
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
