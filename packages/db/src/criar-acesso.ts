import { randomBytes } from 'node:crypto';

import { gerarHashSenha, esquemaSenha, senhaObvia } from '@otto/core/auth';
import type { PapelEmpresa } from '@otto/core/auth';
import { eq, getPlatformDb, memberships, sql, tenants, users } from './index.ts';

/**
 * Cria (ou promove) um acesso de proprietário a uma empresa.
 *
 * Existe porque `seed.ts` popula o ambiente fictício inteiro — empresa, três
 * pessoas, canal e conhecimento de demonstração. Para dar acesso a uma pessoa
 * real numa empresa que já existe, semear tudo de novo seria um exagero com
 * efeitos colaterais.
 *
 * A senha passa pela mesma validação do produto (`esquemaSenha`): 10 caracteres
 * no mínimo, e nada de senha de lista de ataque. Sem `--senha`, gera uma frase
 * forte e a imprime uma única vez — é a opção preferida, porque uma senha que
 * nunca foi digitada em um chat ou num histórico de shell não vaza por ali.
 *
 *   node --env-file=.env packages/db/src/criar-acesso.ts \
 *     --email pessoa@empresa.com --nome "Nome da Pessoa" --empresa mercado-modelo
 *
 * Idempotente: rodar de novo atualiza a senha e garante o papel.
 */

/** Palavras curtas e sem ambiguidade visual, para uma frase legível ao telefone. */
const PALAVRAS = [
  'ancora',
  'bulevar',
  'cacau',
  'dunas',
  'espuma',
  'farol',
  'gaivota',
  'horta',
  'ilha',
  'jangada',
  'lagoa',
  'manga',
  'nuvem',
  'oficina',
  'palmeira',
  'quintal',
  'rede',
  'sereno',
  'telhado',
  'urubu',
  'vento',
  'xarope',
  'zebra',
  'abelha',
  'barco',
  'cedro',
  'duna',
  'estrada',
  'feira',
  'goiaba',
];

function gerarFrase(): string {
  const n = PALAVRAS.length;
  // `randomInt` via rejeição simples: o viés de `% n` é irrelevante aqui, mas
  // não custa nada evitá-lo.
  const escolher = () => {
    const limite = Math.floor(256 / n) * n;
    let b: number;
    do b = randomBytes(1)[0]!;
    while (b >= limite);
    return PALAVRAS[b % n]!;
  };
  const digitos = String(randomBytes(2).readUInt16BE(0) % 100).padStart(2, '0');
  return [escolher(), escolher(), escolher(), digitos].join('-');
}

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email')?.trim().toLowerCase();
  const nome = arg('nome')?.trim();
  const slug = arg('empresa')?.trim();
  const papel = (arg('papel')?.trim() ?? 'proprietario') as PapelEmpresa;

  if (!email || !nome || !slug) {
    throw new Error(
      'Uso: --email <email> --nome "<nome>" --empresa <slug> [--papel proprietario] [--senha <frase>]',
    );
  }

  const senhaInformada = arg('senha');
  const senha = senhaInformada ?? gerarFrase();

  const problema = esquemaSenha.safeParse(senha);
  if (!problema.success) {
    throw new Error(problema.error.issues[0]?.message ?? 'Senha inválida.');
  }
  if (senhaObvia(senha)) {
    throw new Error('Essa senha aparece em listas de ataque. Escolha outra.');
  }

  const db = getPlatformDb();

  const [empresa] = await db
    .select({ id: tenants.id, nome: tenants.displayName })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!empresa) throw new Error(`Empresa "${slug}" não existe.`);

  const senhaHash = await gerarHashSenha(senha);

  // O índice único de `users` é sobre `lower(email)` — uma expressão, e não a
  // coluna —, então `ON CONFLICT` não casa com ele: a idempotência é explícita.
  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let userId: string;
  if (existente) {
    await db
      .update(users)
      .set({ name: nome, passwordHash: senhaHash, isActive: true })
      .where(eq(users.id, existente.id));
    userId = existente.id;
    console.log(`usuário ${email} atualizado`);
  } else {
    const [criado] = await db
      .insert(users)
      .values({ email, name: nome, passwordHash: senhaHash, isActive: true })
      .returning({ id: users.id });
    userId = criado!.id;
    console.log(`usuário ${email} criado`);
  }

  await db
    .insert(memberships)
    .values({ userId, tenantId: empresa.id, role: papel, isActive: true })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.userId],
      set: { role: papel, isActive: true },
    });

  console.log(`acesso ${papel} em "${empresa.nome}" garantido`);
  if (!senhaInformada) {
    console.log('');
    console.log('  Senha gerada (aparece uma única vez):');
    console.log(`  ${senha}`);
    console.log('');
  }
}

main().catch((erro: unknown) => {
  console.error('falhou:', erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
