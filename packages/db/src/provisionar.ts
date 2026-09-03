import { pathToFileURL } from 'node:url';

import { gerarHashSenha, esquemaSenha, senhaObvia } from '@otto/core/auth';
import { eq, getPlatformDb, memberships, sql, tenants, users } from './index.ts';

/**
 * Primeira empresa de um ambiente.
 *
 * Um ambiente recém-migrado tem as tabelas mas nenhuma empresa, e o produto não
 * tem tela de auto-cadastro — por decisão: quem entra é convidado por nós, não
 * se inscreve sozinho. Sem isto, um banco novo fica inacessível até alguém
 * abrir um cliente SQL, que é justamente o que não queremos pedir a ninguém.
 *
 * Roda pelo arranque do worker, que é quem alcança o banco pela rede privada.
 * É controlado por variáveis e **não faz nada se elas não existirem**, então
 * fica inerte em todo deploy seguinte:
 *
 *   PROVISIONAR_SLUG          slug da empresa (ex.: supermercado-campeao)
 *   PROVISIONAR_EMPRESA       nome que aparece na interface
 *   PROVISIONAR_EMAIL         e-mail do proprietário
 *   PROVISIONAR_NOME          nome do proprietário
 *   PROVISIONAR_SENHA         senha inicial (mesma regra do produto)
 *   PROVISIONAR_FUSO          opcional; padrão America/Belem
 *
 * Não cria dado de demonstração: uma empresa de verdade começa vazia, e o
 * conteúdo dela vem do dono. Semear ficção em produção seria a pior forma de
 * estrear um produto que existe para não inventar informação.
 *
 * Idempotente: rodar de novo confirma o estado em vez de duplicar.
 */
export async function provisionar(): Promise<void> {
  const slug = process.env.PROVISIONAR_SLUG?.trim();
  if (!slug) return;

  const nomeEmpresa = process.env.PROVISIONAR_EMPRESA?.trim() ?? slug;
  const email = process.env.PROVISIONAR_EMAIL?.trim().toLowerCase();
  const nome = process.env.PROVISIONAR_NOME?.trim();
  const senha = process.env.PROVISIONAR_SENHA;
  const fuso = process.env.PROVISIONAR_FUSO?.trim() || 'America/Belem';

  if (!email || !nome || !senha) {
    throw new Error(
      'PROVISIONAR_SLUG está definido, mas faltam PROVISIONAR_EMAIL, PROVISIONAR_NOME ou PROVISIONAR_SENHA.',
    );
  }

  const validacao = esquemaSenha.safeParse(senha);
  if (!validacao.success) {
    throw new Error(`PROVISIONAR_SENHA: ${validacao.error.issues[0]?.message}`);
  }
  if (senhaObvia(senha)) {
    throw new Error('PROVISIONAR_SENHA aparece em listas de ataque. Escolha outra.');
  }

  const db = getPlatformDb();

  const [empresa] = await db
    .insert(tenants)
    .values({ slug, displayName: nomeEmpresa, status: 'ativo', timezone: fuso })
    .onConflictDoUpdate({ target: tenants.slug, set: { displayName: nomeEmpresa } })
    .returning({ id: tenants.id });

  const tenantId = empresa!.id;
  console.log(`[provisionar] empresa "${nomeEmpresa}" (${slug}) pronta`);

  const senhaHash = await gerarHashSenha(senha);

  // O índice único de `users` é sobre `lower(email)` — uma expressão, e não a
  // coluna —, então `ON CONFLICT` não casa com ele: a idempotência é explícita.
  const [existente] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const userId = existente
    ? (
        await db
          .update(users)
          .set({ name: nome, passwordHash: senhaHash, isActive: true })
          .where(eq(users.id, existente.id))
          .returning({ id: users.id })
      )[0]!.id
    : (
        await db
          .insert(users)
          .values({
            email,
            name: nome,
            passwordHash: senhaHash,
            isActive: true,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: users.id })
      )[0]!.id;

  await db
    .insert(memberships)
    .values({ tenantId, userId, role: 'proprietario', isActive: true })
    .onConflictDoUpdate({
      target: [memberships.tenantId, memberships.userId],
      set: { role: 'proprietario', isActive: true },
    });

  console.log(`[provisionar] ${email} é proprietário de "${nomeEmpresa}"`);
}

// Executável direto, para uso fora do arranque. `pathToFileURL` em vez de
// montar a URL à mão: no Windows o caminho vem com barra invertida e a
// comparação ingênua nunca casaria — o script viraria um no-op silencioso.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  provisionar()
    .then(() => process.exit(0))
    .catch((erro: unknown) => {
      console.error('[provisionar] falhou:', erro instanceof Error ? erro.message : erro);
      process.exit(1);
    });
}
