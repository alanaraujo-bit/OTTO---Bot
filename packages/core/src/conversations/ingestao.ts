import {
  and,
  channels,
  contactIdentities,
  contacts,
  conversations,
  eq,
  messages,
  sql,
  withTenant,
} from '@otto/db';
import { childLogger, conflito } from '@otto/shared';

import { publicarEvento } from '../events/barramento.ts';
import { ehViolacaoDeUnicidade } from './conflito.ts';

/**
 * Ingestão de mensagem recebida.
 *
 * O caminho crítico do produto. A Meta reenvia webhooks, entrega fora de ordem e
 * duplica: sem idempotência real, o cliente recebe a mesma resposta duas vezes.
 *
 * A defesa não é uma verificação em código — é uma restrição no banco. O índice
 * único em `(tenant_id, external_id)` faz a segunda entrega do mesmo evento
 * falhar, e nós tratamos essa falha como sucesso silencioso. Verificar antes de
 * inserir perderia a corrida entre dois webhooks simultâneos.
 */

export interface MensagemRecebida {
  tenantId: string;
  channelId: string;
  /** Identificador da pessoa no provedor: `wa_id`, id do Instagram. */
  remetenteExterno: string;
  /** Nome do perfil, quando o provedor informa. */
  nomePerfil?: string | null;
  telefone?: string | null;
  /** Id da mensagem no provedor. É o que deduplica. */
  mensagemExterna: string;
  texto: string | null;
  tipo?: 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'localizacao' | 'contato' | 'figurinha' | 'nao_suportado';
  anexos?: unknown[];
  /** Quando o provedor diz que a mensagem foi enviada. */
  enviadaEm?: Date;
}

export interface ResultadoIngestao {
  /** `false` quando a mensagem já existia — entrega repetida. */
  nova: boolean;
  conversationId: string;
  contactId: string;
  messageId: string;
  /** Primeira mensagem de uma conversa nova. Muda o comportamento do agente. */
  conversaNova: boolean;
}

export async function receberMensagem(entrada: MensagemRecebida): Promise<ResultadoIngestao> {
  const log = childLogger({ tenantId: entrada.tenantId, channelId: entrada.channelId });

  return withTenant(entrada.tenantId, async (tx) => {
    // ── Já recebemos esta mensagem? ─────────────────────────────────────────
    const [existente] = await tx
      .select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, entrada.tenantId),
          eq(messages.externalId, entrada.mensagemExterna),
        ),
      )
      .limit(1);

    if (existente) {
      log.debug({ externalId: entrada.mensagemExterna }, 'mensagem repetida, ignorada');
      const [conversa] = await tx
        .select({ contactId: conversations.contactId })
        .from(conversations)
        .where(eq(conversations.id, existente.conversationId))
        .limit(1);

      return {
        nova: false,
        conversationId: existente.conversationId,
        contactId: conversa?.contactId ?? '',
        messageId: existente.id,
        conversaNova: false,
      };
    }

    const [canal] = await tx
      .select({ kind: channels.kind })
      .from(channels)
      .where(eq(channels.id, entrada.channelId))
      .limit(1);

    if (!canal) throw conflito('Canal não encontrado para esta empresa.');

    // ── Contato ─────────────────────────────────────────────────────────────
    const contactId = await resolverContato(tx, entrada, canal.kind);

    // ── Conversa ────────────────────────────────────────────────────────────
    const { conversationId, conversaNova } = await resolverConversa(tx, entrada, contactId);

    // ── Mensagem ────────────────────────────────────────────────────────────
    const agora = entrada.enviadaEm ?? new Date();

    // A verificação acima resolve a entrega repetida no caso comum. Esta captura
    // resolve a corrida: dois webhooks do mesmo evento chegando ao mesmo tempo,
    // ambos passando pela verificação antes de qualquer um inserir. Sem isto, o
    // cliente receberia a mesma resposta duas vezes.
    let mensagemId: string;
    try {
      const [criada] = await tx
        .insert(messages)
        .values({
          tenantId: entrada.tenantId,
          conversationId,
          direction: 'entrada',
          author: 'cliente',
          contentType: entrada.tipo ?? 'texto',
          body: entrada.texto,
          attachments: entrada.anexos ?? [],
          status: 'entregue',
          externalId: entrada.mensagemExterna,
          deliveredAt: agora,
        })
        .returning({ id: messages.id });

      mensagemId = criada!.id;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro, 'messages_external_key')) throw erro;

      log.debug('corrida entre webhooks; a outra inserção venceu');
      return {
        nova: false,
        conversationId,
        contactId,
        messageId: '',
        conversaNova: false,
      };
    }

    await tx
      .update(conversations)
      .set({
        lastMessageAt: agora,
        lastInboundAt: agora,
        unreadCount: sql`${conversations.unreadCount} + 1`,
        // Cliente que volta a escrever reabre a conversa: continuar o fio é
        // melhor do que abrir outra e perder o contexto.
        status: sql`case when ${conversations.status} in ('resolvida','encerrada')
                    then 'aberta'::conversation_status else ${conversations.status} end`,
        firstInboundAt: sql`coalesce(${conversations.firstInboundAt}, ${agora})`,
      })
      .where(eq(conversations.id, conversationId));

    await tx
      .update(contacts)
      .set({ lastInteractionAt: agora })
      .where(eq(contacts.id, contactId));

    log.info({ conversationId, messageId: mensagemId, conversaNova }, 'mensagem recebida');

    // Avisa a Inbox aberta. Fora da transação seria mais correto em teoria —
    // publicar algo que ainda pode dar rollback é um risco —, mas o conteúdo do
    // aviso é só "olhe de novo": um falso aviso custa uma releitura, e a
    // releitura veria o estado certo de qualquer forma.
    await publicarEvento(entrada.tenantId, { tipo: 'mensagem', conversationId });

    return { nova: true, conversationId, contactId, messageId: mensagemId, conversaNova };
  });
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Encontra ou cria o contato.
 *
 * A identidade por canal é a chave: a mesma pessoa pode falar pelo WhatsApp hoje
 * e pelo Direct amanhã, e as duas conversas pertencem ao mesmo cadastro.
 */
