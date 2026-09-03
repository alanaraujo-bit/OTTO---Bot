import { relations, sql } from 'drizzle-orm';
import {
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

import {
  channelKindEnum,
  channelStatusEnum,
  createdAt,
  primaryId,
  stampedAt,
  updatedAt,
  webhookStatusEnum,
} from './_shared.ts';
import { tenants } from './tenancy.ts';

/**
 * Um canal conectado — um número de WhatsApp, uma conta do Instagram.
 *
 * O `simulador` é um tipo de canal de primeira classe, com o mesmo contrato dos
 * canais reais. Ele existe para que a cadeia inteira possa ser exercitada antes
 * de haver aprovação da Meta, e continue sendo exercitável depois, em teste
 * automatizado. Não é mock: passa pelo mesmo webhook, mesma fila, mesmo agente.
 */
export const channels = pgTable(
  'channels',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    kind: channelKindEnum('kind').notNull(),
    /** Nome interno, escolhido pela empresa: "WhatsApp da loja", "Direct". */
    name: varchar('name', { length: 120 }).notNull(),
    status: channelStatusEnum('status').notNull().default('nao_conectado'),

    /** Identificador do canal no provedor: `phone_number_id`, id da conta do Instagram. */
    externalId: varchar('external_id', { length: 128 }),
    /** Como o canal aparece para o consumidor: `+55 94 …`, `@loja`. */
    externalHandle: varchar('external_handle', { length: 128 }),
    /** Conta de negócio da Meta que possui o canal. */
    externalAccountId: varchar('external_account_id', { length: 128 }),

    /**
     * Token de acesso do canal, cifrado com `ENCRYPTION_KEY` (AES-256-GCM).
     * Nunca sai daqui em texto claro, nem para o log, nem para o navegador.
     */
    credentials: text('credentials'),

    /** Preferências específicas do canal. Ver `@otto/core/channels` para o formato. */
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),

    connectedAt: timestamp('connected_at', { withTimezone: true }),
    /** Última vez que recebemos qualquer evento. Base do alerta de canal silencioso. */
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastError: text('last_error'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('channels_tenant_idx').on(t.tenantId),
    // Um mesmo número não pode estar conectado em duas empresas.
    uniqueIndex('channels_external_key')
      .on(t.kind, t.externalId)
      .where(sql`external_id is not null`),
  ],
);

/**
 * Recebimento bruto de webhook — a porta de entrada, e a base da idempotência.
 *
 * A Meta reenvia, duplica e entrega fora de ordem. Gravar o payload cru com
 * chave única por `(provider, external_id)` faz a segunda entrega do mesmo evento
 * ser um no-op barato, em vez de uma resposta duplicada para o cliente.
 *
 * Não é uma tabela por tenant: quando o evento chega, ainda não sabemos de quem
 * ele é. O `tenant_id` é preenchido durante o processamento, e o acesso a esta
 * tabela é sempre pelo caminho de plataforma, nunca pelo console.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: primaryId(),
    provider: varchar('provider', { length: 32 }).notNull(),
    /** Id do evento no provedor. É o que torna a entrega repetida detectável. */
    externalId: varchar('external_id', { length: 200 }).notNull(),
    tenantId: uuid('tenant_id'),
    channelId: uuid('channel_id'),
    payload: jsonb('payload').notNull(),
    status: webhookStatusEnum('status').notNull().default('recebido'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** Motivo de descarte, quando o evento é válido mas não nos interessa. */
    discardReason: varchar('discard_reason', { length: 120 }),
    receivedAt: stampedAt('received_at'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webhook_events_dedupe_key').on(t.provider, t.externalId),
    index('webhook_events_status_idx').on(t.status, t.receivedAt),
    index('webhook_events_tenant_idx').on(t.tenantId, t.receivedAt),
  ],
);

export const channelsRelations = relations(channels, ({ one }) => ({
  tenant: one(tenants, { fields: [channels.tenantId], references: [tenants.id] }),
}));
