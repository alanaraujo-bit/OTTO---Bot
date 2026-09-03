import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import {
  DURACAO_SESSAO,
  NOME_COOKIE,
  acessoA,
  lerSessao,
  pode,
  type Acesso,
  type Permissao,
  type Sessao,
} from '@otto/core/auth';
import { semPermissao } from '@otto/shared';

/**
 * Sessão do lado do servidor.
 *
 * `cache` do React memoriza por requisição: layout, página e três componentes
 * podem pedir a sessão sem multiplicar consultas ao banco.
 *
 * Toda a autorização do produto passa por aqui. Componente nenhum lê o cookie
 * direto nem decide permissão por conta própria.
 */

export const sessaoAtual = cache(async (): Promise<Sessao | null> => {
  const jar = await cookies();
  return lerSessao(jar.get(NOME_COOKIE)?.value);
});

export async function definirCookieSessao(token: string, expiraEm: Date): Promise<void> {
  const jar = await cookies();
  jar.set(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Em desenvolvimento o navegador recusaria um cookie `secure` sobre http.
    secure: process.env.APP_ENV !== 'development',
    path: '/',
    expires: expiraEm,
    maxAge: Math.floor(DURACAO_SESSAO / 1000),
  });
}

export async function limparCookieSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(NOME_COOKIE);
}

export async function contextoRequisicao(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  // O Railway coloca o IP real no primeiro item de x-forwarded-for.
  const encaminhado = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return { ip: encaminhado || null, userAgent: h.get('user-agent') };
}

/** Exige sessão. Sem ela, manda para a entrada guardando o destino. */
export async function exigirSessao(destino?: string): Promise<Sessao> {
  const sessao = await sessaoAtual();
  if (!sessao) {
    const proximo = destino ? `?proximo=${encodeURIComponent(destino)}` : '';
    redirect(`/entrar${proximo}`);
  }
  return sessao;
}

/**
 * Exige sessão **e** acesso à empresa.
 *
 * Não pertencer à empresa devolve 404, não 403: dizer "existe, mas você não
 * pode" confirma a existência de um cliente nosso para quem não deveria saber.
 */
export async function exigirAcesso(empresaSlug: string): Promise<Acesso> {
  const sessao = await exigirSessao(`/e/${empresaSlug}`);
  const empresa = sessao.empresas.find((e) => e.slug === empresaSlug);
  const acesso = empresa ? acessoA(sessao, empresa.id) : null;
  if (!acesso) notFound();
  return acesso;
}

/**
 * A verificação de permissão do servidor. Esconder botão é conveniência; isto
 * é a barreira. Toda server action que altera estado chama esta função.
 */
export function exigirPermissao(acesso: Acesso, permissao: Permissao): void {
  if (!pode(acesso, permissao)) {
    throw semPermissao(
      acesso.empresa.status === 'suspenso'
        ? 'Esta empresa está suspensa. Só é possível consultar o histórico.'
        : 'Você não tem permissão para fazer isso.',
    );
  }
}

export { pode };
