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

# The -slim base omits the system CA bundle. Node ships its own (so npm works),
# but sentry-cli (Rust, uses the OS trust store) needs it to verify TLS when
# uploading source maps to Sentry during `next build`. Without it the upload
# fails with "[60] unable to get local issuer certificate" and production client
# stack traces stay minified. Installed in `base` so deps + builder inherit it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- Dependencies (cached on package*.json) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-baked public vars: pass the REAL values as Coolify *Build* variables.
# The NEXT_PUBLIC_SENTRY_* pair is client-inlined too (empty => client Sentry
# stays disabled, fail-open).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    NODE_ENV=production

# Sentry source-map upload (withSentryConfig, runs inside `next build`) needs the
# auth token + org/project. Coolify passes is_buildtime vars as --build-arg;
# promote them to ENV *in the builder stage only* so `next build` sees them
# reliably. The runner stage below starts FROM a fresh base (multi-stage), so the
# org:ci-scoped token — which can only upload source maps / create releases,
# never read data — never reaches the final image; it lives solely in the
# discarded builder. This is deliberately more robust than inline `${VAR}` on the
# RUN (whose expansion silently yielded no upload) and lets the guard below
# assert presence.
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

# Fail-loud, not silent no-op: without these creds the build still succeeds but
# ships minified production stack traces. Make the state unmissable in the log
# (never prints the token itself — length only).
RUN if [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ] && [ -n "$SENTRY_PROJECT" ]; then \
      echo "[sentry] build creds present (token ${#SENTRY_AUTH_TOKEN} chars, org=$SENTRY_ORG, project=$SENTRY_PROJECT) -> source maps will upload"; \
    else \
      echo "[sentry] WARNING: build creds MISSING -> source maps will NOT upload; production client stacks stay minified"; \
    fi

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
