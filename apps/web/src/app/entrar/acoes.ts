'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { MENSAGEM_UNICA, entrar } from '@otto/core/auth';
import { logger } from '@otto/shared';

import { contextoRequisicao, definirCookieSessao, sessaoAtual } from '@/servidor/sessao.ts';

/**
 * Ação de entrada.
 *
 * Devolve estado de formulário em vez de lançar: a pessoa precisa ver o que
 * aconteceu no lugar de uma tela de erro.
 */

export interface EstadoEntrada {
  erro?: string;
  /** Devolvido para o campo não esvaziar quando a senha erra. */
  email?: string;
}

const esquema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Informe um e-mail válido.')),
  senha: z.string().min(1, 'Informe sua senha.'),
  proximo: z.string().optional(),
});

/** Só aceita caminho interno — `proximo` vem da URL e é entrada não confiável. */
function destinoSeguro(proximo: string | undefined): string {
  if (!proximo) return '/';
  if (!proximo.startsWith('/') || proximo.startsWith('//')) return '/';
  return proximo;
}

export async function acaoEntrar(
  _anterior: EstadoEntrada,
  dados: FormData,
): Promise<EstadoEntrada> {
  const analise = esquema.safeParse({
    email: dados.get('email'),
    senha: dados.get('senha'),
    proximo: dados.get('proximo') ?? undefined,
  });

  if (!analise.success) {
    return {
      erro: analise.error.issues[0]?.message ?? 'Confira os dados informados.',
      email: String(dados.get('email') ?? ''),
    };
  }

  const { email, senha, proximo } = analise.data;
  const contexto = await contextoRequisicao();
  const resultado = await entrar(email, senha, contexto);

  if (!resultado.ok) {
    return { erro: MENSAGEM_UNICA, email };
  }

  await definirCookieSessao(resultado.token, resultado.expiraEm);
  logger.info({ usuarioId: resultado.usuarioId }, 'sessão iniciada');

  // `redirect` lança por dentro — precisa ficar fora de qualquer try/catch.
  redirect(destinoSeguro(proximo));
}

/** Usada pela página para mandar quem já entrou direto para o destino. */
export async function jaAutenticado(): Promise<boolean> {
  return (await sessaoAtual()) !== null;
}
