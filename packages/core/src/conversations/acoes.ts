import {
  conversationEvents,
  conversations,
  eq,
  messages,
  sql,
  withTenant,
} from '@otto/db';
import { childLogger, conflito, horas, uuidv7 } from '@otto/shared';

import { publicarEvento } from '../events/barramento.ts';
import { ehViolacaoDeUnicidade } from './conflito.ts';

/**
 * Ações humanas sobre uma conversa.
 *
 * Toda ação aqui grava um evento na linha do tempo. Não é auditoria por
 * formalidade: é o que permite a quem assume depois entender o que já
 * aconteceu, sem ler o histórico inteiro.
 */

/**
 * Assumir o atendimento.
 *
 * Pausa a IA por 4 horas — tempo de uma jornada de trabalho. A pausa expira
 * sozinha de propósito: uma conversa esquecida volta a ser atendida em vez de
 * ficar muda, que é a pior falha possível para o cliente do outro lado.
 */
export async function assumirConversa(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  const log = childLogger({ tenantId, conversationId, userId });

  await withTenant(tenantId, async (tx) => {
    const [atual] = await tx
      .select({ atribuida: conversations.assignedUserId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (atual?.atribuida && atual.atribuida !== userId) {
      throw conflito(
        'Outra pessoa da equipe já assumiu esta conversa. Atualize a página para ver quem está atendendo.',
      );
    }

    await tx
      .update(conversations)
      .set({
        assignedUserId: userId,
        assignedAt: new Date(),
        mode: 'humano',
        aiPausedUntil: new Date(Date.now() + horas(4)),
        unreadCount: 0,
      })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationEvents).values({
      tenantId,
      conversationId,
      type: 'assumida',
      actorUserId: userId,
      data: {},
    });
  });

  await publicarEvento(tenantId, { tipo: 'conversa', conversationId });
  log.info('conversa assumida');
}

/**
 * Devolver para a IA.
 *
 * Limpa a pausa e a atribuição. O histórico permanece, então o agente tem o
 * contexto do que o humano disse — o cliente não precisa repetir nada.
 */
export async function devolverParaIA(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(conversations)
      .set({
        assignedUserId: null,
        assignedAt: null,
        mode: 'automatico',
        aiPausedUntil: null,
        status: 'aguardando_cliente',
      })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationEvents).values({
      tenantId,
      conversationId,
      type: 'devolvida_para_ia',
      actorUserId: userId,
      data: {},
    });
  });

  await publicarEvento(tenantId, { tipo: 'conversa', conversationId });
  childLogger({ tenantId, conversationId, userId }).info('conversa devolvida para a IA');
}

/**
 * Mensagem escrita por uma pessoa.
 *
 * A chave de idempotência vem do cliente (a interface gera uma por envio): sem
 * ela, um clique duplo ou uma reconexão no meio do envio mandaria a mesma
 * mensagem duas vezes para o consumidor.
 */
export async function responderComoOperador(
  tenantId: string,
  conversationId: string,
  userId: string,
  texto: string,
  chaveIdempotencia: string,
): Promise<{ mensagemId: string; duplicada: boolean }> {
  const corpo = texto.trim();
  if (!corpo) throw conflito('A mensagem está vazia.');

  const resultado = await withTenant(tenantId, async (tx) => {
    let mensagemId: string;

    try {
      const [criada] = await tx
        .insert(messages)
        .values({
          tenantId,
          conversationId,
          direction: 'saida',
          author: 'operador',
          authorUserId: userId,
          contentType: 'texto',
          body: corpo,
          status: 'pendente',
          idempotencyKey: chaveIdempotencia,
        })
        .returning({ id: messages.id });
      mensagemId = criada!.id;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro, 'messages_idempotency_key')) throw erro;

      const [existente] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.idempotencyKey, chaveIdempotencia))
        .limit(1);

      return { mensagemId: existente?.id ?? '', duplicada: true };
    }

    const agora = new Date();
    await tx
      .update(conversations)
      .set({
        lastMessageAt: agora,
        status: 'aguardando_cliente',
        firstResponseAt: sql`coalesce(${conversations.firstResponseAt}, ${agora})`,
        // Responder é assumir na prática. Sem isto, a IA voltaria a responder
        // por cima de quem já está conversando com o cliente.
        assignedUserId: sql`coalesce(${conversations.assignedUserId}, ${userId})`,
        aiPausedUntil: new Date(Date.now() + horas(4)),
      })
      .where(eq(conversations.id, conversationId));

    return { mensagemId, duplicada: false };
  });

  await publicarEvento(tenantId, { tipo: 'mensagem', conversationId });
  return resultado;
}

export async function alterarModo(
  tenantId: string,
  conversationId: string,
  modo: 'automatico' | 'copilot' | 'humano',
  userId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [antes] = await tx
      .select({ modo: conversations.mode })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    await tx
      .update(conversations)
      .set({
        mode: modo,
        // Voltar ao automático precisa liberar a IA, senão o modo muda e nada
        // acontece — o tipo de incoerência que faz o usuário perder a confiança.
        aiPausedUntil: modo === 'automatico' ? null : sql`${conversations.aiPausedUntil}`,
      })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationEvents).values({
      tenantId,
      conversationId,
      type: 'modo_alterado',
      actorUserId: userId,
      data: { de: antes?.modo ?? null, para: modo },
    });
  });

  await publicarEvento(tenantId, { tipo: 'conversa', conversationId });
}

export async function resolverConversa(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(conversations)
      .set({ status: 'resolvida', resolvedAt: new Date(), unreadCount: 0 })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationEvents).values({
      tenantId,
      conversationId,
      type: 'resolvida',
      actorUserId: userId,
      data: {},
    });
  });

  await publicarEvento(tenantId, { tipo: 'conversa', conversationId });
}

/** Chave de idempotência para um envio. Gerada pela interface, uma por mensagem. */
export const novaChaveDeEnvio = () => `op:${uuidv7()}`;
