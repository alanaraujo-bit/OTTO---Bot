import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  createdAt,
  deletedAt,
  primaryId,
  tenantStatusEnum,
  updatedAt,
} from './_shared.ts';

/**
 * A empresa cliente. Raiz de tudo que é isolado por RLS.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: primaryId(),
    /** Identificador na URL. Estável — mudar quebra links salvos. */
    slug: varchar('slug', { length: 63 }).notNull(),
    /** Como a empresa se chama para os clientes dela. */
    displayName: varchar('display_name', { length: 120 }).notNull(),
    /** Razão social. Opcional: nem toda empresa informa na implantação. */
    legalName: varchar('legal_name', { length: 200 }),
    /** CNPJ ou CPF, apenas dígitos. Opcional pelo mesmo motivo. */
    taxId: varchar('tax_id', { length: 14 }),
    status: tenantStatusEnum('status').notNull().default('em_implantacao'),
    /** Preenchido quando o status vira `suspenso`. Aparece para o operador do SaaS. */
    statusReason: text('status_reason'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('America/Sao_Paulo'),
    locale: varchar('locale', { length: 10 }).notNull().default('pt-BR'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('tenants_slug_key').on(t.slug), index('tenants_status_idx').on(t.status)],
);

/**
 * Unidade física da empresa — loja, filial, depósito.
 *
 * Endereço e horário vivem aqui, e não na Base de Conhecimento em prosa, porque
 * "que horas vocês abrem?" e "manda a localização" precisam de resposta exata.
 * O agente consulta isso por ferramenta, com dado estruturado. A Base de
 * Conhecimento cobre o que não cabe em coluna.
 */
export const tenantLocations = pgTable(
  'tenant_locations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** A unidade assumida quando o cliente não especifica qual. */
    isPrimary: boolean('is_primary').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),

    street: varchar('street', { length: 200 }),
    number: varchar('number', { length: 20 }),
    complement: varchar('complement', { length: 100 }),
    district: varchar('district', { length: 100 }),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 2 }),
    postalCode: varchar('postal_code', { length: 8 }),

    /** Para enviar o ponto no mapa pelo WhatsApp. */
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),

    phone: varchar('phone', { length: 20 }),
    /** Observação operacional interna. Não é usada como resposta ao cliente. */
    notes: text('notes'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tenant_locations_tenant_idx').on(t.tenantId),
    // Só pode haver uma unidade principal por empresa.
    uniqueIndex('tenant_locations_primary_key').on(t.tenantId).where(sql`is_primary`),
  ],
);

/**
 * Horário de funcionamento regular.
 *
 * Uma linha por faixa, não uma por dia: supermercado com horário partido, ou que
 * fecha mais cedo no domingo, é o caso comum, não a exceção. Minutos desde a
 * meia-noite evitam a ambiguidade de guardar "hora" sem data.
 */
export const locationHours = pgTable(
  'location_hours',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    locationId: uuid('location_id').notNull(),
    /** 0 = domingo … 6 = sábado. */
    weekday: smallint('weekday').notNull(),
    /** Minutos desde a meia-noite, no fuso do tenant. */
    opensAt: integer('opens_at').notNull(),
    closesAt: integer('closes_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('location_hours_location_idx').on(t.locationId, t.weekday)],
);

/**
 * Exceção de calendário: feriado, data especial, fechamento pontual.
 * Sobrepõe o horário regular naquele dia.
 */
export const locationExceptions = pgTable(
  'location_exceptions',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    locationId: uuid('location_id').notNull(),
    date: date('date').notNull(),
    /** Quando verdadeiro, a unidade não abre — `opensAt`/`closesAt` são ignorados. */
    closed: boolean('closed').notNull().default(false),
    opensAt: integer('opens_at'),
    closesAt: integer('closes_at'),
    /** "Feriado municipal", "Natal". Pode ser dito ao cliente. */
    reason: varchar('reason', { length: 120 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('location_exceptions_key').on(t.locationId, t.date)],
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  locations: many(tenantLocations),
}));

export const tenantLocationsRelations = relations(tenantLocations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tenantLocations.tenantId], references: [tenants.id] }),
  hours: many(locationHours),
  exceptions: many(locationExceptions),
}));

export const locationHoursRelations = relations(locationHours, ({ one }) => ({
  location: one(tenantLocations, {
    fields: [locationHours.locationId],
    references: [tenantLocations.id],
  }),
}));

export const locationExceptionsRelations = relations(locationExceptions, ({ one }) => ({
  location: one(tenantLocations, {
    fields: [locationExceptions.locationId],
    references: [tenantLocations.id],
  }),
}));
