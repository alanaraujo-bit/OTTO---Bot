import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { getDb, getPlatformDb, closeDb } from './client.ts';
import { withTenant, withUser } from './tenant.ts';
import { contacts, memberships, tenants, users } from './schema/index.ts';

/**
 * A outra metade da promessa de isolamento.
 *
 * `tenant.test.ts` prova que o papel da aplicação fica contido. Aqui provamos
 * o resto: que o backoffice realmente enxerga todas as empresas, que o contexto
 * de usuário permite listar as empresas da pessoa sem permitir que ela se
 * promova, e que nenhuma tabela nova entre no produto sem política de RLS.
 */

const sufixo = Date.now().toString(36);
const slugA = `iso-a-${sufixo}`;
const slugB = `iso-b-${sufixo}`;
const emailUsuario = `iso-${sufixo}@exemplo.test`;

let tenantA: string;
let tenantB: string;
let usuario: string;

beforeAll(async () => {
  const admin = getPlatformDb();

  const [a] = await admin
    .insert(tenants)
    .values({ slug: slugA, displayName: 'Isolamento A' })
    .returning({ id: tenants.id });
  const [b] = await admin
    .insert(tenants)
    .values({ slug: slugB, displayName: 'Isolamento B' })
    .returning({ id: tenants.id });
  tenantA = a!.id;
  tenantB = b!.id;

  const [u] = await admin
    .insert(users)
    .values({ email: emailUsuario, name: 'Pessoa de teste' })
    .returning({ id: users.id });
  usuario = u!.id;

  await admin.insert(memberships).values([
    { tenantId: tenantA, userId: usuario, role: 'proprietario' },
    { tenantId: tenantB, userId: usuario, role: 'atendente' },
  ]);

  await admin.insert(contacts).values([
    { tenantId: tenantA, displayName: 'Contato A' },
    { tenantId: tenantB, displayName: 'Contato B' },
  ]);
});

afterAll(async () => {
  const admin = getPlatformDb();
  await admin.delete(users).where(eq(users.email, emailUsuario));
  await admin.delete(tenants).where(eq(tenants.slug, slugA));
  await admin.delete(tenants).where(eq(tenants.slug, slugB));
  await closeDb();
});

describe('papel de backoffice', () => {
  it('enxerga empresas diferentes na mesma consulta', async () => {
    const encontrados = await getPlatformDb()
      .select({ id: contacts.id, nome: contacts.displayName })
      .from(contacts)
      .where(sql`${contacts.tenantId} in (${tenantA}, ${tenantB})`);

    expect(encontrados.map((c) => c.nome).sort()).toEqual(['Contato A', 'Contato B']);
  });

  it('é uma conexão distinta da aplicação, com papel distinto', async () => {
    const [app] = (await getDb().execute<{ papel: string }>(sql`select current_user as papel`)).rows;
    const [plataforma] = (
      await getPlatformDb().execute<{ papel: string }>(sql`select current_user as papel`)
    ).rows;

    expect(app!.papel).not.toBe(plataforma!.papel);
    // A separação só vale se o papel da aplicação de fato não ignore RLS.
    const [ignora] = (
      await getDb().execute<{ bypass: boolean }>(
        sql`select rolbypassrls as bypass from pg_roles where rolname = current_user`,
      )
    ).rows;
    expect(ignora!.bypass).toBe(false);
  });
});

describe('contexto de usuário', () => {
  it('lista as empresas às quais a pessoa pertence', async () => {
    const minhas = await withUser(usuario, (tx) =>
      tx.select({ slug: tenants.slug }).from(tenants).orderBy(tenants.slug),
    );
    expect(minhas.map((t) => t.slug)).toEqual([slugA, slugB]);
  });

  it('não revela empresas de terceiros', async () => {
    const [outra] = await getPlatformDb()
      .insert(tenants)
      .values({ slug: `iso-alheia-${sufixo}`, displayName: 'Alheia' })
      .returning({ id: tenants.id, slug: tenants.slug });

    const visiveis = await withUser(usuario, (tx) =>
      tx.select({ slug: tenants.slug }).from(tenants),
    );
    expect(visiveis.map((t) => t.slug)).not.toContain(outra!.slug);

    await getPlatformDb().delete(tenants).where(eq(tenants.id, outra!.id));
  });

  it('não permite que a pessoa promova a si mesma', async () => {
    // Só com contexto de usuário — sem empresa escolhida — a leitura é permitida,
    // mas a escrita não. Do contrário um atendente viraria proprietário sozinho.
    const alteradas = await withUser(usuario, (tx) =>
      tx
        .update(memberships)
        .set({ role: 'proprietario' })
        .where(eq(memberships.tenantId, tenantB))
        .returning({ id: memberships.id }),
    );
    expect(alteradas).toHaveLength(0);

    const [depois] = await withTenant(tenantB, (tx) =>
      tx.select({ papel: memberships.role }).from(memberships),
    );
    expect(depois!.papel).toBe('atendente');
  });
});

describe('cobertura das políticas', () => {
  /**
   * Tabelas que existem fora do isolamento por empresa, por decisão registrada
   * na migração 0002. Uma tabela nova que não esteja aqui e não tenha política
   * faz este teste falhar — que é exatamente o alarme desejado.
   */
  const semTenant = ['users', 'sessions', 'invitations', 'webhook_events', '__drizzle_migrations'];

  it('toda tabela com tenant_id tem RLS obrigatório e política', async () => {
    const { rows } = await getPlatformDb().execute<{
      tabela: string;
      rls: boolean;
      force: boolean;
      politicas: number;
    }>(sql`
      select c.relname as tabela,
             c.relrowsecurity as rls,
             c.relforcerowsecurity as force,
             (select count(*) from pg_policy p where p.polrelid = c.oid)::int as politicas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);

    const desprotegidas = rows
      .filter((t) => !semTenant.includes(t.tabela))
      .filter((t) => !t.rls || !t.force || t.politicas === 0)
      .map((t) => t.tabela);

    expect(desprotegidas).toEqual([]);
  });
});
