import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  contentTypeEnum,
  conversationModeEnum,
  conversationStatusEnum,
  createdAt,
  messageAuthorEnum,
  messageDirectionEnum,
  messageStatusEnum,
  primaryId,
  updatedAt,
} from './_shared.ts';
import { channels } from './channels.ts';
import { contacts, tags } from './contacts.ts';
import { users } from './identity.ts';

/**
 * Uma conversa: um contato, um canal, um fio contínuo de atendimento.
 *
 * Conversa não é a mesma coisa que caso. Perguntar o horário é uma conversa e não
 * deve virar um card em lugar nenhum. Casos (Kanban) referenciam conversas quando
 * a situação realmente exige acompanhamento.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    channelId: uuid('channel_id').notNull(),

    status: conversationStatusEnum('status').notNull().default('aberta'),
    mode: conversationModeEnum('mode').notNull().default('automatico'),
    /** Quem está com a conversa. Nulo significa que ninguém assumiu. */
    assignedUserId: uuid('assigned_user_id'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),

    /**
     * Pausa temporária da IA, tipicamente após um humano assumir. Expira sozinha,
     * para que uma conversa esquecida volte a ser atendida em vez de ficar muda.
     */
    aiPausedUntil: timestamp('ai_paused_until', { withTimezone: true }),

    /** 0 = normal, 1 = alta, 2 = urgente. Ordena a fila da Inbox. */
    priority: smallint('priority').notNull().default(0),

    /** Resumo mantido pelo sistema, para o humano que assume não ter que ler tudo. */
    summary: text('summary'),
    summaryUpdatedAt: timestamp('summary_updated_at', { withTimezone: true }),
    /** Intenção predominante detectada. Alimenta analytics e regras. */
    intent: varchar('intent', { length: 60 }),
    /** -1 negativo, 0 neutro, 1 positivo. Só preenchido quando há sinal claro. */
    sentiment: smallint('sentiment'),

    firstInboundAt: timestamp('first_inbound_at', { withTimezone: true }),
    /** Base do "tempo médio de primeira resposta". */
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /** Quantas vezes a conversa passou da IA para um humano. */
    handoffCount: integer('handoff_count').notNull().default(0),
    /** Mensagens não lidas pela equipe. Zerado quando alguém abre a conversa. */
    unreadCount: integer('unread_count').notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // O índice que a Inbox usa o tempo todo: fila da empresa, mais recente primeiro.
    index('conversations_inbox_idx').on(t.tenantId, t.status, t.lastMessageAt),
    index('conversations_contact_idx').on(t.contactId, t.createdAt),
    index('conversations_assigned_idx')
      .on(t.tenantId, t.assignedUserId)
      .where(sql`assigned_user_id is not null`),
    index('conversations_channel_idx').on(t.channelId, t.lastMessageAt),
    // Uma conversa aberta por contato e canal — a próxima mensagem continua o fio
    // em vez de abrir um novo.
    uniqueIndex('conversations_open_key')
      .on(t.contactId, t.channelId)
      .where(sql`status in ('aberta','aguardando_cliente','aguardando_humano')`),
  ],
);

/**
 * Mensagem. A tabela que mais cresce — o resto do schema é dimensionado ao redor dela.
 */
export const messages = pgTable(
  'messages',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),

    direction: messageDirectionEnum('direction').notNull(),
    author: messageAuthorEnum('author').notNull(),
    /** Preenchido quando o autor é um operador. */
    authorUserId: uuid('author_user_id'),

    contentType: contentTypeEnum('content_type').notNull().default('texto'),
    /** Texto da mensagem, ou a legenda quando há mídia. */
    body: text('body'),
    /** Mídia, localização, contato — formato por tipo em `@otto/core/conversations`. */
    attachments: jsonb('attachments').notNull().default(sql`'[]'::jsonb`),

    status: messageStatusEnum('status').notNull().default('pendente'),
    /** Id da mensagem no provedor. Também deduplica o eco do próprio envio. */
    externalId: varchar('external_id', { length: 200 }),
    /**
     * Chave de idempotência do envio. Impede que um clique duplo, ou um retry de
     * fila, mande a mesma mensagem duas vezes para o cliente.
     */
    idempotencyKey: varchar('idempotency_key', { length: 100 }),

    /** Execução do agente que gerou esta mensagem, quando houve uma. */
    aiRunId: uuid('ai_run_id'),
    /**
     * Guardado quando um humano edita a sugestão do Copilot antes de enviar.
     * É um dos sinais mais valiosos de aprendizado: mostra o que a IA errou.
     */
    originalDraft: text('original_draft'),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),

    createdAt: createdAt(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    index('messages_tenant_created_idx').on(t.tenantId, t.createdAt),
    uniqueIndex('messages_external_key')
      .on(t.tenantId, t.externalId)
      .where(sql`external_id is not null`),
    uniqueIndex('messages_idempotency_key')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`idempotency_key is not null`),
    index('messages_pending_idx')
      .on(t.status, t.createdAt)
      .where(sql`status in ('pendente','enviando')`),
  ],
);

/**
 * Linha do tempo operacional da conversa: quem assumiu, quando o modo mudou,
 * por que houve handoff. Separada das mensagens porque o cliente nunca vê isso,
 * e porque é o que responde "o que aconteceu nesse atendimento?".
 */
export const conversationEvents = pgTable(
  'conversation_events',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    /** `modo_alterado`, `assumida`, `liberada`, `handoff`, `resolvida`, `reaberta`… */
    type: varchar('type', { length: 40 }).notNull(),
    /** Nulo quando quem agiu foi o sistema. */
    actorUserId: uuid('actor_user_id'),
    /** Contexto do evento: de/para, motivo, confiança. */
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('conversation_events_conversation_idx').on(t.conversationId, t.createdAt)],
);

/** Nota interna. Nunca é enviada ao cliente. */
export const conversationNotes = pgTable(
  'conversation_notes',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    authorUserId: uuid('author_user_id').notNull(),
    body: text('body').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('conversation_notes_conversation_idx').on(t.conversationId, t.createdAt)],
);

export const conversationTags = pgTable(
  'conversation_tags',
  {
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    tagId: uuid('tag_id').notNull(),
    /** Nulo quando a etiqueta foi aplicada por uma regra ou pela IA. */
    appliedBy: uuid('applied_by'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.tagId] }),
    index('conversation_tags_tag_idx').on(t.tagId),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  channel: one(channels, { fields: [conversations.channelId], references: [channels.id] }),
  assignedUser: one(users, { fields: [conversations.assignedUserId], references: [users.id] }),
  messages: many(messages),
  events: many(conversationEvents),
  notes: many(conversationNotes),
  tags: many(conversationTags),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  authorUser: one(users, { fields: [messages.authorUserId], references: [users.id] }),
}));

export const conversationEventsRelations = relations(conversationEvents, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationEvents.conversationId],
    references: [conversations.id],
  }),
  actor: one(users, { fields: [conversationEvents.actorUserId], references: [users.id] }),
}));

export const conversationNotesRelations = relations(conversationNotes, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationNotes.conversationId],
    references: [conversations.id],
  }),
  author: one(users, { fields: [conversationNotes.authorUserId], references: [users.id] }),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTags.conversationId],
    references: [conversations.id],
  }),
  tag: one(tags, { fields: [conversationTags.tagId], references: [tags.id] }),
}));
