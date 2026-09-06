-- Resposta citada: responder uma mensagem específica, como no WhatsApp.
--
-- Escrita à mão como as demais: é uma decisão de domínio, não um detalhe de
-- serialização.
--
-- ## Por que uma referência, e não uma cópia do texto
--
-- A alternativa seria guardar o trecho citado junto da resposta. Seria mais
-- barato de ler — nenhum join — e está errado: a citação congelaria no momento
-- do envio e divergiria da original assim que ela for apagada. O WhatsApp
-- mostra a citação sempre viva, e é isso que quem opera espera ver.
--
-- ## Por que SET NULL, e não CASCADE
--
-- Apagar a mensagem citada não pode levar a resposta junto. A resposta é fala
-- de alguém — do cliente ou de quem atende — e continua sendo verdade sobre o
-- atendimento mesmo quando o que ela citava deixou de existir. Com CASCADE,
-- apagar uma mensagem abriria buracos no meio da conversa.
--
-- ## Por que a coluna aceita nulo sem terceiro estado
--
-- Nulo aqui significa exatamente uma coisa: a mensagem não cita nenhuma outra.
-- É o caso da esmagadora maioria delas, e nenhuma consulta precisa distinguir
-- "não cita" de "não sei".

ALTER TABLE "messages"
  ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_fk"
  FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL;--> statement-breakpoint

-- Só as respostas entram no índice. A coluna é nula na maioria esmagadora das
-- linhas, e um índice sobre todas elas seria quase todo desperdício.
CREATE INDEX "messages_reply_to_idx"
  ON "messages" ("reply_to_message_id")
  WHERE reply_to_message_id is not null;
