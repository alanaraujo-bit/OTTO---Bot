import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

import {
  createdAt,
  knowledgeKindEnum,
  knowledgeStatusEnum,
  primaryId,
  suggestionStatusEnum,
  updatedAt,
} from './_shared.ts';
import { users } from './identity.ts';

/**
 * Dimensão dos embeddings. Fixa na coluna por necessidade do índice HNSW.
 * Trocar de modelo de embedding exige migração e reindexação — está documentado
 * em docs/DECISIONS.md porque não é uma troca barata.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export const knowledgeCategories = pgTable(
  'knowledge_categories',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    description: varchar('description', { length: 240 }),
    /** Ordem de exibição definida pelo administrador. */
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('knowledge_categories_key').on(t.tenantId, sql`lower(${t.name})`)],
);

/**
 * Um item de conhecimento — a unidade que o administrador enxerga e mantém.
 *
 * O conteúdo atual fica aqui; o histórico completo fica em `knowledge_versions`.
 * Publicar cria uma versão imutável, e é isso que permite responder "quando isso
 * mudou, quem mudou e o que dizia antes".
 */
export const knowledgeItems = pgTable(
  'knowledge_items',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    categoryId: uuid('category_id'),
    kind: knowledgeKindEnum('kind').notNull().default('fato'),
    status: knowledgeStatusEnum('status').notNull().default('rascunho'),

    title: varchar('title', { length: 200 }).notNull(),
    /** O conteúdo que fundamenta a resposta. Texto, não prompt. */
    body: text('body').notNull(),
    /**
     * Outras formas de perguntar a mesma coisa. Melhora a recuperação sem
     * depender só do embedding — "tem estacionamento?" e "dá pra estacionar?".
     */
    aliases: jsonb('aliases').notNull().default(sql`'[]'::jsonb`),

    /** De onde veio a informação: quem informou, documento, conversa de origem. */
    sourceType: varchar('source_type', { length: 32 }).notNull().default('manual'),
    sourceRef: text('source_ref'),
    /** Conversa que originou o item, quando nasceu de uma sugestão de aprendizado. */
    sourceConversationId: uuid('source_conversation_id'),

    /** Fora dessa janela o item não é usado como fundamento. Para promoção sazonal. */
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    /** Quando revisar. Alimenta o alerta de informação possivelmente desatualizada. */
    reviewDueAt: timestamp('review_due_at', { withTimezone: true }),

    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    publishedBy: uuid('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    /** Quantas vezes este item fundamentou uma resposta. Mostra o que realmente serve. */
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('knowledge_items_tenant_status_idx').on(t.tenantId, t.status),
    index('knowledge_items_category_idx').on(t.categoryId),
    index('knowledge_items_review_idx')
      .on(t.tenantId, t.reviewDueAt)
      .where(sql`review_due_at is not null`),
  ],
);

