import type { Metadata } from 'next';
import { MessagesSquare } from 'lucide-react';

import { listarConversas, type FiltroStatus } from '@otto/core/conversations';

import { ListaConversas } from '@/componentes/inbox/lista.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Conversas' };

const FILTROS_VALIDOS: FiltroStatus[] = ['todas', 'aguardando_humano', 'abertas', 'resolvidas'];

/**
 * Inbox sem conversa aberta.
 *
 * No celular, a lista **é** a tela. No desktop ela divide espaço com um painel
 * que convida a escolher — deixar metade da tela em branco seria desperdiçar a
 * largura que justifica o layout dividido.
 */
export default async function PaginaConversas({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { empresa: slug } = await params;
  const { status } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const filtro: FiltroStatus = FILTROS_VALIDOS.includes(status as FiltroStatus)
    ? (status as FiltroStatus)
    : 'abertas';

  const conversas = await listarConversas(acesso.empresa.id, { status: filtro });

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 w-full flex-col border-r border-linha md:w-[21rem] md:shrink-0">
        <ListaConversas
          conversas={conversas}
          empresaSlug={slug}
          filtroAtual={filtro}
        />
      </div>

      <div className="hidden min-w-0 flex-1 items-center justify-center p-8 md:flex">
        <div className="max-w-[40ch] text-center">
          <MessagesSquare
            aria-hidden
            strokeWidth={1.25}
            className="mx-auto mb-3 size-7 text-texto-3"
          />
          <p className="text-base font-medium text-texto">Escolha uma conversa</p>
          <p className="mt-1 text-sm text-texto-2">
            {conversas.length > 0
              ? 'Selecione um atendimento na lista ao lado para ver o histórico e responder.'
              : 'Quando um cliente enviar mensagem, o atendimento aparece na lista ao lado.'}
          </p>
        </div>
      </div>
    </div>
  );
}
