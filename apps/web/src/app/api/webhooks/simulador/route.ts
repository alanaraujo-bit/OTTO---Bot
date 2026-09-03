import { NextResponse } from 'next/server';
import { z } from 'zod';

import { atenderAutomaticamente, receberMensagem } from '@otto/core/conversations';
import { and, channels, eq, withTenant } from '@otto/db';
import { descreverErro, logger, toAppError, uuidv7 } from '@otto/shared';

/**
 * Webhook do canal de teste.
 *
 * **Não é um atalho que pula etapas.** Ele entra pelo mesmo caminho dos canais
 * reais: mesma ingestão, mesma deduplicação, mesmo agente, mesmo registro de
 * custo. A única diferença é a origem do payload.
 *
 * Existe para que a cadeia seja exercitável antes da aprovação da Meta — e
 * continue sendo depois, em teste e em demonstração, sem gastar mensagem real.
 *
 * A proteção aqui é o próprio `channelId`: um UUID que só quem tem acesso ao
 * console conhece, e que precisa apontar para um canal do tipo `simulador`. Um
 * canal de WhatsApp real nunca aceita entrada por esta rota.
 */

export const dynamic = 'force-dynamic';

const esquema = z.object({
  channelId: z.uuid(),
  /** Quem está mandando. Números diferentes viram contatos diferentes. */
  de: z.string().min(3).max(40),
  nome: z.string().max(120).optional(),
  texto: z.string().min(1).max(4000),
  /** Opcional: repetir o mesmo id testa a deduplicação. */
  externalId: z.string().max(200).optional(),
});

export async function POST(requisicao: Request) {
  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  const analise = esquema.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json(
      { erro: 'Dados inválidos.', detalhes: analise.error.issues.map((i) => i.message) },
      { status: 422 },
    );
  }

  const { channelId, de, nome, texto, externalId } = analise.data;

  try {
    // Descobrir a empresa a partir do canal é o mesmo passo que os canais reais
    // fazem — a diferença é que lá o identificador vem da Meta.
    const canal = await encontrarCanalSimulador(channelId);
    if (!canal) {
      return NextResponse.json(
        { erro: 'Canal de teste não encontrado ou não é um simulador.' },
        { status: 404 },
      );
    }

    const recebida = await receberMensagem({
      tenantId: canal.tenantId,
      channelId,
      remetenteExterno: de,
      nomePerfil: nome ?? null,
      telefone: /^\d{10,15}$/.test(de) ? de : null,
      mensagemExterna: externalId ?? `sim-${uuidv7()}`,
      texto,
    });

    if (!recebida.nova) {
      return NextResponse.json({
        situacao: 'repetida',
        conversaId: recebida.conversationId,
      });
    }

    const atendimento = await atenderAutomaticamente(
      canal.tenantId,
      recebida.conversationId,
      recebida.messageId,
      texto,
    );

    return NextResponse.json({
      situacao: atendimento.respondeu ? 'respondida' : 'encaminhada',
      conversaId: recebida.conversationId,
      handoff: atendimento.handoff ?? null,
      runId: atendimento.runId ?? null,
    });
  } catch (erro) {
    const app = toAppError(erro);
    logger.error({ erro: descreverErro(erro) }, 'webhook do simulador falhou');
    return NextResponse.json({ erro: app.message }, { status: app.status });
  }
}

/**
 * Resolve o canal usando o papel de plataforma.
 *
 * A busca precisa acontecer **antes** de haver contexto de empresa — é
 * justamente o canal que revela de qual empresa a mensagem é. É o mesmo caminho
 * que um webhook real da Meta percorre.
 */
async function encontrarCanalSimulador(
  channelId: string,
): Promise<{ tenantId: string } | null> {
  const { getPlatformDb } = await import('@otto/db');

  const [canal] = await getPlatformDb()
    .select({ tenantId: channels.tenantId })
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.kind, 'simulador')))
    .limit(1);

  return canal ?? null;
}
