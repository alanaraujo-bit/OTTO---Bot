import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  channels,
  closeDb,
  conversations,
  eq,
  getPlatformDb,
  knowledgeItems,
  messages,
  tenants,
  withTenant,
} from '@otto/db';

import { indexarItem } from '../knowledge/indexacao.ts';
import { definirProvedor } from '../ai/roteador.ts';
import { ProvedorSimulado } from '../ai/provedores/simulado.ts';
import { atenderAutomaticamente } from './atendimento.ts';
import { receberMensagem } from './ingestao.ts';
import { assumirConversa, devolverParaIA, responderComoOperador } from './acoes.ts';

/**
 * O ciclo IA → humano → IA, repetido.
 *
 * Este teste existe por causa de uma falha real relatada em produção: depois de
 * um handoff e da devolução para a IA, o agente não voltava a responder. O
 * caminho tem quatro chaves independentes — `mode`, `assignedUserId`,
 * `aiPausedUntil` e `status` — e basta uma ficar presa para a conversa morrer
 * em silêncio.
 *
 * Por isso os testes afirmam sobre o **efeito observável** (o cliente recebeu
 * resposta?) e não sobre as colunas: é o efeito que o cliente sente, e é onde a
 * regressão dói.
 */

const sufixo = Date.now().toString(36);
const slug = `ciclo-${sufixo}`;

let tenantId: string;
let channelId: string;
let contactId: string;
let operadorId: string;
let sequencia = 0;

/** Um contato por teste. Conversas separadas, estados separados. */
const TEL = {
  fundamento: '5594990001001',
  semFundamento: '5594990001002',
  ciclo: '5594990001003',
  durante: '5594990001004',
  esperando: '5594990001005',
};

/**
 * Manda uma mensagem do cliente e deixa o agente decidir.
 *
 * O telefone é por teste, não global: com um contato só, todos os testes
 * cairiam na mesma conversa e um herdaria o estado do outro — que é exatamente
 * o tipo de contaminação que faz um teste de máquina de estados passar por
 * engano.
 */
async function clienteEscreve(telefone: string, texto: string) {
  const recebida = await receberMensagem({
    tenantId,
    channelId,
    remetenteExterno: telefone,
    nomePerfil: `Cliente ${telefone.slice(-4)}`,
    telefone,
    mensagemExterna: `wamid.ciclo-${sufixo}-${++sequencia}`,
    texto,
  });

  const atendimento = await atenderAutomaticamente(
    tenantId,
    recebida.conversationId,
    recebida.messageId,
    texto,
  );

  return { ...recebida, atendimento };
}

/** Mensagens de saída da conversa, na ordem. */
async function saidas(conversationId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select({ corpo: messages.body, autor: messages.author, status: messages.status })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt),
  ).then((linhas) => linhas.filter((l) => l.autor !== 'cliente'));
}

async function estado(conversationId: string) {
  const [c] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        modo: conversations.mode,
        status: conversations.status,
        atribuida: conversations.assignedUserId,
        pausadaAte: conversations.aiPausedUntil,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId)),
  );
  return c!;
}

beforeAll(async () => {
  definirProvedor(new ProvedorSimulado());
  const admin = getPlatformDb();

  const [empresa] = await admin
    .insert(tenants)
    .values({ slug, displayName: 'Empresa do Ciclo', status: 'ativo', timezone: 'America/Belem' })
    .returning({ id: tenants.id });
  tenantId = empresa!.id;

  const [canal] = await admin
    .insert(channels)
    .values({
      tenantId,
      kind: 'simulador',
      name: 'Canal do ciclo',
      status: 'conectado',
      externalId: `sim-ciclo-${sufixo}`,
    })
    .returning({ id: channels.id });
  channelId = canal!.id;

  const { users, memberships } = await import('@otto/db');
  const [operador] = await admin
    .insert(users)
    .values({
      email: `operador-${sufixo}@exemplo.test`,
      name: 'Operadora do Ciclo',
      passwordHash: 'x'.repeat(60),
      isActive: true,
    })
    .returning({ id: users.id });
  operadorId = operador!.id;

  await admin
    .insert(memberships)
    .values({ tenantId, userId: operadorId, role: 'proprietario', isActive: true });

  const [item] = await admin
    .insert(knowledgeItems)
    .values({
      tenantId,
      kind: 'pergunta_frequente',
      status: 'publicado',
      title: 'Horário de funcionamento',
      body: 'Abrimos de segunda a sábado das 8h às 20h. Aos domingos, das 8h às 14h.',
      aliases: ['que horas abre', 'horário', 'abre domingo'],
      publishedAt: new Date(),
    })
    .returning({ id: knowledgeItems.id });

  await indexarItem(tenantId, item!.id);
}, 90_000);

afterAll(async () => {
  const admin = getPlatformDb();
  await admin.delete(tenants).where(eq(tenants.slug, slug));
  const { users } = await import('@otto/db');
  await admin.delete(users).where(eq(users.id, operadorId));
  definirProvedor(null);
  await closeDb();
});

beforeEach(() => {
  // Cada teste conversa com um contato novo, para que um ciclo não herde o
  // estado do anterior.
  sequencia += 1000;
});

