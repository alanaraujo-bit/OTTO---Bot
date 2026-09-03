import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  createdAt,
  deletedAt,
  membershipRoleEnum,
  platformRoleEnum,
  primaryId,
  updatedAt,
} from './_shared.ts';
import { tenants } from './tenancy.ts';

/**
 * Pessoa. Global, não por empresa.
 *
 * Um consultor pode atender três clientes nossos com o mesmo login, e um dia o
 * Sr. Fernando pode ter duas lojas separadas na plataforma. O vínculo com a
 * empresa vive em `memberships`.
 *
 * Esta tabela não tem `tenant_id` e, portanto, não tem RLS por tenant: o acesso
 * é sempre mediado por `memberships`.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: varchar('email', { length: 255 }).notNull(),
    /** Argon2id. Nulo quando a conta ainda não definiu senha ou usa SSO. */
    passwordHash: text('password_hash'),
    name: varchar('name', { length: 120 }).notNull(),
    /** Telefone do usuário da plataforma — não confundir com o do consumidor final. */
    phone: varchar('phone', { length: 20 }),
    avatarUrl: text('avatar_url'),
    /** Preenchido apenas para nós, donos do SaaS. Dá acesso ao backoffice. */
    platformRole: platformRoleEnum('platform_role'),
    isActive: boolean('is_active').notNull().default(true),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    // Ninguém digita e-mail com a mesma caixa duas vezes.
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    index('users_platform_role_idx').on(t.platformRole).where(sql`platform_role is not null`),
  ],
);

/**
 * Vínculo de uma pessoa com uma empresa, e o papel dela ali.
 *
 * O papel é um enum; as permissões que cada papel concede vivem em código
 * (`@otto/core/auth`), versionadas junto com as telas que elas protegem.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: membershipRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    /** Quem adicionou essa pessoa. Nulo para o primeiro usuário de uma empresa. */
    invitedBy: uuid('invited_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('memberships_tenant_user_key').on(t.tenantId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Sessão ativa.
 *
 * Guardamos apenas o hash do token — um vazamento do banco não vira acesso.
 * A sessão é opaca e revogável: suspender uma empresa ou desligar um atendente
 * precisa ter efeito imediato, o que um JWT no cliente não permitiria.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid('user_id').notNull(),
    /** SHA-256 do token que vai no cookie. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    /** Última empresa aberta. Conveniência de navegação — nunca fonte de autorização. */
    lastTenantId: uuid('last_tenant_id'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Convite para entrar em uma empresa.
 * O token também é guardado só como hash, e o convite morre por expiração.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    tenantId: uuid('tenant_id').notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role: membershipRoleEnum('role').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    invitedBy: uuid('invited_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    index('invitations_tenant_idx').on(t.tenantId),
    // Um convite aberto por e-mail e empresa; reenviar substitui, não acumula.
    uniqueIndex('invitations_pending_key')
      .on(t.tenantId, sql`lower(${t.email})`)
      .where(sql`accepted_at is null and revoked_at is null`),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  tenant: one(tenants, { fields: [memberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  tenant: one(tenants, { fields: [invitations.tenantId], references: [tenants.id] }),
}));
