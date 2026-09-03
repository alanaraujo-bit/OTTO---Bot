import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index.ts';

export type Database = NodePgDatabase<typeof schema>;

/**
 * Conexões com o banco.
 *
 * Existem três papéis, e a diferença entre eles é uma barreira de segurança real,
 * não uma convenção:
 *
 *  • `otto_app`      — o papel de todo o produto. Sujeito a RLS. Uma consulta sem
 *                      contexto de tenant não retorna linha nenhuma.
 *  • `otto_platform` — apenas o backoffice do SaaS. Tem BYPASSRLS, porque precisa
 *                      enxergar todas as empresas. Vive em uma conexão separada
 *                      justamente para que um erro no código do console não possa
 *                      usá-lo por acidente.
 *  • `postgres`      — só migrações. Nunca atende requisição.
 */

// O Postgres devolve numeric/int8 como string para não perder precisão. Datas e
// contagens do produto cabem folgadamente em number, e converter aqui evita
// espalhar Number(...) por toda a camada de consulta.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

interface PoolOptions {
  connectionString: string;
  max?: number;
  applicationName: string;
}

function createPool({ connectionString, max = 10, applicationName }: PoolOptions): pg.Pool {
  const usaSsl = !/localhost|127\.0\.0\.1|railway\.internal/.test(connectionString);

  return new pg.Pool({
    connectionString,
    max,
    application_name: applicationName,
    // Uma conexão ociosa por muito tempo atrás de proxy costuma morrer em silêncio;
    // reciclar antes evita o erro no primeiro acesso depois de um período parado.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Encerra consulta travada em vez de segurar a conexão indefinidamente.
    statement_timeout: 30_000,
    query_timeout: 30_000,
    // O proxy do Railway usa certificado próprio; a conexão é cifrada, mas a cadeia
    // não é verificável a partir daqui. Em produção o tráfego é interno.
    ...(usaSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

let appPool: pg.Pool | undefined;
let appDb: Database | undefined;
let platformPool: pg.Pool | undefined;
let platformDb: Database | undefined;

/**
 * Banco da aplicação. Toda leitura e escrita de dados de empresa passa por aqui —
 * e, na prática, sempre dentro de `withTenant`.
 */
export function getDb(): Database {
  if (!appDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL não está definida.');
    appPool = createPool({ connectionString: url, applicationName: 'otto-app', max: 12 });
    appDb = drizzle(appPool, { schema, casing: 'snake_case' });
  }
  return appDb;
}

/**
 * Banco do backoffice. Enxerga todas as empresas.
 * Só pode ser usado por código sob `@otto/core/platform`, atrás de verificação de
 * papel de plataforma e com registro em auditoria.
 */
export function getPlatformDb(): Database {
  if (!platformDb) {
    const url = process.env.DATABASE_PLATFORM_URL;
    if (!url) throw new Error('DATABASE_PLATFORM_URL não está definida.');
    platformPool = createPool({ connectionString: url, applicationName: 'otto-platform', max: 4 });
    platformDb = drizzle(platformPool, { schema, casing: 'snake_case' });
  }
  return platformDb;
}

/** Fecha as conexões. Chamado no desligamento gracioso do processo. */
export async function closeDb(): Promise<void> {
  await Promise.all([appPool?.end(), platformPool?.end()]);
  appPool = platformPool = undefined;
  appDb = platformDb = undefined;
}

export { schema };
