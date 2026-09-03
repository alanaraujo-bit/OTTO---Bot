import type { Metadata } from 'next';

import { listarItens, type StatusItem } from '@otto/core/knowledge';

import { ListaConhecimento } from '@/componentes/conhecimento/lista.tsx';
import { PaginaLista } from '@/componentes/pagina.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Conhecimento' };

const STATUS_VALIDOS: StatusItem[] = [
  'publicado',
  'rascunho',
  'em_aprovacao',
  'desatualizado',
  'arquivado',
];

/**
 * Centro de Conhecimento.
 *
 * O que a Bia pode responder sobre a empresa. A lista vem ordenada pelo que pede
 * ação — rascunho e "aguardando aprovação" primeiro — e o cabeçalho resume o
 * estado da base em uma linha.
 */
export default async function PaginaConhecimento({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ status?: string; busca?: string }>;
}) {
  const { empresa: slug } = await params;
  const { status, busca } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const filtro = STATUS_VALIDOS.includes(status as StatusItem) ? (status as StatusItem) : undefined;

  const [itens, todos] = await Promise.all([
    listarItens(acesso.empresa.id, { status: filtro, busca }),
    listarItens(acesso.empresa.id),
  ]);

  const publicados = todos.filter((i) => i.status === 'publicado').length;
  const aguardando = todos.filter(
    (i) => i.status === 'rascunho' || i.status === 'em_aprovacao',
  ).length;
  const desatualizados = todos.filter((i) => i.status === 'desatualizado').length;

  return (
    <PaginaLista
      cabecalho={
        <>
          <h1 className="text-xl font-semibold tracking-[-0.015em] text-texto">Conhecimento</h1>
          <p className="mt-0.5 text-sm text-texto-2">
            {todos.length === 0
              ? 'O que a Bia pode responder sobre a sua empresa.'
              : resumo(publicados, aguardando, desatualizados)}
          </p>
        </>
      }
    >
      <ListaConhecimento
        itens={itens}
        empresaSlug={slug}
        filtroAtual={filtro ?? 'tudo'}
        buscaAtual={busca}
      />
    </PaginaLista>
  );
}

function resumo(publicados: number, aguardando: number, desatualizados: number): string {
  const partes = [`${publicados} ${publicados === 1 ? 'item publicado' : 'itens publicados'}`];
  if (aguardando > 0) partes.push(`${aguardando} aguardando revisão`);
  if (desatualizados > 0) partes.push(`${desatualizados} para atualizar`);
  return partes.join(' · ');
}