describe('o cliente nunca fica sem retorno', () => {
  it('responde quando há fundamento', async () => {
    const { conversationId } = await clienteEscreve(TEL.fundamento, 'Que horas vocês abrem no domingo?');

    const enviadas = await saidas(conversationId);
    expect(enviadas.length).toBeGreaterThan(0);
    expect(enviadas.at(-1)!.corpo).toMatch(/domingo|14h|8h/i);
  }, 60_000);

  it('avisa o cliente quando NÃO há fundamento, em vez de ficar mudo', async () => {
    // A falha relatada: sem fundamento, o agente encaminhava para humano e não
    // mandava nada. Do lado do cliente, isso é silêncio — ele pergunta e não
    // recebe nem um aviso de que alguém foi chamado.
    const { conversationId, atendimento } = await clienteEscreve(
      TEL.semFundamento,
      'Vocês parcelam em quantas vezes no cartão consignado?',
    );

    expect(atendimento.handoff).toBe('sem_conhecimento');

    const enviadas = await saidas(conversationId);
    expect(enviadas.length).toBeGreaterThan(0);
    expect(enviadas.at(-1)!.corpo ?? '').toMatch(/não tenho|nao tenho|confirmad|equipe|alguém/i);
  }, 60_000);
});

describe('esperando humano, mas ninguém assumiu', () => {
  it('a IA continua respondendo o que sabe enquanto ninguém assume', async () => {
    // Depois de um handoff, a conversa fica "aguardando_humano". Se ninguém
    // assumiu, o modo ainda é IA — e uma pergunta que a base responde deve ser
    // respondida. Pausar a IA por tempo aqui transforma um handoff em mudez
    // prolongada: o cliente pergunta outra coisa, que a base cobre, e não
    // recebe nada.
    const { conversationId } = await clienteEscreve(
      TEL.esperando,
      'Vocês têm plano de saúde empresarial?',
    );
    expect((await estado(conversationId)).status).toBe('aguardando_humano');
    expect((await estado(conversationId)).atribuida).toBeNull();

    const antes = (await saidas(conversationId)).length;
    const seguinte = await clienteEscreve(TEL.esperando, 'Que horas vocês abrem no domingo?');

    expect(seguinte.atendimento.respondeu).toBe(true);
    expect((await saidas(conversationId)).length).toBeGreaterThan(antes);
  }, 120_000);
});

describe('ciclo IA → humano → IA', () => {
  it('completa o ciclo duas vezes seguidas sem travar', async () => {
    // ── Volta 1 ───────────────────────────────────────────────────────────────
    const primeira = await clienteEscreve(TEL.ciclo, 'Que horas vocês abrem no domingo?');
    const conversationId = primeira.conversationId;
    expect((await saidas(conversationId)).length).toBeGreaterThan(0);

    // Pergunta sem fundamento: encaminha para humano.
    await clienteEscreve(TEL.ciclo, 'Vocês têm consórcio de imóvel?');
    expect((await estado(conversationId)).status).toBe('aguardando_humano');

    // Uma pessoa assume e responde.
    await assumirConversa(tenantId, conversationId, operadorId);
    await responderComoOperador(
      tenantId,
      conversationId,
      operadorId,
      'Oi! Não trabalhamos com consórcio, mas posso ajudar com o resto.',
      `op-${sufixo}-1`,
    );

    // Mensagem do cliente **durante** o atendimento humano: não pode sumir, e
    // não pode fazer a IA falar por cima de quem está atendendo.
    const durante = await clienteEscreve(TEL.ciclo, 'Ah, entendi. E vocês abrem no feriado?');
    expect(durante.nova).toBe(true);
    expect(durante.atendimento.respondeu).toBe(false);

    // Devolve para a IA.
    await devolverParaIA(tenantId, conversationId, operadorId);
    const devolvida = await estado(conversationId);
    expect(devolvida.modo).toBe('automatico');
    expect(devolvida.atribuida).toBeNull();
    expect(devolvida.pausadaAte).toBeNull();

    // ── O ponto da falha: a IA volta a responder? ────────────────────────────
    const antes = (await saidas(conversationId)).length;
    const volta1 = await clienteEscreve(TEL.ciclo, 'Que horas vocês abrem no domingo?');
    expect(volta1.atendimento.respondeu).toBe(true);
    expect((await saidas(conversationId)).length).toBeGreaterThan(antes);

    // ── Volta 2: o mesmo ciclo de novo, na mesma conversa ────────────────────
    await clienteEscreve(TEL.ciclo, 'E vocês fazem entrega em outra cidade?');
    expect((await estado(conversationId)).status).toBe('aguardando_humano');

    await assumirConversa(tenantId, conversationId, operadorId);
    await responderComoOperador(
      tenantId,
      conversationId,
      operadorId,
      'Só entregamos aqui na cidade mesmo.',
      `op-${sufixo}-2`,
    );
    await devolverParaIA(tenantId, conversationId, operadorId);

    const antes2 = (await saidas(conversationId)).length;
    const volta2 = await clienteEscreve(TEL.ciclo, 'Certo. E no domingo, que horas abre?');
    expect(volta2.atendimento.respondeu).toBe(true);
    expect((await saidas(conversationId)).length).toBeGreaterThan(antes2);
  }, 180_000);

  it('mensagem que chega durante atendimento humano fica registrada e sem resposta automática', async () => {
    const { conversationId } = await clienteEscreve(TEL.durante, 'Que horas vocês abrem no domingo?');

    await assumirConversa(tenantId, conversationId, operadorId);

    const durante = await clienteEscreve(TEL.durante, 'Oi, ainda estou aqui.');
    expect(durante.nova).toBe(true);
    expect(durante.atendimento.respondeu).toBe(false);

    // A mensagem existe no fio — o risco real é ela se perder.
    const todas = await withTenant(tenantId, (tx) =>
      tx
        .select({ corpo: messages.body })
        .from(messages)
        .where(eq(messages.conversationId, conversationId)),
    );
    expect(todas.some((m) => m.corpo === 'Oi, ainda estou aqui.')).toBe(true);

    await devolverParaIA(tenantId, conversationId, operadorId);
  }, 120_000);
});
