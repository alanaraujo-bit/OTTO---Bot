import pg from 'pg';

/**
 * Prepara um banco novo para receber as migrações.
 *
 * Cria os dois papéis da aplicação com a senha que já está nas URLs de conexão —
 * assim não existe um segundo lugar guardando a mesma senha, que é como as duas
 * acabam divergindo.
 *
 * É idempotente: rodar de novo apenas realinha a senha e os privilégios.
 * Roda uma vez por ambiente, antes da primeira migração.
 *
 *   node --env-file=.env packages/db/src/bootstrap.ts
 */

interface RoleSpec {
  name: string;
  password: string;
  /** Ignora as políticas de RLS. Verdadeiro apenas para o papel do backoffice. */
  bypassRls: boolean;
}

function extrair(url: string | undefined, variavel: string): { user: string; password: string } {
  if (!url) throw new Error(`${variavel} não está definida.`);
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!user || !password) {
    throw new Error(`${variavel} precisa conter usuário e senha.`);
  }
  return { user, password };
}

/** Identificadores e literais entram por interpolação — `CREATE ROLE` não aceita parâmetro. */
const ident = (v: string) => `"${v.replace(/"/g, '""')}"`;
const literal = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function bootstrap(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL não está definida.');

  const app = extrair(process.env.DATABASE_URL, 'DATABASE_URL');
  const platform = extrair(process.env.DATABASE_PLATFORM_URL, 'DATABASE_PLATFORM_URL');

  const roles: RoleSpec[] = [
    { name: app.user, password: app.password, bypassRls: false },
    { name: platform.user, password: platform.password, bypassRls: true },
  ];

  const client = new pg.Client({
    connectionString: adminUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const { rows } = await client.query<{ current_database: string }>('select current_database()');
    const database = rows[0]!.current_database;

    for (const role of roles) {
      const atributos = `login password ${literal(role.password)} ${
        role.bypassRls ? 'bypassrls' : 'nobypassrls'
      } nosuperuser nocreatedb nocreaterole`;

      await client.query(`
        do $bootstrap$
        begin
          if exists (select 1 from pg_roles where rolname = ${literal(role.name)}) then
            alter role ${ident(role.name)} with ${atributos};
          else
            create role ${ident(role.name)} with ${atributos};
          end if;
        end
        $bootstrap$;
      `);

      await client.query(`grant connect on database ${ident(database)} to ${ident(role.name)}`);
      await client.query(`grant usage on schema public to ${ident(role.name)}`);

      console.log(
        `papel ${role.name} pronto${role.bypassRls ? ' (ignora RLS — backoffice)' : ' (sujeito a RLS)'}`,
      );
    }

    // Objetos criados a partir daqui pelas migrações já nascem acessíveis aos dois
    // papéis, sem precisar de um GRANT manual a cada tabela nova.
    for (const role of roles) {
      await client.query(`
        alter default privileges in schema public
          grant select, insert, update, delete on tables to ${ident(role.name)};
      `);
      await client.query(`
        alter default privileges in schema public
          grant usage, select on sequences to ${ident(role.name)};
      `);
    }

    // E o que já existe, para o caso de rodar depois de uma migração.
    for (const role of roles) {
      await client.query(
        `grant select, insert, update, delete on all tables in schema public to ${ident(role.name)}`,
      );
      await client.query(
        `grant usage, select on all sequences in schema public to ${ident(role.name)}`,
      );
    }

    console.log('privilégios aplicados.');
  } finally {
    await client.end();
  }
}

bootstrap().catch((erro: unknown) => {
  console.error('bootstrap falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
