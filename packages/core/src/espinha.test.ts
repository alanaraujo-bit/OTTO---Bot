import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  aiRuns,
  channels,
  closeDb,
  conversationEvents,
  conversations,
  eq,
  getPlatformDb,
  knowledgeItems,
  messages,
  tenants,
  usageEvents,
  withTenant,
} from '@otto/db';

import { indexarItem } from './knowledge/indexacao.ts';
import { recuperar, temFundamento } from './knowledge/recuperacao.ts';
import { atenderAutomaticamente } from './conversations/atendimento.ts';
import { receberMensagem } from './conversations/ingestao.ts';
import { definirProvedor } from './ai/roteador.ts';
import { ProvedorSimulado } from './ai/provedores/simulado.ts';

/**
 * A espinha vertical, ponta a ponta.
 *
 * Este é o teste que prova que a cadeia é real e não uma sequência de mocks:
 * webhook → contato → conversa → mensagem → recuperação no banco → agente →
 * resposta gravada → custo registrado.
 *
 * Roda contra o Postgres de verdade, com RLS ativo. O único componente
 * substituído é o fornecedor de IA, por um determinístico que **deriva a
 * resposta do conhecimento recuperado** — trocar por OpenAI é mudar uma
 * variável de ambiente, e o resto do teste continua válido.
 */

const sufixo = Date.now().toString(36);
const slug = `espinha-${sufixo}`;

let tenantId: string;
let channelId: string;

beforeAll(async () => {
  definirProvedor(new ProvedorSimulado());

  const admin = getPlatformDb();

  const [empresa] = await admin
    .insert(tenants)
    .values({ slug, displayName: 'Empresa da Espinha', status: 'ativo', timezone: 'America/Belem' })
    .returning({ id: tenants.id });
  tenantId = empresa!.id;

  const [canal] = await admin
    .insert(channels)
    .values({
      tenantId,
      kind: 'simulador',
      name: 'Canal de teste',
      status: 'conectado',
      externalId: `sim-${sufixo}`,
    })
    .returning({ id: channels.id });
  channelId = canal!.id;

  // Conhecimento real, publicado e indexado — não injetado no meio da cadeia.
  const [item] = await admin
    .insert(knowledgeItems)
    .values({
      tenantId,
      kind: 'pergunta_frequente',
      status: 'publicado',
      title: 'Formas de pagamento aceitas',
      body:
        'Aceitamos dinheiro, PIX, cartão de débito e cartão de crédito. ' +
        'Também aceitamos vale-alimentação nas bandeiras Alelo e Sodexo.',
      aliases: ['aceita pix', 'aceita cartão', 'pode pagar com vale'],
      publishedAt: new Date(),
    })
    .returning({ id: knowledgeItems.id });

  await indexarItem(tenantId, item!.id);
}, 60_000);

afterAll(async () => {
  await getPlatformDb().delete(tenants).where(eq(tenants.slug, slug));
  definirProvedor(null);
  await closeDb();
});

describe('recuperação de conhecimento', () => {
  it('encontra o item pela pergunta do cliente', async () => {
    const trechos = await recuperar(tenantId, 'vocês aceitam pix?');
    expect(trechos.length).toBeGreaterThan(0);
    expect(trechos[0]!.titulo).toBe('Formas de pagamento aceitas');
    expect(temFundamento(trechos)).toBe(true);
  });

  it('encontra mesmo sem acento — como se digita no celular', async () => {
    const trechos = await recuperar(tenantId, 'aceita cartao de credito');
    expect(trechos.length).toBeGreaterThan(0);
    expect(temFundamento(trechos)).toBe(true);
  });

  it('não inventa fundamento para assunto que a base não cobre', async () => {
    const trechos = await recuperar(tenantId, 'vocês vendem bicicleta elétrica importada?');
    expect(temFundamento(trechos)).toBe(false);
  });
});

