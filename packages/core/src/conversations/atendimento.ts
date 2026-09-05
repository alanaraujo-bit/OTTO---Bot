import {
  and,
  conversationEvents,
  conversations,
  eq,
  messages,
  sql,
  tenants,
  withTenant,
} from '@otto/db';
import { childLogger, uuidv7 } from '@otto/shared';

import { apenasCortesia, respostaDeCortesia } from '../ai/social.ts';
import { responder } from '../ai/agente.ts';
import { ehViolacaoDeUnicidade } from './conflito.ts';
import { registrarSinal } from '../aprendizado/sinais.ts';
import { enfileirarEnvio } from '../queue/filas.ts';

/**
 * Atendimento automático.
 *
 * Decide se a IA responde, gera a resposta, grava e — quando não pode responder
 * — coloca a conversa na fila humana com o motivo registrado.
 *
 * A conversa nunca fica sem desfecho: todo caminho aqui termina em uma resposta
 * enviada ou em alguém esperando por ela na Inbox. Uma conversa que some é a
 * pior falha operacional possível.
 */

export type MotivoHandoff =
  | 'sem_conhecimento'
  | 'confianca_baixa'
  | 'erro_no_agente'
  | 'cliente_pediu'
  | 'assunto_sensivel';

export interface ResultadoAtendimento {
  /** `true` quando uma resposta foi gerada e gravada para envio. */
  respondeu: boolean;
  mensagemId?: string;
  runId?: string;
  handoff?: MotivoHandoff;
}

/** Frases em que o cliente pede uma pessoa. Verificado antes de gastar com IA. */
const PEDIDO_DE_HUMANO =
  /\b(falar|conversar)\s+com\s+(uma\s+)?(pessoa|humano|atendente|alguém|alguem|gerente|respons[áa]vel)|\bquero\s+(um\s+)?(humano|atendente)|\bme\s+transfere|\bchama(r)?\s+(alguém|alguem|uma pessoa)/i;

