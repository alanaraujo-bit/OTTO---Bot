'use server';

import { revalidatePath } from 'next/cache';

import {
  alterarModo,
  assumirConversa,
  devolverParaIA,
  resolverConversa,
  responderComoOperador,
} from '@otto/core/conversations';
import { enfileirarEnvio } from '@otto/core/queue';
import { toAppError } from '@otto/shared';

import { exigirAcesso, exigirPermissao } from '@/servidor/sessao.ts';

/**
 * Ações da Inbox.
 *
 * Toda uma delas verifica permissão no servidor antes de qualquer escrita.
 * Esconder o botão na interface é conveniência para quem usa; a barreira é
 * `exigirPermissao`.
 *
 * As ações devolvem `{ ok, erro }` em vez de lançar: um erro de permissão ou de
 * concorrência precisa aparecer na tela como uma frase que a pessoa entenda, não
 * como tela de erro.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

async function executar(
  empresaSlug: string,
  permissao: Parameters<typeof exigirPermissao>[1],
  trabalho: (acesso: Awaited<ReturnType<typeof exigirAcesso>>) => Promise<void>,
): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, permissao);
    await trabalho(acesso);
    revalidatePath(`/e/${empresaSlug}/conversas`);
    return { ok: true };
  } catch (erro) {
    const app = toAppError(erro);
    return { ok: false, erro: app.message };
  }
}

export async function acaoAssumir(empresaSlug: string, conversaId: string): Promise<Resultado> {
  return executar(empresaSlug, 'conversa.assumir', (acesso) =>
    assumirConversa(acesso.empresa.id, conversaId, acesso.sessao.usuario.id),
  );
}

export async function acaoDevolver(empresaSlug: string, conversaId: string): Promise<Resultado> {
  return executar(empresaSlug, 'conversa.assumir', (acesso) =>
    devolverParaIA(acesso.empresa.id, conversaId, acesso.sessao.usuario.id),
  );
}

export async function acaoResolver(empresaSlug: string, conversaId: string): Promise<Resultado> {
  return executar(empresaSlug, 'conversa.encerrar', (acesso) =>
    resolverConversa(acesso.empresa.id, conversaId, acesso.sessao.usuario.id),
  );
}

export async function acaoAlterarModo(
  empresaSlug: string,
  conversaId: string,
  modo: 'automatico' | 'copilot' | 'humano',
): Promise<Resultado> {
  return executar(empresaSlug, 'conversa.pausar_ia', (acesso) =>
    alterarModo(acesso.empresa.id, conversaId, modo, acesso.sessao.usuario.id),
  );
}

export async function acaoResponder(
  empresaSlug: string,
  conversaId: string,
  texto: string,
  chaveIdempotencia: string,
): Promise<Resultado> {
  return executar(empresaSlug, 'conversa.responder', async (acesso) => {
    const { mensagemId, duplicada } = await responderComoOperador(
      acesso.empresa.id,
      conversaId,
      acesso.sessao.usuario.id,
      texto,
      chaveIdempotencia,
    );

    // Sem isto a resposta do operador ficava gravada e **nunca saía**: a
    // mensagem aparecia na conversa, com o relógio de "aguardando envio", e o
    // cliente nunca recebia. O caminho da IA já enfileirava; este não.
    //
    // Fora da transação de propósito, e só quando a mensagem é nova: enfileirar
    // a duplicada mandaria de novo o que o clique repetido acabou de impedir.
    if (!duplicada && mensagemId) {
      await enfileirarEnvio({ tenantId: acesso.empresa.id, messageId: mensagemId });
    }
  });
}
