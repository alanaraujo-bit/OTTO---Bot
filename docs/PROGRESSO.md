# Progresso

Registro para retomar o trabalho se a sessão cair. O que já é verdade, o que
está em andamento, e o que vem em seguida. Estado declarado vive em
`tools/painel/estado.json` e aparece no painel; este arquivo guarda o detalhe.

Atualizado em 2026-09-03.

---

## Concluído

### Fase 0 · Fundação técnica

Infraestrutura no Railway (projeto `otto`, ambientes `development` e
`production`), Postgres 18.6 com pgvector 0.8.6 e busca textual em português,
Redis. Monorepo pnpm + Turborepo com `apps/web`, `apps/worker` e os pacotes
`shared`, `db`, `core`, `ui`.

Domínio modelado em 31 tabelas. Isolamento entre empresas por Row-Level Security:
27 tabelas protegidas, 4 fora por decisão registrada (identidade e webhook).
Três papéis de banco com fronteira real — aplicação, backoffice, migrações.

**Provado por:** 14 testes de integração contra banco real, incluindo uma trava
que falha se uma tabela nova entrar sem RLS.

**Dois bugs achados pelos testes:** colunas colidindo em `created_at`; e
`current_setting` devolvendo string vazia, o que fazia a política de RLS lançar
erro em vez de falhar em silêncio seguro. Resolvido com `app_tenant_id()`.

### Fase 1 · Identidade visual e design system

`PRODUCT.md` e `DESIGN.md` escritos. Mundo visual: instrumento de operação,
neutros quentes, IBM Plex auto-hospedada. Tokens com claro e escuro desenhados
separadamente, superfícies do navegador tematizadas, comportamento de aplicativo
no celular. Cinco primitivos, apenas os que a primeira tela usa.

**Provado por:** inspeção visual nos dois temas, contraste medido, detector
mecânico limpo, typecheck limpo.

**Três defeitos achados na inspeção:** Tailwind ignorando o pacote de UI (toda
classe descartada em silêncio); contraste terciário reprovado nos dois temas;
alvo de toque de 36 px no celular.

---

## Em andamento

### Fase 2 · Autenticação e sessão

Ver a seção "Próximos passos" abaixo.

---

## Decisões que não estão no código

- **Ordem alterada em relação ao pedido original:** a espinha vertical vem antes
  dos módulos completos. Prova que a cadeia é real antes de alargá-la.
- **O canal `simulador` é permanente**, não um andaime. Ele mantém a cadeia
  testável sem depender da Meta, hoje e depois.
- **Custo em micro-dólares inteiros**, nunca decimal — somar centenas de milhares
  de linhas em ponto flutuante acumula erro onde a conta precisa fechar.
- **Terminologia em português também no código.** `empresa`, `conversa`,
  `conhecimento`. O domínio é brasileiro e a tradução mental custa.

---

## Próximos passos

1. **Autenticação** — senha com Argon2id, sessão opaca revogável, seleção de
   empresa, papéis com verificação no servidor. Telas de entrar e de escolher
   empresa.
2. **Console** — shell com navegação desktop e mobile, Home operacional.
3. **Espinha vertical** — webhook do simulador, ingestão idempotente, orquestração
   de IA com provedor determinístico, registro de custo.
4. **Inbox** — conversa, modos, handoff.
5. Seguir o `docs/ROADMAP.md`.

## Como retomar

```bash
pnpm install
node --env-file=.env packages/db/src/bootstrap.ts   # só em banco novo
node --env-file=.env packages/db/src/migrate.ts
pnpm --filter @otto/web dev                          # console em :3000
node --env-file=.env tools/painel/servidor.mjs       # painel em :4400
```

Testes: `pnpm --filter @otto/db test` (precisa das variáveis do `.env`).
