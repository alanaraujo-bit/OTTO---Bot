import {
  and,
  channels,
  eq,
  getPlatformDb,
  webhookEvents,
} from '@otto/db';
import { childLogger } from '@otto/shared';

import { atenderAutomaticamente } from './atendimento.ts';
import { receberMensagem } from './ingestao.ts';

/**
 * Interpretação de um evento da Meta já gravado.
 *
 * Roda no **worker**, nunca no caminho da requisição. O `web` só grava o
 * payload cru e enfileira; quem resolve empresa → canal → contato → conversa e
 * aciona o agente é este módulo.
 *
 * A separação não é preferência de organização. A Meta espera resposta rápida
 * do webhook e reenvia quando não recebe — fazer a chamada de IA (segundos)
 * antes de responder `200` produz entrega duplicada e, na insistência, o
 * webhook desativado. Medido: 14,2 s com a IA no caminho síncrono contra 0,15 s
 * gravando e enfileirando.
 *
 * Isso **não** contradiz a regra de que a resposta do agente não passa por fila.
 * Ela vale para o Simulador, onde quem espera do outro lado do HTTP é a pessoa
 * usando o console. Aqui quem espera é a Meta, e o cliente recebe a resposta por
 * um envio próprio — adiar em uma fila não acrescenta nada à espera dele.
 */

export interface ResultadoEntrada {
  /** Conversas que receberam mensagem nova. */
  conversas: string[];
  /** Preenchido quando o evento é válido mas não gera atendimento. */
  descarte: string | null;
  tenantId: string | null;
  channelId: string | null;
}

interface MensagemMeta {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

export interface PayloadMeta {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: MensagemMeta[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

/**
 * Processa o evento e devolve o que aconteceu.
 *
 * Não marca o `webhook_events` — quem faz isso é o worker, que sabe se ainda
 * há tentativas pela frente.
 */
export async function interpretarEventoMeta(
  payload: PayloadMeta,
): Promise<ResultadoEntrada> {
  const vazio: ResultadoEntrada = {
    conversas: [],
    descarte: null,
    tenantId: null,
    channelId: null,
  };

  if (payload.object !== 'whatsapp_business_account') {
    return { ...vazio, descarte: 'objeto não é whatsapp_business_account' };
  }

  const mudancas = (payload.entry ?? []).flatMap((entrada) => entrada.changes ?? []);
  const conversas: string[] = [];
  let descarte: string | null = null;
  let tenantId: string | null = null;
  let channelId: string | null = null;

  for (const mudanca of mudancas) {
    const valor = mudanca.value;
    if (!valor) continue;

    // Confirmações de entrega e leitura chegam pela mesma porta. Refletir isso
    // no estado da mensagem depende do adaptador de envio (B3).
    if (!valor.messages?.length) {
      descarte ??= valor.statuses?.length ? 'evento de status, sem mensagem' : 'evento sem mensagem';
      continue;
    }

    const phoneNumberId = valor.metadata?.phone_number_id;
    const canal = phoneNumberId ? await encontrarCanal(phoneNumberId) : null;
    if (!canal) {
      // Um número que não é nosso não é erro do remetente: é um canal que ainda
      // não foi cadastrado, e o Backoffice precisa enxergar isso.
      descarte ??= `canal desconhecido (phone_number_id ${phoneNumberId ?? 'ausente'})`;
      continue;
    }

    tenantId ??= canal.tenantId;
    channelId ??= canal.id;
    const log = childLogger({ tenantId: canal.tenantId, channelId: canal.id });

    for (const mensagem of valor.messages) {
      const texto = mensagem.type === 'text' ? mensagem.text?.body?.trim() : null;
      if (!texto) {
        // Áudio, imagem e documento entram quando houver transcrição e leitura
        // de mídia; o payload fica gravado para reprocessar depois.
        descarte ??= `tipo não suportado: ${mensagem.type ?? 'desconhecido'}`;
        continue;
      }

      const perfil = valor.contacts?.find((c) => c.wa_id === mensagem.from);

      const recebida = await receberMensagem({
        tenantId: canal.tenantId,
        channelId: canal.id,
        remetenteExterno: mensagem.from,
        nomePerfil: perfil?.profile?.name ?? null,
        telefone: /^\d{10,15}$/.test(mensagem.from) ? mensagem.from : null,
        mensagemExterna: mensagem.id,
        texto,
        enviadaEm: mensagem.timestamp ? new Date(Number(mensagem.timestamp) * 1000) : undefined,
      });

      if (!recebida.nova) {
        log.debug({ externalId: mensagem.id }, 'mensagem repetida da Meta');
        continue;
      }

      await atenderAutomaticamente(
        canal.tenantId,
        recebida.conversationId,
        recebida.messageId,
        texto,
      );
      conversas.push(recebida.conversationId);
    }
  }

  return {
    conversas,
    descarte: conversas.length === 0 ? (descarte ?? 'nada a processar') : null,
    tenantId,
    channelId,
  };
}

/**
 * Resolve o canal pelo `phone_number_id`.
 *
 * Acontece **antes** de haver contexto de empresa — é o número que revela de
 * quem é a mensagem —, então usa o caminho de plataforma, nunca o do console.
 */
async function encontrarCanal(
  phoneNumberId: string,
): Promise<{ id: string; tenantId: string } | null> {
  const [canal] = await getPlatformDb()
    .select({ id: channels.id, tenantId: channels.tenantId })
    .from(channels)
    .where(and(eq(channels.externalId, phoneNumberId), eq(channels.kind, 'whatsapp')))
    .limit(1);

  return canal ?? null;
}

/** Lê o payload cru de um evento para reprocessamento. */
export async function lerEventoWebhook(
  id: string,
): Promise<{ payload: PayloadMeta; attempts: number } | null> {
  const [linha] = await getPlatformDb()
    .select({ payload: webhookEvents.payload, attempts: webhookEvents.attempts })
    .from(webhookEvents)
    .where(eq(webhookEvents.id, id))
    .limit(1);

  if (!linha) return null;
  return { payload: linha.payload as PayloadMeta, attempts: linha.attempts };
}
