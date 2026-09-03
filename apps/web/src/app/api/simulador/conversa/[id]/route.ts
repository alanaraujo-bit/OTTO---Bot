import { NextResponse } from 'next/server';

import { detalharConversa } from '@otto/core/conversations';
import { acessoA, pode } from '@otto/core/auth';
import { conversations, eq, getPlatformDb } from '@otto/db';

import { sessaoAtual } from '@/servidor/sessao.ts';

/**
 * Última resposta de uma conversa.
 *
 * Serve ao simulador: depois de enviar, ele busca o texto que o cliente
 * receberia, em vez de reconstruí-lo — assim a tela mostra exatamente o que foi
 * gravado, e não uma aproximação.
 *
 * A conversa vem por id, então a autorização precisa descobrir a empresa dela
 * antes de decidir. É feito pelo caminho de plataforma e imediatamente
 * verificado contra a sessão: quem não pertence à empresa recebe 404.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _requisicao: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const sessao = await sessaoAtual();
  if (!sessao) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });

  const [conversa] = await getPlatformDb()
    .select({ tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!conversa) return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });

  const acesso = acessoA(sessao, conversa.tenantId);
  // Indistinguível de "não existe": não confirmamos a conversa de outra empresa.
  if (!acesso || !pode(acesso, 'conversa.ver')) {
    return NextResponse.json({ erro: 'não encontrado' }, { status: 404 });
  }

  const detalhe = await detalharConversa(conversa.tenantId, id);
  const ultima = detalhe?.mensagens.filter((m) => m.direcao === 'saida').at(-1);

  return NextResponse.json({
    ultimaResposta: ultima?.corpo ?? null,
    status: detalhe?.status ?? null,
  });
}
