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
  /** Prévia da última mensagem trocada — dá contexto à linha. */
  ultimaMensagem: string | null;
  /** Status da última conversa: mostra quem ainda espera. */
  ultimoStatus: string | null;
}

export async function listarClientes(
  tenantId: string,
  filtros: { busca?: string; limite?: number } = {},
): Promise<ClienteListado[]> {
  const { busca, limite = 100 } = filtros;

  const termo = busca?.trim() ? `%${busca.trim()}%` : null;

  return withTenant(tenantId, async (tx) => {
    // SQL direto: várias subconsultas correlatas no `select` do drizzle já
    // devolveram resultado errado (a referência à linha externa se perdia).
    const { rows } = await tx.execute<{
      id: string;
      nome: string | null;
      telefone: string | null;
      conversas: number;
      ultimaInteracao: string | null;
      canais: string[] | null;
      ultimaConversaId: string | null;
      ultimaMensagem: string | null;
      ultimoStatus: string | null;
    }>(sql`
      select
        ct.id as "id",
        ct.display_name as "nome",
        ct.phone as "telefone",
        ct.conversation_count as "conversas",
        ct.last_interaction_at as "ultimaInteracao",
        (select coalesce(array_agg(distinct ci.kind::text), '{}')
           from contact_identities ci where ci.contact_id = ct.id) as "canais",
        lc.id as "ultimaConversaId",
        lc.status::text as "ultimoStatus",
        (select m.body from messages m
           where m.conversation_id = lc.id order by m.created_at desc limit 1) as "ultimaMensagem"
      from contacts ct
      left join lateral (
        select c.id, c.status from conversations c
        where c.contact_id = ct.id
        order by c.last_message_at desc nulls last limit 1
      ) lc on true
      where ${termo ? sql`(ct.display_name ilike ${termo} or ct.phone ilike ${termo})` : sql`true`}
      order by ct.last_interaction_at desc nulls last
      limit ${limite}
    `);

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      conversas: Number(r.conversas ?? 0),
      ultimaInteracao: r.ultimaInteracao ? new Date(r.ultimaInteracao) : null,
      canais: r.canais ?? [],
      ultimaConversaId: r.ultimaConversaId,
      ultimaMensagem: r.ultimaMensagem,
      ultimoStatus: r.ultimoStatus,
    }));
  });
}

export interface DetalheCliente
  extends Omit<ClienteListado, 'ultimaMensagem' | 'ultimoStatus'> {
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

    // SQL direto: a contagem de mensagens é uma agregação por conversa, e
    // escrevê-la como subconsulta correlata no `select` do drizzle já rendeu
    // resultado errado (a referência à conversa externa se perdia).
    const { rows: historico } = await tx.execute<{
      id: string;
      status: string;
      canal: string;
      iniciadaEm: string;
      ultimaMensagemEm: string | null;
      mensagens: number;
    }>(sql`
      select
        c.id as "id",
        c.status::text as "status",
        ch.kind::text as "canal",
        c.created_at as "iniciadaEm",
        c.last_message_at as "ultimaMensagemEm",
        (select count(*)::int from messages m where m.conversation_id = c.id) as "mensagens"
      from conversations c
      join channels ch on ch.id = c.channel_id
      where c.contact_id = ${contatoId}
      order by c.last_message_at desc nulls last
      limit 50
    `);

    return {
      ...cliente,
      canais: cliente.canais ?? [],
      ultimaConversaId: historico[0]?.id ?? null,
      // `tx.execute` devolve timestamp como texto; a camada de cima espera `Date`.
      historico: historico.map((h) => ({
        ...h,
        mensagens: Number(h.mensagens),
        iniciadaEm: new Date(h.iniciadaEm),
        ultimaMensagemEm: h.ultimaMensagemEm ? new Date(h.ultimaMensagemEm) : null,
      })),
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
