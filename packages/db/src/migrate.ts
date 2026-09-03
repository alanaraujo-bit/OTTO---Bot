import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * Aplica as migrações pendentes com o papel administrativo.
 *
 * Roda no arranque do deploy, antes do serviço começar a atender. Se falhar, o
 * deploy falha — subir uma versão nova contra um banco antigo é pior do que não
 * subir.
 *
 *   node --env-file=.env packages/db/src/migrate.ts
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaMigracoes = resolve(aqui, '..', 'drizzle');

async function main(): Promise<void> {
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_ADMIN_URL (ou DATABASE_URL) precisa estar definida.');
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const db = drizzle(client);
    const inicio = Date.now();
    await migrate(db, { migrationsFolder: pastaMigracoes });
    console.log(`migrações aplicadas em ${Date.now() - inicio} ms`);
  } finally {
    await client.end();
  }
}

main().catch((erro: unknown) => {
  console.error('migração falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
