import {
  and,
  channels,
  contactIdentities,
  conversations,
  eq,
  messages,
  sql,
  withTenant,
} from '@otto/db';
import { AppError, childLogger, descreverErro, naoEncontrado } from '@otto/shared';

import { publicarEvento } from '../events/barramento.ts';

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
        contactId: conversations.contactId,
        /**
         * Para quem a mensagem vai, no identificador do provedor.
         *
         * Vem de `contact_identities` e não do telefone do contato: o telefone é
         * dado de cadastro, editável por quem atende, e mandar mensagem para um
         * número digitado à mão entregaria a conversa de um cliente a outro. O
         * `external_id` é o que o provedor nos disse.
         */
        destinatario: contactIdentities.externalId,
        /**
         * O `wamid` da mensagem citada, quando esta é uma resposta.
         *
         * Subconsulta e não join: um join a mais na tabela de mensagens só para
         * ler uma coluna que é nula na maioria esmagadora das linhas custaria
         * em todo envio, e a política de RLS vale igual aqui dentro.
         *
         * Pode voltar nulo mesmo havendo citação — se a mensagem citada ainda
         * não chegou a sair, ela não tem `wamid`. Nesse caso o envio segue sem
         * a citação: uma resposta sem citação chega, e uma resposta que não sai
         * não chega.
         */
        respondendoWamid: sql<
          string | null
        >`(select p.external_id from messages p where p.id = ${messages.replyToMessageId})`,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(channels, eq(channels.id, conversations.channelId))
      .leftJoin(
        contactIdentities,
        and(
          eq(contactIdentities.contactId, conversations.contactId),
          eq(contactIdentities.kind, channels.kind),
        ),
      )
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
      destinatario: contexto.destinatario,
      respondendoWamid: contexto.respondendoWamid,
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

    await publicarEvento(tenantId, { tipo: 'status_mensagem' });

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

  await publicarEvento(tenantId, { tipo: 'status_mensagem' });
}

interface PedidoDespacho {
  texto: string;
  credenciais: string | null;
  canalExterno: string | null;
  destinatario: string | null;
  /** `wamid` da mensagem citada. Nulo quando a resposta não cita nenhuma. */
  respondendoWamid: string | null;
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

    case 'whatsapp': {
      // Cada uma destas ausências é uma configuração incompleta, não uma falha
      // passageira: repetir cinco vezes daria o mesmo resultado.
      if (!pedido.canalExterno) {
        throw semRetentativa('O canal não tem número da Meta configurado.');
      }
      if (!pedido.destinatario) {
        throw semRetentativa('Não sabemos o WhatsApp deste cliente.');
      }
      if (!pedido.credenciais) {
        throw semRetentativa(
          'O canal não tem credencial de envio. Conecte o número para que as respostas cheguem ao cliente.',
        );
      }

      const { enviarPeloWhatsApp } = await import('./whatsapp.ts');
      const { wamid } = await enviarPeloWhatsApp({
        phoneNumberId: pedido.canalExterno,
        para: pedido.destinatario,
        texto: pedido.texto,
        credenciaisCifradas: pedido.credenciais,
        respondendoWamid: pedido.respondendoWamid,
      });

      return { externalId: wamid };
    }

    case 'instagram': {
      // O Instagram é a próxima vertical; falhar explicitamente é melhor que um
      // envio que silenciosamente não acontece.
      throw semRetentativa('O envio pelo Instagram ainda não está ligado.');
    }
  }
}

const semRetentativa = (mensagem: string): Error =>
  Object.assign(new AppError('dependencia_externa', mensagem), { retryable: false });
