import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, primaryId, stampedAt } from './_shared.ts';

/**
 * Uma execução do agente.
 *
 * Toda chamada a um modelo passa por aqui. É o que sustenta três coisas ao mesmo
 * tempo: custo por conversa (§19), diagnóstico de "por que a resposta saiu assim"
 * (§33) e comparação de qualidade entre versões do agente (§43).
 *
 * Custo em micro-dólares (inteiro) em vez de decimal: o preço por token é pequeno
 * demais para arredondamento, e somar centenas de milhares de linhas em ponto
 * flutuante acumula erro justamente onde a conta precisa fechar.
 */
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id'),
    /** Mensagem que disparou a execução. */
    triggerMessageId: uuid('trigger_message_id'),
    agentVersionId: uuid('agent_version_id'),

    /** `responder`, `classificar_intencao`, `resumir`, `avaliar`, `sugerir`. */
    purpose: varchar('purpose', { length: 40 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 64 }).notNull(),

    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    /** Custo em milionésimos de dólar. */
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull().default(0),
    latencyMs: integer('latency_ms'),

    /** 0..1, estimada pela própria orquestração — não pedida ao modelo. */
    confidence: real('confidence'),
    /** Se a resposta se apoiou em conhecimento recuperado ou em ferramenta. */
    grounded: boolean('grounded').notNull().default(false),
    /** Itens de conhecimento usados. Permite ir da resposta até a fonte. */
    retrievedItemIds: jsonb('retrieved_item_ids').notNull().default(sql`'[]'::jsonb`),

    /** `ok`, `sem_fundamento`, `handoff`, `erro`, `bloqueado`. */
    outcome: varchar('outcome', { length: 32 }).notNull().default('ok'),
    error: text('error'),
    /** Quantas tentativas até concluir. Acima de zero indica instabilidade do provedor. */
    attempts: integer('attempts').notNull().default(1),

    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('ai_runs_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('ai_runs_conversation_idx').on(t.conversationId, t.createdAt),
    index('ai_runs_agent_version_idx').on(t.agentVersionId, t.createdAt),
  ],
);

/**
 * Chamada de ferramenta feita pelo agente.
 *
 * Separada de `ai_runs` porque uma execução pode chamar várias, e porque a
 * pergunta "o que a IA fez nos meus sistemas?" precisa de resposta linha a linha.
 */
export const aiToolCalls = pgTable(
  'ai_tool_calls',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    runId: uuid('run_id').notNull(),
    toolName: varchar('tool_name', { length: 64 }).notNull(),
    arguments: jsonb('arguments').notNull().default(sql`'{}'::jsonb`),
    /** Resultado resumido. Payloads grandes não são guardados por inteiro. */
    result: jsonb('result'),
    success: boolean('success').notNull().default(true),
    error: text('error'),
    latencyMs: integer('latency_ms'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_tool_calls_run_idx').on(t.runId),
    index('ai_tool_calls_tenant_tool_idx').on(t.tenantId, t.toolName, t.createdAt),
  ],
);

/**
 * Medição de consumo para efeito comercial.
 *
 * Deliberadamente separada de `ai_runs`: consumo não é só IA. Mensagem enviada,
 * conversa iniciada, armazenamento e integração também são unidades cobráveis, e
 * o faturamento não pode depender do formato de uma tabela técnica.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    /** `ia_tokens`, `mensagem_enviada`, `mensagem_recebida`, `conversa`, `armazenamento`. */
    kind: varchar('kind', { length: 40 }).notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull().default(0),
    unit: varchar('unit', { length: 20 }).notNull(),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull().default(0),
    /** Recurso que originou o consumo, para conferência. */
    refType: varchar('ref_type', { length: 32 }),
    refId: uuid('ref_id'),
    /** Dia local do tenant (`YYYY-MM-DD`). Agregação por período usa isto, não UTC. */
    localDate: varchar('local_date', { length: 10 }).notNull(),
    occurredAt: stampedAt('occurred_at'),
  },
  (t) => [
    index('usage_events_tenant_date_idx').on(t.tenantId, t.localDate, t.kind),
    index('usage_events_occurred_idx').on(t.occurredAt),
  ],
);

export const aiToolCallsRelations = relations(aiToolCalls, ({ one }) => ({
  run: one(aiRuns, { fields: [aiToolCalls.runId], references: [aiRuns.id] }),
}));
