# Console (Next.js) — imagem de produção.
#
# Multi-stage porque a imagem final não deve carregar o toolchain de build: só
# o servidor e o que ele executa. `output: standalone` do Next resolve as
# dependências do monorepo, então não precisamos do node_modules inteiro.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ── Dependências ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @otto/web build

# ── Produção ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Usuário sem privilégios: um processo web não precisa ser root.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs otto

COPY --from=build --chown=otto:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=otto:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=otto:nodejs /app/apps/web/public ./apps/web/public

USER otto
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "apps/web/server.js"]
