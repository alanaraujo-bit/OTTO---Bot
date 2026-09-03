import { and, eq, isNull, sql, users, withoutTenant } from '@otto/db';
import { logger } from '@otto/shared';

import { conferirSenha, gerarHashSenha } from './senha.ts';
import { criarSessao } from './sessao.ts';

/**
 * Entrada no sistema.
 *
 * Duas defesas que valem mais que a validação em si:
 *
 * 1. **Resposta única.** E-mail inexistente, senha errada e conta desativada
 *    devolvem exatamente a mesma mensagem. Distinguir permite descobrir quem tem
 *    conta aqui — que é a primeira etapa de um ataque dirigido.
 *
 * 2. **Tempo constante.** Quando o e-mail não existe, ainda gastamos o custo de
 *    um Argon2id contra um hash descartável. Sem isso, a diferença de tempo entre
 *    "não existe" (instantâneo) e "senha errada" (~50 ms) entrega a informação
 *    que a mensagem única escondeu.
 */

export type ResultadoEntrada =
  | { ok: true; token: string; expiraEm: Date; usuarioId: string }
  | { ok: false; motivo: 'credenciais' | 'limite' };

const MENSAGEM_UNICA = 'E-mail ou senha incorretos.';

/**
 * Hash descartável para o caminho em que o e-mail não existe. Gerado uma vez por
 * processo, com uma senha aleatória que ninguém conhece.
 */
let hashIsca: Promise<string> | null = null;
function iscaDeTempo(): Promise<string> {
  hashIsca ??= gerarHashSenha(`isca-${Math.random()}-${Date.now()}`);
  return hashIsca;
}

export async function entrar(
  email: string,
  senha: string,
  contexto: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoEntrada> {
  const normalizado = email.trim().toLowerCase();

  const conta = await withoutTenant(async (tx) => {
    const [linha] = await tx
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${normalizado}`, isNull(users.deletedAt)))
      .limit(1);
    return linha ?? null;
  });

  // Sem conta, ou sem senha definida: gasta o mesmo tempo e responde igual.
  if (!conta?.passwordHash) {
    await conferirSenha(await iscaDeTempo(), senha);
    logger.info({ email: normalizado }, 'tentativa de entrada sem conta correspondente');
    return { ok: false, motivo: 'credenciais' };
  }

  const confere = await conferirSenha(conta.passwordHash, senha);

  // Conta desativada só é verificada depois da senha: responder antes revelaria
  // que o e-mail existe para quem chutou a senha errada.
  if (!confere || !conta.isActive) {
    logger.info({ usuarioId: conta.id, senhaConfere: confere }, 'entrada recusada');
    return { ok: false, motivo: 'credenciais' };
  }

  const { token, expiraEm } = await criarSessao(conta.id, contexto);

  await withoutTenant((tx) =>
    tx.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, conta.id)),
  );

  logger.info({ usuarioId: conta.id }, 'entrada concluída');
  return { ok: true, token, expiraEm, usuarioId: conta.id };
}

export { MENSAGEM_UNICA };
