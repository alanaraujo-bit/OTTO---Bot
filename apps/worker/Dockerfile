# Worker — imagem de produção.
#
# Roda TypeScript direto por tsx: o worker é código nosso, sem passo de bundle,
# e um build separado só acrescentaria uma etapa que pode divergir do que os
# testes exercitam.

FROM node:24-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile --filter @otto/worker...

COPY packages ./packages
COPY apps/worker ./apps/worker

RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs otto && chown -R otto:nodejs /app
USER otto

CMD ["pnpm", "--filter", "@otto/worker", "start"]
