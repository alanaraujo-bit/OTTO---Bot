import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { channelKindEnum, createdAt, primaryId, stampedAt, updatedAt } from './_shared.ts';
import { tenants } from './tenancy.ts';
import { users } from './identity.ts';

/**
 * O consumidor final. Uma pessoa, mesmo que ela fale pelo WhatsApp hoje e pelo
 * Direct amanhã — é isso que `contact_identities` resolve.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    /**
     * Nome exibido. Vem do perfil do canal e pode ser corrigido por um operador;
     * `nameSource` diz qual dos dois vale, para não sobrescrever correção humana
     * na próxima mensagem.
     */
    displayName: varchar('display_name', { length: 160 }),
    nameSource: varchar('name_source', { length: 16 }).notNull().default('canal'),
    /** E.164, apenas dígitos com código do país. */
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    notes: text('notes'),
    /** Bloqueia respostas automáticas para esse contato. */
    isBlocked: boolean('is_blocked').notNull().default(false),
    firstSeenAt: stampedAt('first_seen_at'),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
    conversationCount: integer('conversation_count').notNull().default(0),
    /** Campos livres definidos pela empresa. Sem esquema fixo por escolha. */
    attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('contacts_tenant_idx').on(t.tenantId, t.lastInteractionAt),
    index('contacts_phone_idx').on(t.tenantId, t.phone).where(sql`phone is not null`),
  ],
);

/**
 * Como um contato é conhecido em cada canal.
 *
 * A unicidade por `(tenant, kind, external_id)` é o que impede que a mesma pessoa
 * vire dois cadastros ao mandar duas mensagens ao mesmo tempo.
 */
export const contactIdentities = pgTable(
  'contact_identities',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    kind: channelKindEnum('kind').notNull(),
    /** Identificador da pessoa no provedor: `wa_id`, id do usuário do Instagram. */
    externalId: varchar('external_id', { length: 128 }).notNull(),
    /** Como o provedor exibe: número formatado, @usuário. */
    handle: varchar('handle', { length: 128 }),
    profileName: varchar('profile_name', { length: 160 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('contact_identities_key').on(t.tenantId, t.kind, t.externalId),
    index('contact_identities_contact_idx').on(t.contactId),
  ],
);

/**
 * Etiquetas da empresa. Servem para conversas e contatos — a mesma etiqueta
 * "reclamação" precisa significar a mesma coisa nos dois lugares.
 */
export const tags = pgTable(
  'tags',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: 40 }).notNull(),
    /** Token de cor do design system, não um hexadecimal solto. */
    color: varchar('color', { length: 24 }).notNull().default('neutro'),
    description: varchar('description', { length: 160 }),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tags_tenant_name_key').on(t.tenantId, sql`lower(${t.name})`)],
);

export const contactTags = pgTable(
  'contact_tags',
  {
    tenantId: uuid('tenant_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    tagId: uuid('tag_id').notNull(),
    appliedBy: uuid('applied_by'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index('contact_tags_tag_idx').on(t.tagId),
  ],
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  tenant: one(tenants, { fields: [contacts.tenantId], references: [tenants.id] }),
  identities: many(contactIdentities),
  tags: many(contactTags),
}));

export const contactIdentitiesRelations = relations(contactIdentities, ({ one }) => ({
  contact: one(contacts, { fields: [contactIdentities.contactId], references: [contacts.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  tenant: one(tenants, { fields: [tags.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [tags.createdBy], references: [users.id] }),
  contacts: many(contactTags),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, { fields: [contactTags.contactId], references: [contacts.id] }),
  tag: one(tags, { fields: [contactTags.tagId], references: [tags.id] }),
}));