export async function atenderAutomaticamente(
  tenantId: string,
  conversationId: string,
  mensagemId: string,
  textoDoCliente: string,
): Promise<ResultadoAtendimento> {
  const log = childLogger({ tenantId, conversationId, messageId: mensagemId });

  const contexto = await withTenant(tenantId, async (tx) => {
    const [conversa] = await tx
      .select({
        modo: conversations.mode,
        status: conversations.status,
        pausadaAte: conversations.aiPausedUntil,
        atribuida: conversations.assignedUserId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    const [empresa] = await tx
      .select({ fuso: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    return { conversa, fuso: empresa?.fuso ?? 'America/Sao_Paulo' };
  });

  if (!contexto.conversa) {
    log.warn('conversa não encontrada');
    return { respondeu: false };
  }

  const { conversa } = contexto;

  // ── A IA deve agir? ─────────────────────────────────────────────────────────
  // Modo humano e copilot não geram envio automático. Copilot ainda produz
  // sugestão, mas quem envia é a pessoa — implementado com a Inbox.
  if (conversa.modo !== 'automatico') {
    log.debug({ modo: conversa.modo }, 'modo não automático; IA não responde');
    return { respondeu: false };
  }

  if (conversa.pausadaAte && conversa.pausadaAte > new Date()) {
    log.debug('IA pausada nesta conversa');
    return { respondeu: false };
  }

  // Alguém já assumiu: a IA não fala por cima de um atendente.
  if (conversa.atribuida) {
    log.debug('conversa já assumida por uma pessoa');
    return { respondeu: false };
  }

  // ── Pedido explícito de humano ──────────────────────────────────────────────
  // Antes de chamar o modelo: é barato, é inequívoco, e insistir depois de a
  // pessoa pedir alguém irrita.
  if (PEDIDO_DE_HUMANO.test(textoDoCliente)) {
    log.info('cliente pediu atendimento humano');
    await encaminharParaHumano(tenantId, conversationId, 'cliente_pediu');
    return { respondeu: false, handoff: 'cliente_pediu' };
  }

  // ── Só cortesia ─────────────────────────────────────────────────────────────
  // Antes da barreira de fundamento, e essa ordem é o conserto: a barreira
  // existe para impedir que a Bia invente fato, e um cumprimento não pede fato
  // nenhum. Passando por ela, "Boa tarde" virava `sem_fundamento`, disparava
  // "Essa informação eu não tenho confirmada aqui" e ocupava uma pessoa da
  // equipe — visto em produção, com cliente de verdade.
  if (apenasCortesia(textoDoCliente)) {
    log.info('mensagem de cortesia; respondendo sem acionar o agente');
    await responderCortesia(
      tenantId,
      conversationId,
      mensagemId,
      respostaDeCortesia(textoDoCliente, new Date(), contexto.fuso),
    );
    return { respondeu: true };
  }

  // ── Agente ──────────────────────────────────────────────────────────────────
  const resultado = await responder({
    tenantId,
    conversationId,
    mensagemId,
    textoDoCliente,
    fuso: contexto.fuso,
  });

  if (resultado.desfecho !== 'ok' || !resultado.texto) {
    const motivo: MotivoHandoff =
      resultado.desfecho === 'sem_fundamento'
        ? 'sem_conhecimento'
        : resultado.desfecho === 'handoff'
          ? 'confianca_baixa'
          : 'erro_no_agente';

    // Avisa o cliente **antes** de encaminhar, e só quando a conversa ainda não
    // estava esperando alguém: repetir "vou chamar a equipe" a cada pergunta
    // seria ruído, e ele já foi avisado uma vez.
    const jaEsperava = conversa.status === 'aguardando_humano';
    if (!jaEsperava) {
      await avisarQueVaiChamarAlguem(tenantId, conversationId, mensagemId);
    }

    await encaminharParaHumano(tenantId, conversationId, motivo, resultado.runId);

    // O sinal é o insumo do aprendizado. Só um fato observado — não muda nada
    // sozinho, e precisa se repetir para virar sugestão a um humano.
    await registrarSinal({
      tenantId,
      tipo: motivo === 'sem_conhecimento' ? 'sem_resultado' : 'confianca_baixa',
      conversationId,
      messageId: mensagemId,
      pergunta: textoDoCliente,
      confianca: resultado.confianca,
      dados: { textoOriginal: textoDoCliente, runId: resultado.runId },
    });

    return { respondeu: false, runId: resultado.runId, handoff: motivo };
  }

  // ── Grava a resposta para envio ─────────────────────────────────────────────
  const mensagemDeSaida = await withTenant(tenantId, async (tx) => {
    let criada: { id: string };
    try {
      const [inserida] = await tx
        .insert(messages)
        .values({
          tenantId,
          conversationId,
          direction: 'saida',
          author: 'agente',
          contentType: 'texto',
          body: resultado.texto,
          status: 'pendente',
          aiRunId: resultado.runId,
          // A chave amarra a resposta à mensagem que a originou: reprocessar o
          // mesmo evento não gera uma segunda resposta ao cliente.
          idempotencyKey: `resposta:${mensagemId}`,
        })
        .returning({ id: messages.id });
      criada = inserida!;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro, 'messages_idempotency_key')) throw erro;
      return null;
    }

    const agora = new Date();
    await tx
      .update(conversations)
      .set({
        lastMessageAt: agora,
        // A IA ter respondido **outra** pergunta não cancela o pedido de
        // humano que já estava na fila. Rebaixar para `aguardando_cliente`
        // aqui faria a conversa sumir da lista de quem espera atendimento, e
        // ninguém voltaria a ela.
        status: sql`case when ${conversations.status} = 'aguardando_humano'
                    then ${conversations.status}
                    else 'aguardando_cliente'::conversation_status end`,
        firstResponseAt: sql`coalesce(${conversations.firstResponseAt}, ${agora})`,
      })
      .where(eq(conversations.id, conversationId));

    return criada.id;
  });

  if (!mensagemDeSaida) {
    log.info('resposta já havia sido gerada para esta mensagem');
    return { respondeu: false, runId: resultado.runId };
  }

  // O envio sai do caminho síncrono: a resposta já está gravada e visível na
  // Inbox, e a entrega ao provedor pode tentar de novo sem segurar ninguém.
  await enfileirarEnvio({ tenantId, messageId: mensagemDeSaida });

  log.info({ mensagemId: mensagemDeSaida, runId: resultado.runId }, 'resposta gerada');
  return { respondeu: true, mensagemId: mensagemDeSaida, runId: resultado.runId };
}

/**
 * Coloca a conversa na fila humana.
 *
 * O motivo vira evento na linha do tempo: quem assume precisa saber por que
 * chegou até ele, e o mesmo dado alimenta o aprendizado — "sem conhecimento" é
 * exatamente o sinal que gera sugestão de item novo na base.
 */
/**
 * A frase que o cliente recebe quando a base não cobre a pergunta.
 *
 * Silêncio não é uma resposta: quem pergunta e não recebe nada conclui que
 * ninguém viu. A frase diz a verdade — não temos aquela informação confirmada —
 * e diz o que vai acontecer. Ela **não** tenta responder por aproximação, que é
 * exatamente o que este produto existe para não fazer.
 */
const AVISO_SEM_CONHECIMENTO =
  'Essa informação eu não tenho confirmada aqui. ' +
  'Vou chamar alguém da equipe para te ajudar.';

/**
 * Grava e enfileira o aviso de encaminhamento.
 *
 * Passa pelo mesmo caminho de qualquer resposta — mensagem gravada, envio pela
 * fila —, então herda de graça o estado de entrega, a idempotência e o retry.
 * A chave de idempotência é derivada da mensagem do cliente: reprocessar o
 * mesmo evento não manda o aviso duas vezes.
 */
/**
 * Grava e enfileira a resposta a uma mensagem de pura cortesia.
 *
 * Mesmo caminho de qualquer resposta — mensagem gravada, envio pela fila —, e
 * por isso herda estado de entrega, idempotência e retry. Não grava `ai_run`
 * porque nenhum modelo foi chamado: registrar custo zero e confiança zero aqui
 * sujaria a média de todas as métricas de IA com mensagens que não são IA.
 */
async function responderCortesia(
  tenantId: string,
  conversationId: string,
  mensagemId: string,
  texto: string,
): Promise<void> {
  const criada = await withTenant(tenantId, async (tx) => {
    try {
      const [linha] = await tx
        .insert(messages)
        .values({
          tenantId,
          conversationId,
          direction: 'saida',
          author: 'agente',
          contentType: 'texto',
          body: texto,
          status: 'pendente',
          idempotencyKey: `cortesia-${mensagemId}`,
        })
        .returning({ id: messages.id });
      return linha!.id;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro, 'messages_idempotency_key')) throw erro;
      return null;
    }
  });

  if (criada) await enfileirarEnvio({ tenantId, messageId: criada });
}

