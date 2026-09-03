import { sql } from 'drizzle-orm';

import { getDb, type Database } from './client.ts';

/**
 * Contexto de tenant.
 *
 * Esta é a única porta de entrada para dados de uma empresa. O helper abre uma
 * transação, define `app.tenant_id` nela, e só então executa o trabalho. As
 * políticas de RLS no banco comparam toda linha com esse valor.
 *
 * O ganho não é conveniência — é o tipo de falha. Sem contexto, `current_setting`
 * devolve nulo, a comparação vira nulo, e a consulta retorna zero linhas. Esquecer
 * o isolamento passa a produzir "não encontrei" em vez de vazar o banco inteiro
 * para outra empresa.
 *
 * `set_config(..., true)` é local à transação: ao final, com commit ou rollback,
 * o valor desaparece e a conexão volta limpa para o pool.
 */

export type TenantTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(
  tenantId: string,
  work: (tx: TenantTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  // O valor entra na sessão do Postgres; validar o formato antes fecha qualquer
  // dúvida sobre o que pode chegar até lá.
  if (!UUID.test(tenantId)) {
    throw new Error(`Identificador de empresa inválido: ${tenantId}`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx);
  });
}

/**
 * Contexto de usuário, sem empresa escolhida.
 *
 * Serve ao momento entre autenticar e escolher a empresa: o seletor precisa listar
 * as empresas às quais a pessoa pertence. As políticas de `tenants` e `memberships`
 * aceitam esse contexto **apenas para leitura** — alterar o próprio vínculo continua
 * exigindo contexto de empresa, senão alguém poderia se promover.
 */
export async function withUser<T>(
  userId: string,
  work: (tx: TenantTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  if (!UUID.test(userId)) {
    throw new Error(`Identificador de usuário inválido: ${userId}`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

/**
 * Trabalho sem empresa associada: autenticação, convites, tabelas de plataforma.
 * Existe como função nomeada para que o uso apareça na revisão de código, em vez
 * de alguém simplesmente pegar `getDb()` e consultar direto.
 */
export async function withoutTenant<T>(
  work: (tx: TenantTransaction) => Promise<T>,
  db: Database = getDb(),
): Promise<T> {
  return db.transaction(async (tx) => work(tx));
}
