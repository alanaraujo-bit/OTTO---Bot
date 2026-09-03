import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  detalharConversa,
  listarConversas,
  marcarComoLida,
  type FiltroStatus,
} from '@otto/core/conversations';
import { pode } from '@otto/core/auth';

import { PainelConversa } from '@/componentes/inbox/conversa.tsx';
import { ListaConversas } from '@/componentes/inbox/lista.tsx';
import { exigirAcesso } from '@/servidor/sessao.ts';

export const metadata: Metadata = { title: 'Conversa' };

/**
 * Uma conversa aberta.
 *
 * No desktop, a lista continua visível ao lado — trocar de atendimento é um
 * clique, sem voltar. No celular, esta é a tela inteira e o botão de voltar
 * leva à lista: a pilha de telas que um aplicativo usa, não três colunas
 * espremidas.
 */
export default async function PaginaConversa({
  params,
  searchParams,
}: {
  params: Promise<{ empresa: string; conversa: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { empresa: slug, conversa: conversaId } = await params;
  const { status } = await searchParams;
  const acesso = await exigirAcesso(slug);

  const detalhe = await detalharConversa(acesso.empresa.id, conversaId);
  // A conversa pode não existir, ou ser de outra empresa — o RLS a esconde e o
  // resultado é o mesmo 404, sem revelar qual dos dois casos ocorreu.
  if (!detalhe) notFound();

  if (pode(acesso, 'conversa.ver')) {
    await marcarComoLida(acesso.empresa.id, conversaId);
  }

  const filtro = (status as FiltroStatus) ?? 'abertas';
  const conversas = await listarConversas(acesso.empresa.id, { status: filtro });

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden min-h-0 w-[21rem] shrink-0 flex-col border-r border-linha md:flex">
        <ListaConversas
          conversas={conversas}
          empresaSlug={slug}
          conversaAtiva={conversaId}
          filtroAtual={filtro}
        />
      </div>

      <div className="min-w-0 flex-1">
        <PainelConversa
          conversa={detalhe}
          empresaSlug={slug}
          usuarioId={acesso.sessao.usuario.id}
          permissoes={{
            responder: pode(acesso, 'conversa.responder'),
            assumir: pode(acesso, 'conversa.assumir'),
            encerrar: pode(acesso, 'conversa.encerrar'),
          }}
        />
      </div>
    </div>
  );
}
