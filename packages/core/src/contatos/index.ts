import {
  and,
  contactIdentities,
  contacts,
  conversations,
  desc,
  eq,
  or,
  sql,
  withTenant,
} from '@otto/db';

/**
 * Clientes.
 *
 * Um CRM operacional, não um CRM completo: o que serve ao atendimento, e nada
 * além. Consolidar canais, saber quando falou pela última vez, quantas vezes
 * voltou — e chegar rápido à conversa.
 */

export interface ClienteListado {
  id: string;
  nome: string | null;
  telefone: string | null;
  canais: string[];
  conversas: number;
  ultimaInteracao: Date | null;
  /** Última conversa, para o atalho na lista. */
  ultimaConversaId: string | null;
}

export async function listarClientes(
  tenantId: string,
  filtros: { busca?: string; limite?: number } = {},
): Promise<ClienteListado[]> {
  const { busca, limite = 100 } = filtros;

  return withTenant(tenantId, async (tx) => {
    const condicoes = [];
    if (busca?.trim()) {
      const termo = `%${busca.trim()}%`;
      condicoes.push(
        or(sql`${contacts.displayName} ilike ${termo}`, sql`${contacts.phone} ilike ${termo}`)!,
      );
    }

    const linhas = await tx
      .select({
        id: contacts.id,
        nome: contacts.displayName,
        telefone: contacts.phone,
        conversas: contacts.conversationCount,
        ultimaInteracao: contacts.lastInteractionAt,
        canais: sql<string[]>`(
          select coalesce(array_agg(distinct ci.kind::text), '{}')
          from contact_identities ci where ci.contact_id = ${contacts.id}
        )`,
        ultimaConversaId: sql<string | null>`(
          select c.id from conversations c
          where c.contact_id = ${contacts.id}
          order by c.last_message_at desc nulls last limit 1
        )`,
      })
      .from(contacts)
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(contacts.lastInteractionAt))
      .limit(limite);

    return linhas.map((l) => ({ ...l, canais: l.canais ?? [] }));
  });
}

export interface DetalheCliente extends ClienteListado {
  observacoes: string | null;
  primeiroContatoEm: Date;
  bloqueado: boolean;
  historico: {
    id: string;
    status: string;
    canal: string;
    iniciadaEm: Date;
    ultimaMensagemEm: Date | null;
    mensagens: number;
  }[];
}

export async function detalharCliente(
  tenantId: string,
  contatoId: string,
): Promise<DetalheCliente | null> {
  return withTenant(tenantId, async (tx) => {
    const [cliente] = await tx
      .select({
        id: contacts.id,
        nome: contacts.displayName,
        telefone: contacts.phone,
        conversas: contacts.conversationCount,
        ultimaInteracao: contacts.lastInteractionAt,
        observacoes: contacts.notes,
        primeiroContatoEm: contacts.firstSeenAt,
        bloqueado: contacts.isBlocked,
        canais: sql<string[]>`(
          select coalesce(array_agg(distinct ci.kind::text), '{}')
          from contact_identities ci where ci.contact_id = ${contacts.id}
        )`,
      })
      .from(contacts)
      .where(eq(contacts.id, contatoId))
      .limit(1);

    if (!cliente) return null;

    const historico = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        canal: sql<string>`(select ch.kind::text from channels ch where ch.id = ${conversations.channelId})`,
        iniciadaEm: conversations.createdAt,
        ultimaMensagemEm: conversations.lastMessageAt,
        mensagens: sql<number>`(
          select count(*)::int from messages m where m.conversation_id = ${conversations.id}
        )`,
      })
      .from(conversations)
      .where(eq(conversations.contactId, contatoId))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(50);

    return {
      ...cliente,
      canais: cliente.canais ?? [],
      ultimaConversaId: historico[0]?.id ?? null,
      historico,
    };
  });
}

/** Corrige o nome. Marca a origem para o perfil do canal não sobrescrever. */
export async function renomearCliente(
  tenantId: string,
  contatoId: string,
  nome: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(contacts)
      .set({ displayName: nome.trim() || null, nameSource: 'humano' })
      .where(eq(contacts.id, contatoId)),
  );
}

export async function anotarSobreCliente(
  tenantId: string,
  contatoId: string,
  observacoes: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(contacts)
      .set({ notes: observacoes.trim() || null })
      .where(eq(contacts.id, contatoId)),
  );
}