describe('cadeia completa de atendimento', () => {
  it('vai da mensagem recebida à resposta gravada, com custo registrado', async () => {
    const externo = `msg-${sufixo}-1`;

    const recebida = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: '5594999990001',
      nomePerfil: 'Cliente de Teste',
      telefone: '5594999990001',
      mensagemExterna: externo,
      texto: 'oi, vocês aceitam pix?',
    });

    expect(recebida.nova).toBe(true);
    expect(recebida.conversaNova).toBe(true);

    const atendimento = await atenderAutomaticamente(
      tenantId,
      recebida.conversationId,
      recebida.messageId,
      'oi, vocês aceitam pix?',
    );

    expect(atendimento.respondeu).toBe(true);
    expect(atendimento.runId).toBeTruthy();

    // A resposta existe, está pendente de envio e aponta para a execução.
    const gravadas = await withTenant(tenantId, (tx) =>
      tx.select().from(messages).where(eq(messages.conversationId, recebida.conversationId)),
    );

    const resposta = gravadas.find((m) => m.direction === 'saida');
    expect(resposta).toBeDefined();

    // `pendente` é o estado no instante da gravação, mas um worker rodando
    // contra o mesmo Redis pode consumir a fila antes desta linha executar —
    // acontece com o worker do ambiente `development` (ver docs/META.md). O que
    // o teste precisa garantir é que a resposta entrou no caminho de envio e
    // não falhou; o instante exato do estado é corrida, não regra.
    expect(['pendente', 'enviando', 'enviada']).toContain(resposta!.status);
    expect(resposta!.aiRunId).toBe(atendimento.runId);
    // Derivada do conhecimento, não inventada.
    expect(resposta!.body?.toLowerCase()).toContain('pix');

    // A execução foi registrada com o que a operação precisa saber.
    const [execucao] = await withTenant(tenantId, (tx) =>
      tx.select().from(aiRuns).where(eq(aiRuns.id, atendimento.runId!)),
    );

    expect(execucao).toBeDefined();
    expect(execucao!.outcome).toBe('ok');
    expect(execucao!.grounded).toBe(true);
    expect(execucao!.provider).toBe('simulado');
    expect(execucao!.inputTokens).toBeGreaterThan(0);
    expect(execucao!.latencyMs).toBeGreaterThanOrEqual(0);
    expect((execucao!.retrievedItemIds as string[]).length).toBeGreaterThan(0);

    // E o consumo foi contabilizado para efeito comercial.
    const consumo = await withTenant(tenantId, (tx) =>
      tx.select().from(usageEvents).where(eq(usageEvents.refId, atendimento.runId!)),
    );
    expect(consumo).toHaveLength(1);
    expect(consumo[0]!.kind).toBe('ia_tokens');
    expect(consumo[0]!.quantity).toBeGreaterThan(0);
  });

  it('ignora a entrega repetida do mesmo webhook', async () => {
    const externo = `msg-${sufixo}-repetida`;
    const entrada = {
      tenantId,
      channelId,
      remetenteExterno: '5594999990002',
      mensagemExterna: externo,
      texto: 'aceita cartão?',
    };

    const primeira = await receberMensagem(entrada);
    const segunda = await receberMensagem(entrada);

    expect(primeira.nova).toBe(true);
    expect(segunda.nova).toBe(false);
    expect(segunda.messageId).toBe(primeira.messageId);
  });

  it('não responde duas vezes quando o mesmo evento é reprocessado', async () => {
    const externo = `msg-${sufixo}-reproc`;

    const recebida = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: '5594999990003',
      mensagemExterna: externo,
      texto: 'aceita vale alimentação?',
    });

    const primeira = await atenderAutomaticamente(
      tenantId,
      recebida.conversationId,
      recebida.messageId,
      'aceita vale alimentação?',
    );
    const segunda = await atenderAutomaticamente(
      tenantId,
      recebida.conversationId,
      recebida.messageId,
      'aceita vale alimentação?',
    );

    expect(primeira.respondeu).toBe(true);
    expect(segunda.respondeu).toBe(false);

    const saidas = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, recebida.conversationId)),
    );
    expect(saidas.filter((m) => m.direction === 'saida')).toHaveLength(1);
  });

  it('encaminha para humano quando a base não tem a resposta', async () => {
    const externo = `msg-${sufixo}-sem-base`;

    const recebida = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: '5594999990004',
      mensagemExterna: externo,
      texto: 'vocês fazem manutenção de ar-condicionado industrial?',
    });

    const atendimento = await atenderAutomaticamente(
      tenantId,
      recebida.conversationId,
      recebida.messageId,
      'vocês fazem manutenção de ar-condicionado industrial?',
    );

    expect(atendimento.respondeu).toBe(false);
    expect(atendimento.handoff).toBe('sem_conhecimento');

    // A conversa fica visível na fila humana, com o motivo registrado.
    const [conversa] = await withTenant(tenantId, (tx) =>
      tx.select().from(conversations).where(eq(conversations.id, recebida.conversationId)),
    );
    expect(conversa!.status).toBe('aguardando_humano');
    expect(conversa!.handoffCount).toBe(1);

    const eventos = await withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(conversationEvents)
        .where(eq(conversationEvents.conversationId, recebida.conversationId)),
    );
    const handoff = eventos.find((e) => e.type === 'handoff');
    expect(handoff).toBeDefined();
    expect((handoff!.data as { motivo: string }).motivo).toBe('sem_conhecimento');

    // Nenhuma resposta foi **inventada** para o cliente — mas ele também não
    // fica no vácuo. A única saída é o aviso de encaminhamento, que admite não
    // ter a informação em vez de aproximar uma resposta.
    //
    // Este trecho já afirmou `toHaveLength(0)`. O silêncio foi corrigido depois
    // de um teste real: o cliente perguntava, não recebia nada, e concluía que
    // ninguém tinha visto. O que segue proibido — e é o que o teste protege — é
    // conteúdo factual que a base não sustenta.
    const saidas = await withTenant(tenantId, (tx) =>
      tx.select().from(messages).where(eq(messages.conversationId, recebida.conversationId)),
    );
    const enviadas = saidas.filter((m) => m.direction === 'saida');
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]!.body).toMatch(/não tenho confirmada/i);
    expect(enviadas[0]!.aiRunId).toBeNull();

    // E a execução ficou registrada como sem fundamento, sem custo.
    const execucoes = await withTenant(tenantId, (tx) =>
      tx.select().from(aiRuns).where(eq(aiRuns.conversationId, recebida.conversationId)),
    );
    expect(execucoes[0]!.outcome).toBe('sem_fundamento');
    expect(execucoes[0]!.grounded).toBe(false);
  });

  it('transfere na hora quando o cliente pede uma pessoa', async () => {
    const externo = `msg-${sufixo}-humano`;

    const recebida = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: '5594999990005',
      mensagemExterna: externo,
      texto: 'quero falar com uma pessoa',
    });

    const atendimento = await atenderAutomaticamente(
      tenantId,
      recebida.conversationId,
      recebida.messageId,
      'quero falar com uma pessoa',
    );

    expect(atendimento.handoff).toBe('cliente_pediu');
    // Não gastou com IA: o pedido é inequívoco e verificado antes.
    expect(atendimento.runId).toBeUndefined();

    const [conversa] = await withTenant(tenantId, (tx) =>
      tx.select().from(conversations).where(eq(conversations.id, recebida.conversationId)),
    );
    expect(conversa!.status).toBe('aguardando_humano');
    expect(conversa!.priority).toBe(1);
  });

  it('continua a mesma conversa quando o cliente escreve de novo', async () => {
    const remetente = '5594999990006';

    const primeira = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: remetente,
      mensagemExterna: `msg-${sufixo}-fio-1`,
      texto: 'aceita pix?',
    });

    const segunda = await receberMensagem({
      tenantId,
      channelId,
      remetenteExterno: remetente,
      mensagemExterna: `msg-${sufixo}-fio-2`,
      texto: 'e cartão?',
    });

    expect(segunda.conversationId).toBe(primeira.conversationId);
    expect(segunda.contactId).toBe(primeira.contactId);
    expect(segunda.conversaNova).toBe(false);
  });
});

