import {
  and,
  asc,
  channels,
  contacts,
  conversations,
  desc,
  eq,
  inArray,
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

export type FiltroStatus =
  | 'todas'
  | 'aguardando_humano'
  | 'abertas'
  | 'resolvidas'
  /**
   * Só os ensaios.
   *
   * A Inbox é o lugar certo para vê-los: eles saíram das métricas, não do
   * produto. Um ensaio continua sendo a melhor forma de diagnosticar o que
   * aconteceu — foi um deles que provou o envio pelo WhatsApp de ponta a ponta.
   */
  | 'ensaio';

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
  /** Conversa de ensaio. A lista rotula, para ninguém confundir com cliente. */
  ehEnsaio: boolean;
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
    } else if (status === 'ensaio') {
      condicoes.push(eq(conversations.isTest, true));
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
        ehEnsaio: conversations.isTest,
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
  /**
   * O trecho citado, quando esta mensagem responde outra.
   *
   * Resolvido no servidor. A alternativa seria mandar só o identificador e
   * deixar a interface procurar a original entre as mensagens que ela tem —
   * que funciona até a citada ser mais antiga que a janela carregada, e aí a
   * citação some sem explicação bem na conversa longa, que é justamente onde
   * responder uma mensagem específica mais importa.
   */
  respondendoA: MensagemCitada | null;
}

/** Uma mensagem como ela aparece citada dentro de outra. */
export interface MensagemCitada {
  id: string;
  autor: string;
  autorNome: string | null;
  corpo: string | null;
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
        respondendoAId: messages.replyToMessageId,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorUserId))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(200);

    // ── Citações ──────────────────────────────────────────────────────────
    // Quase toda citada já está no histórico carregado; só as que ficaram fora
    // da janela de 200 custam uma consulta, e ela é uma só para todas.
    const citadas = new Map<string, MensagemCitada>(
      historico.map((m) => [m.id, { id: m.id, autor: m.autor, autorNome: m.autorNome, corpo: m.corpo }]),
    );

    const faltando = [
      ...new Set(
        historico
          .map((m) => m.respondendoAId)
          .filter((id): id is string => Boolean(id) && !citadas.has(id!)),
      ),
    ];

    if (faltando.length) {
      const antigas = await tx
        .select({
          id: messages.id,
          autor: messages.author,
          autorNome: users.name,
          corpo: messages.body,
        })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.authorUserId))
        .where(inArray(messages.id, faltando));

      for (const m of antigas) citadas.set(m.id, m);
    }

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
      mensagens: historico.map(({ respondendoAId, ...m }) => ({
        ...m,
        // Nulo aqui pode significar duas coisas — não cita nada, ou cita algo
        // que já não existe. As duas se resolvem igual na tela: sem citação.
        respondendoA: respondendoAId ? (citadas.get(respondendoAId) ?? null) : null,
      })),
    };
  });
}

/** Zera o contador de não lidas ao abrir a conversa. */
export async function marcarComoLida(tenantId: string, conversationId: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, conversationId)),
  );
}

export interface ContagemInbox {
  abertas: number;
  aguardando_humano: number;
  resolvidas: number;
  todas: number;
  /** Conversas de ensaio. Fora das metricas, dentro da Inbox. */
  ensaio: number;
  /** Mensagens ainda não lidas pela equipe, somadas. */
  naoLidas: number;
}

/**
 * Quantas conversas há em cada filtro.
 *
 * Uma consulta só, para a lista poder mostrar o tamanho da fila em cada aba sem
 * quatro viagens ao banco. "Esperando 11" é a informação que faz o dono abrir a
 * Inbox — o número precisa estar na aba, não escondido lá dentro.
 */
export async function contarConversas(tenantId: string): Promise<ContagemInbox> {
  return withTenant(tenantId, async (tx) => {
    const [c] = await tx
      .select({
        abertas: sql<number>`count(*) filter (where ${conversations.status} in ('aberta','aguardando_cliente','aguardando_humano'))::int`,
        aguardando_humano: sql<number>`count(*) filter (where ${conversations.status} = 'aguardando_humano')::int`,
        resolvidas: sql<number>`count(*) filter (where ${conversations.status} in ('resolvida','encerrada'))::int`,
        todas: sql<number>`count(*)::int`,
        ensaio: sql<number>`count(*) filter (where ${conversations.isTest})::int`,
        naoLidas: sql<number>`coalesce(sum(${conversations.unreadCount}), 0)::int`,
      })
      .from(conversations);

    return {
      abertas: c?.abertas ?? 0,
      aguardando_humano: c?.aguardando_humano ?? 0,
      resolvidas: c?.resolvidas ?? 0,
      todas: c?.todas ?? 0,
      ensaio: c?.ensaio ?? 0,
      naoLidas: c?.naoLidas ?? 0,
    };
  });
}
