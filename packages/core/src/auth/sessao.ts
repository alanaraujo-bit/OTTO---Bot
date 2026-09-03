import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  and,
  eq,
  gt,
  isNull,
  sql,
  memberships,
  sessions,
  tenants,
  users,
  withoutTenant,
  type TenantTransaction,
} from '@otto/db';
import { dias, naoAutenticado } from '@otto/shared';

import type { PapelEmpresa, PapelPlataforma, Permissao } from './permissoes.ts';
import { permissoesDoPapel } from './permissoes.ts';

/**
 * Sessões.
 *
 * O token vai inteiro no cookie e apenas o SHA-256 dele fica no banco. Um
 * vazamento do banco não vira acesso — é a mesma razão de não guardar senha em
 * texto claro, aplicada à sessão.
 *
 * A sessão é opaca e revogável, e não um JWT: suspender uma empresa ou desligar
 * um atendente precisa ter efeito imediato, não na expiração do token.
 */

const DURACAO = dias(30);
/** Só grava `last_seen_at` a cada 5 min — senão toda requisição vira escrita. */
const INTERVALO_TOQUE = 5 * 60_000;

export interface Sessao {
  id: string;
  usuario: {
    id: string;
    nome: string;
    email: string;
    avatarUrl: string | null;
    papelPlataforma: PapelPlataforma | null;
  };
  /** Empresas às quais a pessoa pertence, para o seletor. */
  empresas: {
    id: string;
    slug: string;
    nome: string;
    papel: PapelEmpresa;
    status: string;
  }[];
  /** Última empresa aberta. Conveniência de navegação, nunca autorização. */
  ultimaEmpresaId: string | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function gerarToken(): string {
  // 32 bytes de entropia. base64url cabe em cookie sem escapar nada.
  return randomBytes(32).toString('base64url');
}

export async function criarSessao(
  userId: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiraEm: Date }> {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO);

  await withoutTenant((tx) =>
    tx.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: expiraEm,
      ipAddress: contexto.ip ?? null,
      userAgent: contexto.userAgent?.slice(0, 500) ?? null,
    }),
  );

  return { token, expiraEm };
}

/**
 * Resolve o token em uma sessão utilizável, ou `null`.
 *
 * Uma única consulta traz usuário, vínculos e empresas: esta função roda em toda
 * requisição autenticada, e três idas ao banco por navegação apareceriam.
 */
export async function lerSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;

  return withoutTenant(async (tx) => {
    const [linha] = await tx
      .select({
        sessaoId: sessions.id,
        lastSeenAt: sessions.lastSeenAt,
        ultimaEmpresaId: sessions.lastTenantId,
        usuarioId: users.id,
        nome: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        papelPlataforma: users.platformRole,
        ativo: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, new Date()),
          isNull(sessions.revokedAt),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    // Conta desativada mantém a sessão no banco, mas ela deixa de valer.
    if (!linha || !linha.ativo) return null;

    // `memberships` e `tenants` têm RLS. Sem contexto de empresa — que é
    // justamente o caso aqui, já que a pessoa ainda vai escolher uma — a política
    // só libera as linhas do próprio usuário, e para isso precisa saber quem ele
    // é. Sem esta linha a consulta abaixo devolve zero vínculos e a pessoa cai em
    // "sua conta não está em nenhuma empresa".
    await tx.execute(sql`select set_config('app.user_id', ${linha.usuarioId}, true)`);

    const vinculos = await tx
      .select({
        id: tenants.id,
        slug: tenants.slug,
        nome: tenants.displayName,
        status: tenants.status,
        papel: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(
        and(
          eq(memberships.userId, linha.usuarioId),
          eq(memberships.isActive, true),
          isNull(tenants.deletedAt),
        ),
      )
      .orderBy(tenants.displayName);

    if (Date.now() - linha.lastSeenAt.getTime() > INTERVALO_TOQUE) {
      await tx
        .update(sessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(sessions.id, linha.sessaoId));
    }

    return {
      id: linha.sessaoId,
      usuario: {
        id: linha.usuarioId,
        nome: linha.nome,
        email: linha.email,
        avatarUrl: linha.avatarUrl,
        papelPlataforma: linha.papelPlataforma,
      },
      empresas: vinculos,
      ultimaEmpresaId: linha.ultimaEmpresaId,
    };
  });
}

export async function revogarSessao(token: string): Promise<void> {
  await withoutTenant((tx) =>
    tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token))),
  );
}

/** Encerra todas as sessões de uma pessoa. Usado ao trocar senha. */
export async function revogarTodasSessoes(userId: string): Promise<void> {
  await withoutTenant((tx) =>
    tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))),
  );
}

export async function lembrarEmpresa(sessaoId: string, tenantId: string): Promise<void> {
  await withoutTenant((tx) =>
    tx.update(sessions).set({ lastTenantId: tenantId }).where(eq(sessions.id, sessaoId)),
  );
}

// ─── Autorização ──────────────────────────────────────────────────────────────

export interface Acesso {
  sessao: Sessao;
  empresa: Sessao['empresas'][number];
  permissoes: ReadonlySet<Permissao>;
}

/**
 * Resolve o acesso de uma pessoa a uma empresa.
 *
 * Devolve `null` quando ela não pertence à empresa — e a resposta é
 * indistinguível de "empresa não existe". Dizer "existe, mas você não pode"
 * confirma a existência de um cliente nosso para quem não deveria saber.
 */
export function acessoA(sessao: Sessao, empresaId: string): Acesso | null {
  const empresa = sessao.empresas.find((e) => e.id === empresaId);
  if (!empresa) return null;
  return { sessao, empresa, permissoes: permissoesDoPapel(empresa.papel) };
}

export function pode(acesso: Acesso, permissao: Permissao): boolean {
  // Empresa suspensa vira somente leitura: o histórico continua acessível, mas
  // nada novo é escrito enquanto a pendência não se resolve.
  if (acesso.empresa.status === 'suspenso' && !permissao.endsWith('.ver')) return false;
  return acesso.permissoes.has(permissao);
}

/** Compara segredos sem vazar tempo. Para tokens de convite e verificação. */
export function comparaSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export { hashToken };
export const NOME_COOKIE = 'otto_sessao';
export const DURACAO_SESSAO = DURACAO;