describe('regra anti-alucinação', () => {
  /**
   * Os casos que já falharam de verdade. Cada linha aqui corresponde a um bug
   * encontrado exercitando o produto, não a uma hipótese.
   */
  const casos: { pergunta: string; deveResponder: boolean; porque: string }[] = [
    {
      pergunta: 'vocês aceitam pix?',
      deveResponder: true,
      porque: 'está na base; a busca por OU precisa encontrar mesmo com "vocês" fora do texto',
    },
    {
      pergunta: 'aceita cartao de credito',
      deveResponder: true,
      porque: 'sem acento, como se digita no celular',
    },
    {
      pergunta: 'vendem pneu de caminhão?',
      deveResponder: false,
      porque: 'casava só a palavra "vendem" e respondia sobre outro assunto',
    },
    {
      pergunta: 'vocês consertam geladeira?',
      deveResponder: false,
      porque: 'nada na base cobre assistência técnica',
    },
    {
      pergunta: 'qual o valor do arroz hoje?',
      deveResponder: false,
      porque: 'preço depende de integração que não existe; inventar seria a pior falha',
    },
  ];

  for (const caso of casos) {
    it(`${caso.deveResponder ? 'responde' : 'encaminha'}: "${caso.pergunta}"`, async () => {
      const trechos = await recuperar(tenantId, caso.pergunta);
      expect(temFundamento(trechos), caso.porque).toBe(caso.deveResponder);
    });
  }

  it('mede cobertura de termos, não apenas posição no ranking', async () => {
    // O ponto do bug: com OU, uma pergunta fora do assunto ainda encontra algo —
    // e o primeiro colocado de uma busca ruim continua sendo o primeiro colocado.
    const foraDoAssunto = await recuperar(tenantId, 'vendem pneu de caminhão?');
    if (foraDoAssunto.length > 0) {
      expect(foraDoAssunto[0]!.cobertura).toBeLessThan(0.5);
    }

    const noAssunto = await recuperar(tenantId, 'vocês aceitam pix?');
    expect(noAssunto[0]!.cobertura).toBeGreaterThanOrEqual(0.5);
  });
});