/** Versão imutável. Uma linha por publicação. */
export const knowledgeVersions = pgTable(
  'knowledge_versions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    itemId: uuid('item_id').notNull(),
    version: integer('version').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    kind: knowledgeKindEnum('kind').notNull(),
    /** O que mudou e por quê, escrito por quem publicou. */
    changeNote: varchar('change_note', { length: 300 }),
    authorId: uuid('author_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('knowledge_versions_key').on(t.itemId, t.version)],
);

/**
 * Fragmento indexado para recuperação.
 *
 * Itens curtos viram um fragmento só. Documentos longos são quebrados, porque
 * recuperar uma política inteira para responder "aceita PIX?" desperdiça contexto
 * e dilui o sinal.
 *
 * Dois caminhos de busca convivem aqui: `content_tsv` (full-text em português, sem
 * acento) é uma coluna gerada criada na migração, e `embedding` é vetorial. Nenhum
 * depende do outro — se a geração de embedding falhar, a busca textual continua.
 */
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    itemId: uuid('item_id').notNull(),
    /** Posição do fragmento dentro do item. */
    position: smallint('position').notNull().default(0),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    /** Modelo que gerou o vetor. Sem isso, uma troca de modelo mistura espaços diferentes. */
    embeddingModel: varchar('embedding_model', { length: 64 }),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    tokenCount: integer('token_count'),
    createdAt: createdAt(),
  },
  (t) => [
    index('knowledge_chunks_item_idx').on(t.itemId, t.position),
    index('knowledge_chunks_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Sinal bruto captado durante um atendimento.
 *
 * É o insumo do aprendizado, e por si só não muda nada. Cliente pode estar errado,
 * pode brincar, pode mentir; a IA pode ter respondido mal. Nada aqui vira
 * conhecimento sem passar por `knowledge_suggestions` e por um humano.
 */
export const knowledgeSignals = pgTable(
  'knowledge_signals',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    /**
     * `sem_resultado`, `confianca_baixa`, `handoff_pedido`, `resposta_corrigida`,
     * `cliente_insatisfeito`, `pergunta_recorrente`.
     */
    type: varchar('type', { length: 40 }).notNull(),
    conversationId: uuid('conversation_id'),
    messageId: uuid('message_id'),
    /** A pergunta do cliente, normalizada. Base para agrupar recorrência. */
    queryText: text('query_text'),
    confidence: real('confidence'),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    /** Marcado quando o sinal já foi contabilizado em uma sugestão. */
    aggregatedAt: timestamp('aggregated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('knowledge_signals_tenant_type_idx').on(t.tenantId, t.type, t.createdAt),
    index('knowledge_signals_pending_idx')
      .on(t.tenantId, t.createdAt)
      .where(sql`aggregated_at is null`),
  ],
);

/**
 * Sugestão de melhoria apresentada ao administrador.
 *
 * "14 clientes perguntaram esta semana se vocês aceitam vale-alimentação, e isso
 * não está na base." Aceitar cria um item de conhecimento; recusar ensina o
 * sistema a não sugerir de novo.
 */
export const knowledgeSuggestions = pgTable(
  'knowledge_suggestions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    /** `conhecimento_ausente`, `conhecimento_desatualizado`, `resposta_corrigida`. */
    type: varchar('type', { length: 40 }).notNull(),
    status: suggestionStatusEnum('status').notNull().default('aberta'),
    title: varchar('title', { length: 200 }).notNull(),
    /** Por que estamos sugerindo isso, em linguagem de negócio. */
    rationale: text('rationale').notNull(),
    /** Rascunho proposto. Sempre editável antes de virar conhecimento. */
    proposedBody: text('proposed_body'),
    /** Item existente ao qual a sugestão se refere, quando é atualização. */
    relatedItemId: uuid('related_item_id'),
    /** Conversas e mensagens que sustentam a sugestão — permite conferir a evidência. */
    evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
    occurrences: integer('occurrences').notNull().default(1),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** 0..1. Ordena a fila de revisão por impacto estimado. */
    priority: real('priority').notNull().default(0),

    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: varchar('review_note', { length: 300 }),
    /** Item criado ao aceitar. Fecha o ciclo e permite medir o resultado. */
    resultingItemId: uuid('resulting_item_id'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('knowledge_suggestions_queue_idx').on(t.tenantId, t.status, t.priority),
    index('knowledge_suggestions_related_idx').on(t.relatedItemId),
  ],
);

export const knowledgeItemsRelations = relations(knowledgeItems, ({ one, many }) => ({
  category: one(knowledgeCategories, {
    fields: [knowledgeItems.categoryId],
    references: [knowledgeCategories.id],
  }),
  versions: many(knowledgeVersions),
  chunks: many(knowledgeChunks),
  author: one(users, { fields: [knowledgeItems.createdBy], references: [users.id] }),
}));

export const knowledgeVersionsRelations = relations(knowledgeVersions, ({ one }) => ({
  item: one(knowledgeItems, {
    fields: [knowledgeVersions.itemId],
    references: [knowledgeItems.id],
  }),
  author: one(users, { fields: [knowledgeVersions.authorId], references: [users.id] }),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  item: one(knowledgeItems, { fields: [knowledgeChunks.itemId], references: [knowledgeItems.id] }),
}));

export const knowledgeSuggestionsRelations = relations(knowledgeSuggestions, ({ one }) => ({
  relatedItem: one(knowledgeItems, {
    fields: [knowledgeSuggestions.relatedItemId],
    references: [knowledgeItems.id],
  }),
  reviewer: one(users, { fields: [knowledgeSuggestions.reviewedBy], references: [users.id] }),
}));