async function resolverContato(
  tx: Tx,
  entrada: MensagemRecebida,
  tipoCanal: 'whatsapp' | 'instagram' | 'simulador',
): Promise<string> {
  const [identidade] = await tx
    .select({ contactId: contactIdentities.contactId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.tenantId, entrada.tenantId),
        eq(contactIdentities.kind, tipoCanal),
        eq(contactIdentities.externalId, entrada.remetenteExterno),
      ),
    )
    .limit(1);

  if (identidade) {
    if (entrada.nomePerfil) {
      await tx
        .update(contactIdentities)
        .set({ profileName: entrada.nomePerfil })
        .where(
          and(
            eq(contactIdentities.tenantId, entrada.tenantId),
            eq(contactIdentities.kind, tipoCanal),
            eq(contactIdentities.externalId, entrada.remetenteExterno),
          ),
        );

      // Nome corrigido por um operador não é sobrescrito pelo perfil do canal.
      await tx
        .update(contacts)
        .set({ displayName: entrada.nomePerfil })
        .where(and(eq(contacts.id, identidade.contactId), eq(contacts.nameSource, 'canal')));
    }
    return identidade.contactId;
  }

  const [novo] = await tx
    .insert(contacts)
    .values({
      tenantId: entrada.tenantId,
      displayName: entrada.nomePerfil ?? null,
      phone: entrada.telefone ?? null,
      nameSource: 'canal',
      lastInteractionAt: new Date(),
    })
    .returning({ id: contacts.id });

  const contactId = novo!.id;

  await tx
    .insert(contactIdentities)
    .values({
      tenantId: entrada.tenantId,
      contactId,
      kind: tipoCanal,
      externalId: entrada.remetenteExterno,
      profileName: entrada.nomePerfil ?? null,
    })
    .onConflictDoNothing({
      target: [contactIdentities.tenantId, contactIdentities.kind, contactIdentities.externalId],
    });

  return contactId;
}

/**
 * Encontra a conversa aberta ou abre uma.
 *
 * O índice único parcial de `conversations` garante uma conversa aberta por
 * contato e canal, então duas mensagens simultâneas do mesmo cliente continuam o
 * mesmo fio em vez de abrir dois.
 */
async function resolverConversa(
  tx: Tx,
  entrada: MensagemRecebida,
  contactId: string,
): Promise<{ conversationId: string; conversaNova: boolean }> {
  const [aberta] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contactId),
        eq(conversations.channelId, entrada.channelId),
        sql`${conversations.status} in ('aberta','aguardando_cliente','aguardando_humano')`,
      ),
    )
    .limit(1);

  if (aberta) return { conversationId: aberta.id, conversaNova: false };

  const [nova] = await tx
    .insert(conversations)
    .values({
      tenantId: entrada.tenantId,
      contactId,
      channelId: entrada.channelId,
      status: 'aberta',
      mode: 'automatico',
    })
    .onConflictDoNothing()
    .returning({ id: conversations.id });

  if (nova) {
    await tx
      .update(contacts)
      .set({ conversationCount: sql`${contacts.conversationCount} + 1` })
      .where(eq(contacts.id, contactId));

    return { conversationId: nova.id, conversaNova: true };
  }

  // Outra inserção venceu a corrida; usa a conversa dela.
  const [existente] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contactId),
        eq(conversations.channelId, entrada.channelId),
        sql`${conversations.status} in ('aberta','aguardando_cliente','aguardando_humano')`,
      ),
    )
    .limit(1);

  return { conversationId: existente!.id, conversaNova: false };
}
