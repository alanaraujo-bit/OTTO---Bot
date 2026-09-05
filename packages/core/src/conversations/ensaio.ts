import {
  and,
  auditLog,
  contacts,
  conversations,
  eq,
  getPlatformDb,
  withTenant,
} from '@otto/db';
import { childLogger } from '@otto/shared';

import { publicarEvento } from '../events/barramento.ts';

/**
 * Marcar atendimento como ensaio.
 *
 * O produto precisa de uma resposta estrutural para "isto é teste ou é
 * cliente?". Antes, a única pista era o nome do contato conter "Ensaio" — o que
 * depende de quem digitou, quebra em qualquer variação e não sobrevive a um
 * cliente de verdade com esse nome.
 *
 * A consequência de não ter isso foi medida: a Análise de produção mostrava
 * "9 conversas, 9 passaram para humano, 0 resolvidas pela Bia" descrevendo, na
 * verdade, ensaios nossos e do próprio dono.
 *
 * O ensaio **não é apagado**. Ele continua na Inbox e no Backoffice, com o
 * histórico inteiro, porque é por ele que se diagnostica o que aconteceu — foi
 * uma conversa de ensaio que provou o envio pelo WhatsApp funcionando de ponta
 * a ponta. O que muda é que ele para de ser contado como negócio.
 */

/**
 * Marca ou desmarca uma conversa como ensaio.
 *
 * Reversível de propósito: marcar errado é fácil, e um caminho só de ida faria
 * o operador hesitar justamente quando marcar é a coisa certa a fazer.
 */
export async function marcarConversaComoEnsaio(
  tenantId: string,
  conversationId: string,
  ensaio: boolean,
  autor: { id: string; nome: string },
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(conversations)
      .set({
        isTest: ensaio,
        // Zerados ao desmarcar: guardar quem marcou uma conversa que não é mais
        // ensaio só produziria confusão na próxima leitura.
        testMarkedAt: ensaio ? new Date() : null,
        testMarkedBy: ensaio ? autor.id : null,
      })
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, conversationId)));
  });

  // A auditoria é o ponto: um número que some do painel precisa ter uma pessoa
  // atrás da decisão, senão "as métricas mudaram" vira mistério na semana
  // seguinte. Mesmo caminho e mesmo formato das ações de plataforma.
  await getPlatformDb()
    .insert(auditLog)
    .values({
      targetTenantId: tenantId,
      actorType: 'usuario',
      actorUserId: autor.id,
      actorLabel: autor.nome,
      action: ensaio ? 'conversa.marcada_ensaio' : 'conversa.desmarcada_ensaio',
      targetType: 'conversation',
      targetId: conversationId,
      metadata: { ensaio },
    });

  // A Inbox precisa refletir sozinha: o rótulo muda em toda aba aberta.
  await publicarEvento(tenantId, { tipo: 'conversa', conversationId });

  childLogger({ tenantId, conversationId, userId: autor.id }).info(
    { ensaio },
    ensaio ? 'conversa marcada como ensaio' : 'conversa deixou de ser ensaio',
  );
}

/**
 * Marca um contato como de ensaio, e opcionalmente o histórico dele.
 *
 * O contato sozinho só afeta conversas **futuras** — é padrão herdado, não
 * verdade retroativa. `incluirHistorico` existe porque o caso comum é
 * reconhecer depois do fato: o número que a gente vinha usando para testar
 * acumulou conversas que já contaminaram o painel.
 */
export async function marcarContatoComoEnsaio(
  tenantId: string,
  contactId: string,
  ensaio: boolean,
  autor: { id: string; nome: string },
  incluirHistorico = false,
): Promise<{ conversasAfetadas: number }> {
  const afetadas = await withTenant(tenantId, async (tx) => {
    await tx
      .update(contacts)
      .set({ isTest: ensaio })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    if (!incluirHistorico) return 0;

    const linhas = await tx
      .update(conversations)
      .set({
        isTest: ensaio,
        testMarkedAt: ensaio ? new Date() : null,
        testMarkedBy: ensaio ? autor.id : null,
      })
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.contactId, contactId)))
      .returning({ id: conversations.id });

    return linhas.length;
  });

  await getPlatformDb()
    .insert(auditLog)
    .values({
      targetTenantId: tenantId,
      actorType: 'usuario',
      actorUserId: autor.id,
      actorLabel: autor.nome,
      action: ensaio ? 'contato.marcado_ensaio' : 'contato.desmarcado_ensaio',
      targetType: 'contact',
      targetId: contactId,
      metadata: { ensaio, incluirHistorico, conversasAfetadas: afetadas },
    });

  await publicarEvento(tenantId, { tipo: 'conversa' });

  return { conversasAfetadas: afetadas };
}
