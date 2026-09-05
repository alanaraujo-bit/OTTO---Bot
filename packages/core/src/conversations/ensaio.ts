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
 * Reclassificação retroativa do histórico de um contato.
 *
 * **Ferramenta de correção administrativa, não comportamento do domínio.**
 *
 * A regra normal é que marcar um contato afete apenas conversas futuras: o
 * marcador é herdado na criação e congelado ali. Reescrever o passado é outra
 * coisa, e precisa parecer outra coisa — daí ser um tipo próprio e obrigatório,
 * em vez de um booleano opcional que alguém passa sem pensar.
 *
 * Nada pode acioná-la implicitamente: nem a ingestão, nem a edição comum do
 * contato, nem automação nenhuma. Só uma pessoa decidindo corrigir uma
 * classificação errada, e dizendo por quê.
 */
export interface ReclassificacaoDoHistorico {
  /** Confirmação explícita. Existe para não ser possível fazer isso por engano. */
  confirmado: true;
  /** Por que o histórico está sendo reclassificado. Vai para a auditoria. */
  motivo: string;
}

/**
 * Marca um contato como de ensaio.
 *
 * Sem `reclassificarHistorico`, afeta **somente conversas futuras** — que é o
 * comportamento normal e o que acontece em toda edição comum.
 */
export async function marcarContatoComoEnsaio(
  tenantId: string,
  contactId: string,
  ensaio: boolean,
  autor: { id: string; nome: string },
  reclassificarHistorico?: ReclassificacaoDoHistorico,
): Promise<{ conversasAfetadas: string[] }> {
  if (reclassificarHistorico && !reclassificarHistorico.motivo.trim()) {
    throw new Error('Informe o motivo da reclassificação do histórico.');
  }

  const marcadoEm = new Date();

  const afetadas = await withTenant(tenantId, async (tx) => {
    await tx
      .update(contacts)
      .set({ isTest: ensaio })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    if (!reclassificarHistorico) return [];

    // `where` inclui o estado anterior: só voltam as conversas que de fato
    // mudaram, e não todas as do contato. Sem isso, a auditoria registraria
    // como "reclassificadas" conversas que já estavam no estado pedido.
    const linhas = await tx
      .update(conversations)
      .set({
        isTest: ensaio,
        testMarkedAt: ensaio ? marcadoEm : null,
        testMarkedBy: ensaio ? autor.id : null,
      })
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.contactId, contactId),
          eq(conversations.isTest, !ensaio),
        ),
      )
      .returning({ id: conversations.id });

    return linhas.map((l) => l.id);
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
      metadata: {
        ensaio,
        reclassificouHistorico: Boolean(reclassificarHistorico),
        motivo: reclassificarHistorico?.motivo.trim() ?? null,
        conversasAfetadas: afetadas.length,
        // Os ids, e não só a contagem: "quantas mudaram" não permite desfazer
        // nem auditar depois. Com a lista, dá para dizer exatamente o que saiu
        // das métricas naquele momento — e devolver, se a decisão foi errada.
        conversas: afetadas,
        em: marcadoEm.toISOString(),
      },
    });

  await publicarEvento(tenantId, { tipo: 'conversa' });

  return { conversasAfetadas: afetadas };
}
