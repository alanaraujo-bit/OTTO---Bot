'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { NOME_COOKIE, revogarSessao } from '@otto/core/auth';
import { logger } from '@otto/shared';

import { limparCookieSessao, sessaoAtual } from './sessao.ts';

/**
 * Sair.
 *
 * Revoga no banco antes de apagar o cookie: apagar só o cookie deixaria a sessão
 * válida para quem tivesse copiado o token.
 */
export async function acaoSair(): Promise<never> {
  const jar = await cookies();
  const token = jar.get(NOME_COOKIE)?.value;

  if (token) {
    await revogarSessao(token);
    logger.info('sessão encerrada');
  }

  await limparCookieSessao();
  redirect('/entrar');
}

/** Troca a empresa ativa e lembra a escolha para a próxima visita. */
export async function acaoTrocarEmpresa(slug: string): Promise<never> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect('/entrar');

  const empresa = sessao.empresas.find((e) => e.slug === slug);
  // Slug desconhecido volta para a raiz, que decide de novo — nunca confia no
  // que veio do cliente.
  if (!empresa) redirect('/');

  const { lembrarEmpresa } = await import('@otto/core/auth');
  await lembrarEmpresa(sessao.id, empresa.id);

  redirect(`/e/${empresa.slug}`);
}
