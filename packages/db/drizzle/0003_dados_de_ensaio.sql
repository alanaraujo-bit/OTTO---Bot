-- Distinção entre atendimento real e ensaio.
--
-- Escrito à mão como as demais: é uma decisão de domínio, não um detalhe de
-- serialização.
--
-- ## O problema
--
-- Produção acumulou conversas de teste — nossas e do próprio dono da empresa
-- ensaiando o produto. Elas são úteis e devem continuar existindo: é por elas
-- que se diagnostica o que aconteceu. Mas elas entram nas métricas comerciais
-- como se fossem clientes, e o estrago é grande: "9 conversas, 9 encaminhadas,
-- 0 resolvidas pela Bia" descrevia, na verdade, seis meses de ensaio.
--
-- Até agora a única forma de reconhecê-las era o nome do contato ("Ensaio").
-- Isso é frágil de um jeito que apodrece: depende de quem digitou, quebra em
-- qualquer variação, e não sobrevive a um cliente de verdade chamado Ensaio.
--
-- ## A decisão
--
-- O marcador vive na **conversa**, não no contato, porque a mesma pessoa pode
-- ensaiar hoje e ser cliente amanhã — foi exatamente o caso do número do Alan
-- em produção. O contato carrega um marcador próprio que serve de *padrão
-- herdado* na criação, não de verdade sobre cada conversa.
--
-- `NOT NULL DEFAULT false` é deliberado: sem terceiro estado. Uma conversa é
-- real até que alguém diga o contrário, e nenhuma consulta precisa lidar com
-- `NULL` significando "não sei" — que na prática viraria "conta como real" em
-- metade dos lugares e "ignora" na outra.

ALTER TABLE "contacts"
  ADD COLUMN "is_test" boolean NOT NULL DEFAULT false;--> statement-breakpoint

COMMENT ON COLUMN "contacts"."is_test" IS
  'Contato usado para ensaio. Serve de padrão herdado pelas conversas criadas a partir dele; a verdade por conversa está em conversations.is_test.';--> statement-breakpoint

ALTER TABLE "conversations"
  ADD COLUMN "is_test" boolean NOT NULL DEFAULT false,
  ADD COLUMN "test_marked_at" timestamp with time zone,
  ADD COLUMN "test_marked_by" uuid;--> statement-breakpoint

COMMENT ON COLUMN "conversations"."is_test" IS
  'Conversa de ensaio. Excluída de toda métrica comercial por definição.';--> statement-breakpoint

-- Quem marcou e quando. Um número que some do painel precisa ter uma pessoa
-- atrás da decisão — senão "as métricas mudaram" vira mistério. `NULL` em
-- `test_marked_by` com `is_test` verdadeiro significa marcação automática (por
-- semente ou script), e isso também é uma informação.
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_test_marked_by_fk"
  FOREIGN KEY ("test_marked_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Índice parcial: as métricas filtram `is_test = false`, que é a esmagadora
-- maioria das linhas, então indexar isso não ajudaria. O que vale indexar é o
-- conjunto pequeno — a tela do Backoffice que **procura** os ensaios.
CREATE INDEX "conversations_ensaio_idx"
  ON "conversations" ("tenant_id", "last_message_at" DESC)
  WHERE "is_test";--> statement-breakpoint

-- As fixtures que hoje contaminam produção e desenvolvimento.
--
-- Marcadas, não apagadas: o histórico continua auditável, e a conversa que
-- provou o envio pelo WhatsApp funcionando de ponta a ponta é justamente uma
-- delas. `test_marked_by` fica nulo porque quem marcou foi esta migração.
--
-- O critério por nome é usado **uma única vez**, aqui, para reconhecer o que já
-- existe. É o que permite parar de depender dele daqui para frente.
UPDATE "contacts"
   SET "is_test" = true
 WHERE "display_name" ILIKE 'ensaio%';--> statement-breakpoint

UPDATE "conversations" c
   SET "is_test" = true,
       "test_marked_at" = now()
  FROM "contacts" ct
 WHERE ct."id" = c."contact_id"
   AND ct."is_test";