async function avisarQueVaiChamarAlguem(
  tenantId: string,
  conversationId: string,
  mensagemId: string,
): Promise<void> {
  const criada = await withTenant(tenantId, async (tx) => {
    try {
      const [linha] = await tx
        .insert(messages)
        .values({
          tenantId,
          conversationId,
          direction: 'saida',
          author: 'agente',
          contentType: 'texto',
          body: AVISO_SEM_CONHECIMENTO,
          status: 'pendente',
          idempotencyKey: `aviso-${mensagemId}`,
        })
        .returning({ id: messages.id });
      return linha!.id;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro, 'messages_idempotency_key')) throw erro;
      return null;
    }
  });

  if (criada) await enfileirarEnvio({ tenantId, messageId: criada });
}

export async function encaminharParaHumano(
  tenantId: string,
  conversationId: string,
  motivo: MotivoHandoff,
  runId?: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(conversations)
      .set({
        status: 'aguardando_humano',
        handoffCount: sql`${conversations.handoffCount} + 1`,
        // **Não** pausa a IA por tempo, e isso foi corrigido depois de um teste
        // real: uma pausa de 30 minutos aqui transformava um handoff em mudez
        // prolongada. O cliente perguntava outra coisa — que a base respondia —
        // e não recebia nada, porque o relógio ainda estava correndo.
        //
        // Quem impede a IA de falar por cima de um atendente é o próprio
        // atendente: `assumirConversa` marca `assignedUserId` e põe o modo em
        // `humano`. Enquanto ninguém assumiu, o modo ainda é IA, e o pedido do
        // cliente merece a resposta que soubermos dar.
        priority: motivo === 'cliente_pediu' ? 1 : sql`${conversations.priority}`,
      })
      .where(eq(conversations.id, conversationId));

    await tx.insert(conversationEvents).values({
      tenantId,
      conversationId,
      type: 'handoff',
      data: { motivo, runId: runId ?? null, origem: 'automatico' },
    });
  });
}
