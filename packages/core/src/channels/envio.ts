import { and, channels, conversations, eq, messages, withTenant } from '@otto/db';
import { childLogger, dependenciaExterna, descreverErro, naoEncontrado } from '@otto/shared';

/**
 * Envio de mensagens para os canais.
 *
 * O adaptador do canal é escolhido pelo tipo. Nenhum código fora daqui sabe como
 * a Meta espera o payload — trocar de provedor, ou acrescentar um canal, é
 * escrever um adaptador.
 *
 * O estado da mensagem acompanha o envio de perto, porque o operador precisa
 * saber se o cliente recebeu: `pendente` → `enviando` → `enviada` → `entregue`,
 * ou `falhou` com o motivo em português.
 */

export interface ResultadoEnvio {
  ok: boolean;
  /** Id da mensagem no provedor, quando o envio deu certo. */
  externalId?: string;
  erro?: string;
  /** Se vale tentar de novo. Token inválido não vale; instabilidade vale. */
  recuperavel?: boolean;
}

export async function enviarMensagem(
  tenantId: string,
  messageId: string,
): Promise<ResultadoEnvio> {
  const log = childLogger({ tenantId, messageId });

  const contexto = await withTenant(tenantId, async (tx) => {
    const [linha] = await tx
      .select({
        corpo: messages.body,
        status: messages.status,
        canalTipo: channels.kind,
        canalId: channels.id,
        canalStatus: channels.status,
        credenciais: channels.credentials,
        canalExterno: channels.externalId,
        destinatario: conversations.contactId,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(channels, eq(channels.id, conversations.channelId))
      .where(eq(messages.id, messageId))
      .limit(1);
    return linha;
  });

  if (!contexto) throw naoEncontrado('Esta mensagem');

  // Já enviada: reprocessamento de job não manda de novo.
  if (contexto.status !== 'pendente' && contexto.status !== 'falhou') {
    log.debug({ status: contexto.status }, 'mensagem já processada');
    return { ok: true };
  }

  if (contexto.canalStatus === 'pausado' || contexto.canalStatus === 'desconectado') {
    await marcarFalha(tenantId, messageId, 'O canal está desconectado.');
    return { ok: false, erro: 'canal indisponível', recuperavel: false };
  }

  await withTenant(tenantId, (tx) =>
    tx.update(messages).set({ status: 'enviando' }).where(eq(messages.id, messageId)),
  );

  try {
    const resultado = await despachar(contexto.canalTipo, {
      texto: contexto.corpo ?? '',
      credenciais: contexto.credenciais,
      canalExterno: contexto.canalExterno,
    });

    await withTenant(tenantId, (tx) =>
      tx
        .update(messages)
        .set({
          status: 'enviada',
          sentAt: new Date(),
          externalId: resultado.externalId,
          failureReason: null,
        })
        .where(eq(messages.id, messageId)),
    );

    log.info({ canal: contexto.canalTipo }, 'mensagem enviada');
    return { ok: true, externalId: resultado.externalId };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'falha ao enviar';
    const recuperavel = erro instanceof Error && 'retryable' in erro ? Boolean(erro.retryable) : true;

    // Só marca falha definitiva quando não vale tentar de novo: marcar antes
    // faria a Inbox mostrar erro enquanto a fila ainda está tentando.
    if (!recuperavel) await marcarFalha(tenantId, messageId, mensagem);

    log.error({ erro: descreverErro(erro), recuperavel }, 'envio falhou');
    return { ok: false, erro: mensagem, recuperavel };
  }
}

async function marcarFalha(
  tenantId: string,
  messageId: string,
  motivo: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(messages)
      .set({ status: 'falhou', failedAt: new Date(), failureReason: motivo })
      .where(eq(messages.id, messageId)),
  );
}

interface PedidoDespacho {
  texto: string;
  credenciais: string | null;
  canalExterno: string | null;
}

/**
 * Escolhe o adaptador.
 *
 * O `simulador` "entrega" localmente: a conversa fica completa no console e é
 * possível demonstrar o produto inteiro sem depender da Meta. Ele nunca finge
 * ser WhatsApp — o canal é de outro tipo, e isso aparece na Inbox.
 */
async function despachar(
  tipo: 'whatsapp' | 'instagram' | 'simulador',
  pedido: PedidoDespacho,
): Promise<{ externalId: string }> {
  switch (tipo) {
    case 'simulador': {
      const { uuidv7 } = await import('@otto/shared');
      return { externalId: `sim-out-${uuidv7()}` };
    }

    case 'whatsapp':
    case 'instagram': {
      // O adaptador da Meta entra quando houver app aprovado e credencial. Até
      // lá, falhar explicitamente é o comportamento correto: um envio que
      // silenciosamente não acontece é pior que um erro visível.
      throw Object.assign(
        dependenciaExterna('O canal do WhatsApp/Instagram ainda não está conectado'),
        { retryable: false },
      );
    }
  }
}
