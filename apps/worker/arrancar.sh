#!/bin/sh
# Arranque do worker em produção.
#
# O worker é o único serviço que prepara o banco antes de trabalhar, e é
# deliberado que seja ele: a imagem do `web` é o standalone do Next, que não
# carrega `packages/db`, enquanto esta carrega o pacote inteiro e já roda
# TypeScript por `tsx`.
#
# `set -e` é o ponto principal: se a preparação falhar, o processo morre e o
# deploy falha. Subir uma versão nova contra um banco antigo é pior do que não
# subir — é a regra que `migrate.ts` documenta.
#
# Os dois passos são idempotentes, então reinício de container ou segunda
# réplica apenas reconfirmam o estado em vez de duplicar trabalho:
#   · bootstrap — cria/realinha os papéis `otto_app` e `otto_platform` com a
#     senha que já está nas próprias URLs de conexão;
#   · migrate — aplica só as migrações pendentes, com a tabela de controle do
#     drizzle decidindo o que falta.
set -e

echo "[arranque] preparando papéis do banco"
node packages/db/src/bootstrap.ts

echo "[arranque] aplicando migrações pendentes"
node packages/db/src/migrate.ts

# Primeira empresa do ambiente. Inerte quando PROVISIONAR_SLUG não existe, que
# é o caso em todo deploy depois do primeiro.
node packages/db/src/provisionar.ts

# Canal real do ambiente. Inerte quando CANAL_EXTERNAL_ID não existe.
node packages/db/src/cadastrar-canal.ts

# Base de conhecimento de validação. Inerte sem SEMEAR_CONHECIMENTO=1.
node packages/db/src/semear-conhecimento.ts

echo "[arranque] iniciando worker"
exec pnpm --filter @otto/worker start
