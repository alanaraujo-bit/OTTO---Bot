'use server';

import { revalidatePath } from 'next/cache';

import { publicarConfiguracao, reverterPara, salvarRascunho } from '@otto/core/ai';
import { toAppError } from '@otto/shared';

import { exigirAcesso, exigirPermissao } from '@/servidor/sessao.ts';

export interface Resultado {
  ok: boolean;
  erro?: string;
  versao?: number;
}

export async function acaoSalvar(empresaSlug: string, dados: unknown): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, 'agente.editar');
    await salvarRascunho(acesso.empresa.id, dados);
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: toAppError(erro).message };
  }
}

export async function acaoPublicar(empresaSlug: string, nota?: string): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, 'agente.publicar');

    const versao = await publicarConfiguracao(
      acesso.empresa.id,
      acesso.sessao.usuario.id,
      nota,
    );

    revalidatePath(`/e/${empresaSlug}/atendente`);
    return { ok: true, versao };
  } catch (erro) {
    return { ok: false, erro: toAppError(erro).message };
  }
}

export async function acaoReverter(empresaSlug: string, versaoId: string): Promise<Resultado> {
  try {
    const acesso = await exigirAcesso(empresaSlug);
    exigirPermissao(acesso, 'agente.publicar');

    const versao = await reverterPara(acesso.empresa.id, acesso.sessao.usuario.id, versaoId);
    revalidatePath(`/e/${empresaSlug}/atendente`);
    return { ok: true, versao };
  } catch (erro) {
    return { ok: false, erro: toAppError(erro).message };
  }
}
