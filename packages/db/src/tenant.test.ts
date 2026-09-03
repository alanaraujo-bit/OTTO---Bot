import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { getDb, getPlatformDb, closeDb } from './client.ts';
import { withTenant, withoutTenant } from './tenant.ts';
import { contacts, conversations, tenants } from './schema/index.ts';

/**
 * Isolamento entre empresas.
 *
 * Este é o teste que não pode falhar em silêncio. Ele não verifica que o código
 * lembra de filtrar — verifica que o banco não deixa passar mesmo quando o código
 * esquece. Por isso todas as consultas aqui são deliberadamente escritas SEM
 * cláusula de tenant.
 */

/**
 * O Drizzle embrulha o erro do Postgres em "Failed query: …" e guarda o original
 * em `cause`. A mensagem que interessa está lá dentro.
 */
async function motivoDaFalha(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
    return '';
  } catch (erro) {
    const partes: string[] = [];
    let atual: unknown = erro;
    while (atual instanceof Error) {
      partes.push(atual.message);
      atual = atual.cause;
    }
    return partes.join(' | ');
  }
}

const sufixo = Date.now().toString(36);
const slugA = `teste-rls-a-${sufixo}`;
const slugB = `teste-rls-b-${sufixo}`;

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const admin = getPlatformDb();

  const [a] = await admin
    .insert(tenants)
    .values({ slug: slugA, displayName: 'Empresa A (teste)' })
    .returning({ id: tenants.id });
  const [b] = await admin
    .insert(tenants)
    .values({ slug: slugB, displayName: 'Empresa B (teste)' })
    .returning({ id: tenants.id });

  tenantA = a!.id;
  tenantB = b!.id;

  await admin.insert(contacts).values([
    { tenantId: tenantA, displayName: 'Cliente da A', phone: '5594000000001' },
    { tenantId: tenantB, displayName: 'Cliente da B', phone: '5594000000002' },
  ]);
});

afterAll(async () => {
  const admin = getPlatformDb();
  await admin.delete(tenants).where(eq(tenants.slug, slugA));
  await admin.delete(tenants).where(eq(tenants.slug, slugB));
  await closeDb();
});

describe('isolamento por RLS', () => {
  it('mostra apenas os contatos da empresa em contexto', async () => {
    const daA = await withTenant(tenantA, (tx) => tx.select().from(contacts));
    const daB = await withTenant(tenantB, (tx) => tx.select().from(contacts));

    expect(daA).toHaveLength(1);
    expect(daA[0]!.displayName).toBe('Cliente da A');
    expect(daB).toHaveLength(1);
    expect(daB[0]!.displayName).toBe('Cliente da B');
  });

  it('não retorna nada quando não há contexto de empresa', async () => {
    // O caso que importa: uma consulta escrita sem filtro, por esquecimento.
    // Sem RLS ela devolveria o banco inteiro.
    const semContexto = await withoutTenant((tx) => tx.select().from(contacts));
    expect(semContexto).toHaveLength(0);
  });

  it('impede gravar registro de outra empresa a partir do contexto atual', async () => {
    const motivo = await motivoDaFalha(
      withTenant(tenantA, (tx) =>
        tx.insert(contacts).values({ tenantId: tenantB, displayName: 'Intruso' }),
      ),
    );
    expect(motivo).toMatch(/row-level security/i);
  });

  it('impede alterar registro de outra empresa', async () => {
    const alteradas = await withTenant(tenantA, (tx) =>
      tx
        .update(contacts)
        .set({ displayName: 'Sequestrado' })
        .where(eq(contacts.tenantId, tenantB))
        .returning({ id: contacts.id }),
    );

    // A política não lança: simplesmente não há linha visível para atualizar.
    expect(alteradas).toHaveLength(0);

    const [intacto] = await withTenant(tenantB, (tx) => tx.select().from(contacts));
    expect(intacto!.displayName).toBe('Cliente da B');
  });

  it('impede apagar registro de outra empresa', async () => {
    const apagadas = await withTenant(tenantA, (tx) =>
      tx.delete(contacts).where(eq(contacts.tenantId, tenantB)).returning({ id: contacts.id }),
    );
    expect(apagadas).toHaveLength(0);
  });

  it('mantém o isolamento em junções, não só na tabela de origem', async () => {
    // Uma junção mal escrita é o caminho mais comum de vazamento. As políticas
    // valem para cada tabela envolvida, então a junção também fica contida.
    const linhas = await withTenant(tenantA, (tx) =>
      tx
        .select({ contato: contacts.displayName })
        .from(contacts)
        .leftJoin(conversations, eq(conversations.contactId, contacts.id)),
    );
    expect(linhas.every((l) => l.contato === 'Cliente da A')).toBe(true);
  });

  it('limpa o contexto ao devolver a conexão ao pool', async () => {
    await withTenant(tenantA, async (tx) => {
      const dentro = await tx.execute<{ valor: string | null }>(
        sql`select app_tenant_id()::text as valor`,
      );
      expect(dentro.rows[0]!.valor).toBe(tenantA);
    });

    // `set_config(..., true)` é local à transação. Se vazasse, a próxima consulta
    // nessa conexão veria dados da empresa anterior.
    const depois = await getDb().execute<{ valor: string | null }>(
      sql`select app_tenant_id()::text as valor`,
    );
    expect(depois.rows[0]!.valor).toBeNull();
  });

  it('recusa identificador de empresa que não seja UUID', async () => {
    await expect(
      withTenant("' or true --", (tx) => tx.select().from(contacts)),
    ).rejects.toThrow(/inválido/i);
  });
});
