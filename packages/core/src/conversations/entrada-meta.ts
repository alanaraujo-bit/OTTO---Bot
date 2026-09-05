import { and, channels, eq, getPlatformDb, inArray, messages, webhookEvents, withTenant } from '@otto/db';
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
  /** Confirmações de entrega aplicadas. */
  estados: number;
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

/**
 * Confirmação de entrega vinda da Meta.
 *
 * `id` é o `wamid` que devolvemos no envio — é ele que amarra a confirmação à
 * mensagem que está na Inbox.
 */
interface StatusMeta {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
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
        statuses?: StatusMeta[];
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
    estados: 0,
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
  /** Confirmações de entrega aplicadas — um evento só de status não é descarte. */
  let estados = 0;

  for (const mudanca of mudancas) {
    const valor = mudanca.value;
    if (!valor) continue;

    if (!valor.messages?.length && !valor.statuses?.length) {
      descarte ??= 'evento sem mensagem nem status';
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

    // Confirmações de entrega e leitura das mensagens que **nós** mandamos.
    for (const status of valor.statuses ?? []) {
      const aplicou = await aplicarStatus(canal.tenantId, status);
      if (aplicou) estados += 1;
    }

    if (!valor.messages?.length) {
      descarte ??= estados > 0 ? null : 'status sem mensagem correspondente';
      continue;
    }

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

  const semEfeito = conversas.length === 0 && estados === 0;
  return {
    conversas,
    estados,
    descarte: semEfeito ? (descarte ?? 'nada a processar') : null,
    tenantId,
    channelId,
  };
}

/**
 * Aplica uma confirmação de entrega à mensagem que ela descreve.
 *
 * Duas regras decidem tudo aqui:
 *
 * **O estado só avança.** A Meta entrega fora de ordem, então `delivered` chega
 * depois de `read` com frequência suficiente para importar. Sem a guarda, a
 * Inbox mostraria uma mensagem "voltando" de lida para entregue — e o operador
 * confia nesse ícone para saber se precisa insistir com o cliente. A guarda
 * está no `WHERE` e não em código: duas confirmações simultâneas do mesmo
 * `wamid` seriam uma corrida que a leitura-antes-da-escrita perderia.
 *
 * **`failed` é exceção.** Ele pode chegar depois de `sent` e precisa vencer,
 * porque significa que a mensagem não chegou. Só não vence `lida`, que é prova
 * de que chegou.
 */
async function aplicarStatus(tenantId: string, status: StatusMeta): Promise<boolean> {
  const wamid = status.id;
  const nome = status.status;
  if (!wamid || !nome) return false;

  const mapa: Record<string, 'enviada' | 'entregue' | 'lida' | 'falhou'> = {
    sent: 'enviada',
    delivered: 'entregue',
    read: 'lida',
    failed: 'falhou',
  };

  const novo = mapa[nome];
  // `deleted` e status futuros que ainda não sabemos tratar: ignorar é melhor
  // que adivinhar o que significam para o operador.
  if (!novo) return false;

  const quando = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();

  // De quais estados vale a pena avançar para este.
  const anteriores: Record<typeof novo, ('pendente' | 'enviando' | 'enviada' | 'entregue')[]> = {
    enviada: ['pendente', 'enviando'],
    entregue: ['pendente', 'enviando', 'enviada'],
    lida: ['pendente', 'enviando', 'enviada', 'entregue'],
    falhou: ['pendente', 'enviando', 'enviada', 'entregue'],
  };

  const campos: Record<string, unknown> = { status: novo };
  if (novo === 'enviada') campos.sentAt = quando;
  if (novo === 'entregue') campos.deliveredAt = quando;
  if (novo === 'lida') campos.readAt = quando;
  if (novo === 'falhou') {
    campos.failedAt = quando;
    const erro = status.errors?.[0];
    campos.failureReason =
      erro?.error_data?.details ?? erro?.title ?? erro?.message ?? 'O WhatsApp não entregou.';
  }

  const atualizadas = await withTenant(tenantId, (tx) =>
    tx
      .update(messages)
      .set(campos)
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.externalId, wamid),
          inArray(messages.status, anteriores[novo]),
        ),
      )
      .returning({ id: messages.id }),
  );

  return atualizadas.length > 0;
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