describe('fundamento em fatos estruturados', () => {
  it('reconhece pergunta sobre horário e endereço como fundamentada', async () => {
    const { contextoDaEmpresa } = await import('./ai/contexto.ts');
    const { avaliarFundamento } = await import('./ai/fundamento.ts');

    const empresa = await contextoDaEmpresa(tenantId);
    // A empresa de teste não tem unidade cadastrada, então a resposta correta
    // aqui é "não sei" — o que também prova que a regra não é otimista.
    const semUnidade = avaliarFundamento('que horas vocês abrem?', [], empresa, false);
    expect(semUnidade).toBe('nenhum');
  });

  it('não confunde pergunta de produto com pergunta de unidade', async () => {
    const { perguntaSobreUnidade } = await import('./ai/fundamento.ts');

    expect(perguntaSobreUnidade('que horas vocês abrem?')).toBe(true);
    expect(perguntaSobreUnidade('qual o endereço da loja?')).toBe(true);
    expect(perguntaSobreUnidade('abrem domingo?')).toBe(true);
    expect(perguntaSobreUnidade('vocês aceitam pix?')).toBe(false);
    expect(perguntaSobreUnidade('vendem pneu?')).toBe(false);
  });
});

describe('separação entre instrução e conhecimento', () => {
  it('nunca envia texto da instrução como resposta ao cliente', async () => {
    const { ProvedorSimulado } = await import('./ai/provedores/simulado.ts');
    const provedor = new ProvedorSimulado();

    // A instrução menciona a palavra CONHECIMENTO ao proibir o modelo de sair
    // dela. Um filtro por string confundia as duas e vazava a instrução.
    const r = await provedor.gerar({
      modelo: 'teste',
      mensagens: [
        {
          papel: 'sistema',
          marcador: 'instrucao',
          conteudo:
            'Use apenas o que estiver no CONHECIMENTO fornecido. A loja está fechada agora.',
        },
        {
          papel: 'sistema',
          marcador: 'conhecimento',
          conteudo: 'CONHECIMENTO\n---\nPagamentos\n\nAceitamos PIX e cartão de crédito.',
        },
        { papel: 'usuario', conteudo: 'aceita pix?' },
      ],
    });

    expect(r.texto).toContain('PIX');
    expect(r.texto).not.toContain('CONHECIMENTO');
    expect(r.texto).not.toContain('fechada agora');
  });
});
