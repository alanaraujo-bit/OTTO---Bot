import { defineConfig } from 'drizzle-kit';

/**
 * As migrações rodam com o papel administrativo — criar tabela, política de RLS e
 * índice não é coisa que o papel da aplicação deva conseguir fazer.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL ?? '',
    ssl: { rejectUnauthorized: false },
  },
  verbose: true,
  strict: true,
});
