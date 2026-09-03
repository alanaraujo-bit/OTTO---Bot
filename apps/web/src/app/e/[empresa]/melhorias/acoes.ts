'use server';

import { revalidatePath } from 'next/cache';

import { aceitarSugestao, recusarSugestao } from '@otto/core/aprendizado';
import { toAppError } from '@otto/shared';

import { exigirAcesso, exigirPermissao } from '@/servidor/sessao.ts';

/**
 * Revisão de sugestões.
 *
 * A permissão exigida é `sugestao.revisar`, e não `conhecimento.editar`: aceitar
 * uma sugestão publica conhecimento oficial, e quem só propõe melhorias não
 * decide o que a empresa passa a responder.
 */

export interface Resultado {
  ok: boolean;
  erro?: string;
}

export async function acaoAceitar(
  empresaSlug: string,
  sugestaoId: string,
  titulo: string,
  corpo: string,
): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, 'sugestao.revisar');

    await aceitarSugestao(acesso.empresa.id, acesso.sessao.usuario.id, sugestaoId, {
      titulo,
      corpo,
    });

    revalidatePath(`/e/${empresaSlug}/melhorias`);
    revalidatePath(`/e/${empresaSlug}/conhecimento`);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: toAppError(erro).message };
  }
}

export async function acaoRecusar(
  empresaSlug: string,
  sugestaoId: string,
  motivo?: string,
): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, 'sugestao.revisar');

    await recusarSugestao(acesso.empresa.id, acesso.sessao.usuario.id, sugestaoId, motivo);
    revalidatePath(`/e/${empresaSlug}/melhorias`);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: toAppError(erro).message };
  }
}
