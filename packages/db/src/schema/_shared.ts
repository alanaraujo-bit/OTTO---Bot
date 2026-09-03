import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Convenções do schema.
 *
 * Chaves primárias são UUID v7 gerados pelo Postgres 18 (`uuidv7()`), ordenáveis por
 * tempo — as tabelas que mais crescem, como mensagens e eventos, são sempre lidas em
 * ordem cronológica, e chaves aleatórias espalhariam as escritas pelo índice inteiro.
 *
 * Datas são sempre `timestamptz`. Nenhuma coluna guarda hora sem fuso: o servidor
 * pensa em UTC, a empresa pensa no fuso dela, e misturar os dois é como se perde
 * a hora de funcionamento na virada do horário de verão.
 */

export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);

export const tenantRef = () => uuid('tenant_id').notNull();

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Carimbo obrigatório com nome próprio — `first_seen_at`, `received_at`,
 * `occurred_at`. Existe para que uma data de negócio não seja apelidada de
 * `created_at`: a hora em que a linha foi gravada e a hora em que o fato
 * aconteceu não são a mesma coisa, e confundi-las estraga qualquer análise.
 */
export const stampedAt = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/** Exclusão lógica. Usada onde o histórico precisa sobreviver à remoção. */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

// ─── Enumerações do domínio ────────────────────────────────────────────────────
// Enums do Postgres, não texto livre: um valor inválido é rejeitado pelo banco,
// não descoberto meses depois em um relatório.

export const tenantStatusEnum = pgEnum('tenant_status', [
  'ativo',
  'suspenso',
  'em_implantacao',
  'encerrado',
]);

export const membershipRoleEnum = pgEnum('membership_role', [
  'proprietario',
  'administrador',
  'supervisor',
  'atendente',
  'analista',
  'visualizacao',
]);

export const platformRoleEnum = pgEnum('platform_role', ['fundador', 'suporte']);

export const channelKindEnum = pgEnum('channel_kind', ['whatsapp', 'instagram', 'simulador']);

export const channelStatusEnum = pgEnum('channel_status', [
  'nao_conectado',
  'conectado',
  'degradado',
  'desconectado',
  'pausado',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'aberta',
  'aguardando_cliente',
  'aguardando_humano',
  'resolvida',
  'encerrada',
]);

export const conversationModeEnum = pgEnum('conversation_mode', [
  'automatico',
  'copilot',
  'humano',
]);

export const messageDirectionEnum = pgEnum('message_direction', ['entrada', 'saida']);

export const messageAuthorEnum = pgEnum('message_author', ['cliente', 'agente', 'operador', 'sistema']);

export const messageStatusEnum = pgEnum('message_status', [
  'pendente',
  'enviando',
  'enviada',
  'entregue',
  'lida',
  'falhou',
]);

export const contentTypeEnum = pgEnum('content_type', [
  'texto',
  'imagem',
  'audio',
  'video',
  'documento',
  'localizacao',
  'contato',
  'figurinha',
  'nao_suportado',
]);

export const knowledgeStatusEnum = pgEnum('knowledge_status', [
  'rascunho',
  'em_aprovacao',
  'publicado',
  'desatualizado',
  'arquivado',
]);

export const knowledgeKindEnum = pgEnum('knowledge_kind', [
  'fato',
  'pergunta_frequente',
  'politica',
  'procedimento',
  'servico',
  'horario',
  'localizacao',
  'documento',
]);

export const suggestionStatusEnum = pgEnum('suggestion_status', [
  'aberta',
  'em_analise',
  'aceita',
  'recusada',
  'expirada',
]);

export const webhookStatusEnum = pgEnum('webhook_status', [
  'recebido',
  'processando',
  'processado',
  'falhou',
  'descartado',
]);
