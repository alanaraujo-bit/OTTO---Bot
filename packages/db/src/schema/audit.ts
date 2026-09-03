import { sql } from 'drizzle-orm';
import { index, inet, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { createdAt, primaryId } from './_shared.ts';

/**
 * Trilha de auditoria.
 *
 * Registra o que mudou o estado do sistema de forma relevante: humano assumiu
 * atendimento, conhecimento publicado, permissão alterada, IA pausada, integração
 * desconectada, plano modificado.
 *
 * Não registra leitura, e não registra o que já está evidente em outra tabela —
 * uma mensagem enviada é a própria mensagem. Auditoria que registra tudo vira
 * ruído e ninguém lê.
 *
 * `tenantId` é nulo para ações de plataforma feitas por nós no backoffice; nesse
 * caso `targetTenantId` diz sobre qual empresa a ação recaiu.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id'),
    /** Empresa afetada quando a ação partiu do backoffice da plataforma. */
    targetTenantId: uuid('target_tenant_id'),

    /** `usuario`, `plataforma`, `sistema`, `automacao`. */
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorUserId: uuid('actor_user_id'),
    /** Nome no momento da ação — sobrevive à remoção do usuário. */
    actorLabel: varchar('actor_label', { length: 160 }),

    /** `conhecimento.publicado`, `conversa.assumida`, `canal.desconectado`… */
    action: varchar('action', { length: 60 }).notNull(),
    targetType: varchar('target_type', { length: 40 }),
    targetId: uuid('target_id'),
    /** Rótulo legível do alvo, para a trilha continuar compreensível depois. */
    targetLabel: varchar('target_label', { length: 200 }),

    /** Apenas os campos que mudaram, nunca o registro inteiro. */
    changes: jsonb('changes'),
    /** Contexto adicional: motivo, origem, identificador de requisição. */
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),

    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_tenant_idx').on(t.tenantId, t.createdAt),
    index('audit_log_target_idx').on(t.targetType, t.targetId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorUserId, t.createdAt),
  ],
);
