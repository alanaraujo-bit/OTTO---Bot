import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { createdAt, primaryId, updatedAt } from './_shared.ts';
import { users } from './identity.ts';

/**
 * O atendente virtual da empresa.
 *
 * O administrador nunca escreve prompt. Ele configura comportamento — tom,
 * objetividade, saudação, assuntos que exigem humano, limiar de confiança — e a
 * plataforma compila isso em instrução. O formato de `settings` é validado por
 * schema em `@otto/core/ai`; ele fica em jsonb porque cresce a cada controle novo,
 * e uma coluna por controle viraria uma migração por ajuste de produto.
 */
export const agents = pgTable(
  'agents',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    /** Nome do atendente virtual visto pelo consumidor. */
    displayName: varchar('display_name', { length: 60 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** Versão em uso agora. Trocar isso é o que "publica" um comportamento. */
    activeVersionId: uuid('active_version_id'),
    /** Rascunho de trabalho, ainda não publicado. */
    draftSettings: jsonb('draft_settings'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('agents_tenant_key').on(t.tenantId)],
);

/**
 * Versão imutável do comportamento.
 *
 * Existe para responder "a qualidade caiu depois da mudança X?": toda execução
 * do agente registra qual versão a produziu, então dá para comparar antes e depois.
 */
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    version: integer('version').notNull(),
    /** Configuração completa no momento da publicação. */
    settings: jsonb('settings').notNull(),
    /** Instrução compilada a partir de `settings`. Guardada para auditoria. */
    compiledInstruction: text('compiled_instruction').notNull(),
    changeNote: varchar('change_note', { length: 300 }),
    publishedBy: uuid('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('agent_versions_key').on(t.agentId, t.version),
    index('agent_versions_tenant_idx').on(t.tenantId, t.publishedAt),
  ],
);

export const agentsRelations = relations(agents, ({ many, one }) => ({
  versions: many(agentVersions),
  activeVersion: one(agentVersions, {
    fields: [agents.activeVersionId],
    references: [agentVersions.id],
  }),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, { fields: [agentVersions.agentId], references: [agents.id] }),
  publisher: one(users, { fields: [agentVersions.publishedBy], references: [users.id] }),
}));
