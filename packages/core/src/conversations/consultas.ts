import {
  and,
  asc,
  channels,
  contacts,
  conversations,
  desc,
  eq,
  messages,
  or,
  sql,
  users,
  withTenant,
} from '@otto/db';

/**
 * Consultas da Inbox.
 *
 * Ficam aqui, e não na camada web, por um motivo prático: a lista de conversas é
 * a tela mais acessada do produto e a que mais cresce. Manter a consulta perto do
 * domínio deixa visível o que ela custa, e permite testá-la sem subir a
 * aplicação.
 */

export type FiltroStatus = 'todas' | 'aguardando_humano' | 'abertas' | 'resolvidas';

export interface ItemInbox {
  id: string;
  contatoNome: string | null;
  contatoId: string;
  canal: string;
  canalNome: string;
  status: string;
  modo: string;
  prioridade: number;
  naoLidas: number;
  ultimaMensagemEm: Date | null;
  /** Prévia da última mensagem, para a lista. */
  previa: string | null;
  /** Se a última mensagem foi do cliente — muda o que a lista destaca. */
  ultimaDoCliente: boolean;
  atribuidaA: string | null;
}

export interface FiltrosInbox {
  status?: FiltroStatus;
  /** Busca por nome do contato ou conteúdo. */
  busca?: string;
  atribuidaA?: string;
  limite?: number;
}

export async function listarConversas(
  tenantId: string,
  filtros: FiltrosInbox = {},
): Promise<ItemInbox[]> {
  const { status = 'todas', busca, atribuidaA, limite = 50 } = filtros;

  return withTenant(tenantId, async (tx) => {
    const condicoes = [];

    if (status === 'aguardando_humano') {
      condicoes.push(eq(conversations.status, 'aguardando_humano'));
    } else if (status === 'abertas') {
      condicoes.push(
        sql`${conversations.status} in ('aberta','aguardando_cliente','aguardando_humano')`,
      );
    } else if (status === 'resolvidas') {
      condicoes.push(sql`${conversations.status} in ('resolvida','encerrada')`);
    }

    if (atribuidaA) condicoes.push(eq(conversations.assignedUserId, atribuidaA));

    if (busca?.trim()) {
      const termo = `%${busca.trim()}%`;
      condicoes.push(
        or(
          sql`${contacts.displayName} ilike ${termo}`,
          sql`${contacts.phone} ilike ${termo}`,
        )!,
      );
    }

    // A prévia sai de uma subconsulta lateral: trazer todas as mensagens para
    // pegar a última seria linear no tamanho do histórico.
    const linhas = await tx
      .select({
        id: conversations.id,
        contatoNome: contacts.displayName,
        contatoId: contacts.id,
        canal: channels.kind,
        canalNome: channels.name,
        status: conversations.status,
        modo: conversations.mode,
        prioridade: conversations.priority,
        naoLidas: conversations.unreadCount,
        ultimaMensagemEm: conversations.lastMessageAt,
        atribuidaA: users.name,
        previa: sql<string | null>`(
          select m.body from messages m
          where m.conversation_id = ${conversations.id}
          order by m.created_at desc limit 1
        )`,
        ultimaDoCliente: sql<boolean>`(
          select m.author = 'cliente' from messages m
          where m.conversation_id = ${conversations.id}
          order by m.created_at desc limit 1
        )`,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .innerJoin(channels, eq(channels.id, conversations.channelId))
      .leftJoin(users, eq(users.id, conversations.assignedUserId))
      .where(condicoes.length ? and(...condicoes) : undefined)
      // Prioridade primeiro, depois recência: o que espera gente aparece no topo.
      .orderBy(desc(conversations.priority), desc(conversations.lastMessageAt))
      .limit(limite);

    return linhas.map((l) => ({
      ...l,
      previa: l.previa,
      ultimaDoCliente: Boolean(l.ultimaDoCliente),
    }));
  });
}

export interface MensagemDaConversa {
  id: string;
  direcao: string;
  autor: string;
  autorNome: string | null;
  tipo: string;
  corpo: string | null;
  status: string;
  criadaEm: Date;
  falha: string | null;
}

export interface DetalheConversa {
  id: string;
  status: string;
  modo: string;
  prioridade: number;
  contato: { id: string; nome: string | null; telefone: string | null };
  canal: { tipo: string; nome: string };
  atribuidaA: { id: string; nome: string } | null;
  iaPausadaAte: Date | null;
  mensagens: MensagemDaConversa[];
}

export async function detalharConversa(
  tenantId: string,
  conversationId: string,
): Promise<DetalheConversa | null> {
  return withTenant(tenantId, async (tx) => {
    const [conversa] = await tx
      .select({
        id: conversations.id,
        status: conversations.status,
        modo: conversations.mode,
        prioridade: conversations.priority,
        iaPausadaAte: conversations.aiPausedUntil,
        contatoId: contacts.id,
        contatoNome: contacts.displayName,
        contatoTelefone: contacts.phone,
        canalTipo: channels.kind,
        canalNome: channels.name,
        atribuidaId: users.id,
        atribuidaNome: users.name,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .innerJoin(channels, eq(channels.id, conversations.channelId))
      .leftJoin(users, eq(users.id, conversations.assignedUserId))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversa) return null;

    const historico = await tx
      .select({
        id: messages.id,
        direcao: messages.direction,
        autor: messages.author,
        autorNome: users.name,
        tipo: messages.contentType,
        corpo: messages.body,
        status: messages.status,
        criadaEm: messages.createdAt,
        falha: messages.failureReason,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorUserId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(200);

    return {
      id: conversa.id,
      status: conversa.status,
      modo: conversa.modo,
      prioridade: conversa.prioridade,
      contato: {
        id: conversa.contatoId,
        nome: conversa.contatoNome,
        telefone: conversa.contatoTelefone,
      },
      canal: { tipo: conversa.canalTipo, nome: conversa.canalNome },
      atribuidaA:
        conversa.atribuidaId && conversa.atribuidaNome
          ? { id: conversa.atribuidaId, nome: conversa.atribuidaNome }
          : null,
      iaPausadaAte: conversa.iaPausadaAte,
      mensagens: historico,
    };
  });
}

/** Zera o contador de não lidas ao abrir a conversa. */
export async function marcarComoLida(tenantId: string, conversationId: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conversationId)),
  );
}
