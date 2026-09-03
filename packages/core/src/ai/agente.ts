import { agents, agentVersions, aiRuns, and, eq, usageEvents, withTenant } from '@otto/db';
import { childLogger, inicioDoDiaLocal, partesLocais, uuidv7 } from '@otto/shared';

import { recuperar, temFundamento, type TrechoRecuperado } from '../knowledge/recuperacao.ts';
import { blocoDeConhecimento, contextoDaEmpresa, historicoDaConversa } from './contexto.ts';
import { avaliarFundamento, type OrigemFundamento } from './fundamento.ts';
import {
  compilarInstrucao,
  esquemaPersonalidade,
  PERSONALIDADE_PADRAO,
  type Personalidade,
} from './personalidade.ts';
import type { MensagemChat } from './provedor.ts';
import { comNovaTentativa, rotaPara } from './roteador.ts';

/**
 * Execução do agente.
 *
 * Cada chamada percorre a cadeia inteira e grava uma linha em `ai_runs`:
 * modelo, tokens, custo, latência, tentativas, itens de conhecimento usados e
 * versão do comportamento. É isso que sustenta ao mesmo tempo o custo por
 * conversa, o diagnóstico de "por que a resposta saiu assim" e a comparação de
 * qualidade entre versões do agente.
 *
 * A regra anti-alucinação mora aqui, e é código: sem fundamento recuperado, o
 * modelo **não é chamado** para inventar. O desfecho vira `sem_fundamento` e o
 * atendimento vai para uma pessoa.
 */

export type DesfechoAgente = 'ok' | 'sem_fundamento' | 'handoff' | 'erro' | 'bloqueado';

export interface ResultadoAgente {
  runId: string;
  desfecho: DesfechoAgente;
  /** `null` quando o desfecho não produz resposta ao cliente. */
  texto: string | null;
  confianca: number;
  fundamentado: boolean;
  trechos: TrechoRecuperado[];
  custoMicroUsd: number;
  latenciaMs: number;
  modelo: string;
  provedor: string;
}

export interface PedidoAgente {
  tenantId: string;
  conversationId: string;
  /** Mensagem que disparou a execução. */
  mensagemId: string;
  textoDoCliente: string;
  fuso: string;
}

export async function responder(pedido: PedidoAgente): Promise<ResultadoAgente> {
  const { tenantId, conversationId, mensagemId, textoDoCliente, fuso } = pedido;

  const runId = uuidv7();
  const log = childLogger({ tenantId, conversationId, messageId: mensagemId });
  const inicio = Date.now();

  const { personalidade, versaoId } = await comportamentoAtivo(tenantId);
  const rota = rotaPara('responder');

  // ── Recuperação ─────────────────────────────────────────────────────────────
  // O embedding é opcional de propósito: sem ele a busca degrada para texto puro
  // em vez de falhar. Ver `recuperacao.ts`.
  let embedding: number[] | null = null;
  try {
    const rotaEmb = rotaPara('embutir');
    const r = await rotaEmb.provedor.embutir({
      modelo: rotaEmb.modelo,
      textos: [textoDoCliente],
    });
    embedding = r.vetores[0] ?? null;
  } catch (erro) {
    log.warn({ erro }, 'embedding indisponível; recuperando só por texto');
  }

  const trechos = await recuperar(tenantId, textoDoCliente, { embedding, limite: 5 });

  // O contexto da empresa é buscado antes de decidir, e não depois: horário,
  // endereço e telefone são fundamento tão legítimo quanto a base de
  // conhecimento — e são as perguntas mais comuns de um comércio.
  const empresa = await contextoDaEmpresa(tenantId);
  const origem = avaliarFundamento(
    textoDoCliente,
    trechos,
    empresa,
    temFundamento(trechos),
  );
  const fundamentado = origem !== 'nenhum';

  // ── Sem fundamento: não chama o modelo ──────────────────────────────────────
  if (!fundamentado) {
    log.info({ runId }, 'sem fundamento na base; encaminhando para humano');

    await registrarExecucao({
      runId,
      tenantId,
      conversationId,
      mensagemId,
      versaoId,
      provedor: rota.provedor.nome,
      modelo: rota.modelo,
      uso: { tokensEntrada: 0, tokensSaida: 0, tokensCacheados: 0 },
      custoMicroUsd: 0,
      latenciaMs: Date.now() - inicio,
      confianca: 0,
      fundamentado: false,
      trechos,
      desfecho: 'sem_fundamento',
      tentativas: 1,
      fuso,
    });

    return {
      runId,
      desfecho: 'sem_fundamento',
      texto: null,
      confianca: 0,
      fundamentado: false,
      trechos,
      custoMicroUsd: 0,
      latenciaMs: Date.now() - inicio,
      modelo: rota.modelo,
      provedor: rota.provedor.nome,
    };
  }

  // ── Geração ─────────────────────────────────────────────────────────────────
  const { mensagens: historico } = await historicoDaConversa(tenantId, conversationId);

  const mensagens: MensagemChat[] = [
    {
      papel: 'sistema',
      marcador: 'instrucao',
      conteudo: compilarInstrucao(personalidade, empresa),
    },
    {
      papel: 'sistema',
      marcador: 'conhecimento',
      conteudo: blocoDeConhecimento(
        trechos,
        empresa,
        origem === 'unidades' || origem === 'ambos',
      ),
    },
    ...historico,
  ];

  // A mensagem atual pode ainda não estar no histórico, dependendo da ordem de
  // gravação. Só acrescenta se não estiver, para não duplicar.
  const ultima = historico.at(-1);
  if (ultima?.papel !== 'usuario' || ultima.conteudo !== textoDoCliente) {
    mensagens.push({ papel: 'usuario', conteudo: textoDoCliente });
  }

  try {
    const { resultado, tentativas } = await comNovaTentativa(
      () =>
        rota.provedor.gerar({
          modelo: rota.modelo,
          mensagens,
          temperatura: rota.temperatura,
          maxTokens: rota.maxTokens,
        }),
      (n, erro) => log.warn({ tentativa: n, erro: erro.message }, 'nova tentativa no fornecedor'),
    );

    const custo = rota.provedor.custoMicroUsd(rota.modelo, {
      entrada: resultado.uso.tokensEntrada,
      saida: resultado.uso.tokensSaida,
      cacheados: resultado.uso.tokensCacheados,
    });

    const confianca = calcularConfianca(trechos, resultado.texto, origem);
    const abaixoDoLimiar = confianca < personalidade.limiarConfianca;
    const desfecho: DesfechoAgente = !resultado.texto?.trim()
      ? 'erro'
      : abaixoDoLimiar
        ? 'handoff'
        : 'ok';

    const latenciaMs = Date.now() - inicio;

    await registrarExecucao({
      runId,
      tenantId,
      conversationId,
      mensagemId,
      versaoId,
      provedor: rota.provedor.nome,
      modelo: rota.modelo,
      uso: resultado.uso,
      custoMicroUsd: custo,
      latenciaMs,
      confianca,
      fundamentado: true,
      trechos,
      desfecho,
      tentativas,
      fuso,
    });

    log.info({ runId, desfecho, confianca, custo, latenciaMs }, 'agente respondeu');

    return {
      runId,
      desfecho,
      texto: desfecho === 'ok' ? resultado.texto : null,
      confianca,
      fundamentado: true,
      trechos,
      custoMicroUsd: custo,
      latenciaMs,
      modelo: rota.modelo,
      provedor: rota.provedor.nome,
    };
  } catch (erro) {
    const latenciaMs = Date.now() - inicio;
    log.error({ runId, erro }, 'agente falhou');

    await registrarExecucao({
      runId,
      tenantId,
      conversationId,
      mensagemId,
      versaoId,
      provedor: rota.provedor.nome,
      modelo: rota.modelo,
      uso: { tokensEntrada: 0, tokensSaida: 0, tokensCacheados: 0 },
      custoMicroUsd: 0,
      latenciaMs,
      confianca: 0,
      fundamentado: true,
      trechos,
      desfecho: 'erro',
      tentativas: 3,
      erro: erro instanceof Error ? erro.message : String(erro),
      fuso,
    });

    return {
      runId,
      desfecho: 'erro',
      texto: null,
      confianca: 0,
      fundamentado: true,
      trechos,
      custoMicroUsd: 0,
      latenciaMs,
      modelo: rota.modelo,
      provedor: rota.provedor.nome,
    };
  }
}

/**
 * Confiança da resposta.
 *
 * Estimada por nós, **não perguntada ao modelo**: modelo de linguagem é
 * notoriamente mal calibrado sobre a própria certeza, e pedir uma nota produz um
 * número confiante e inútil.
 *
 * O que medimos: força do que foi recuperado, se veio pelos dois caminhos de
 * busca, e se a resposta não é uma recusa disfarçada.
 */
function calcularConfianca(
  trechos: TrechoRecuperado[],
  texto: string | null,
  origem: OrigemFundamento,
): number {
  if (!texto?.trim()) return 0;

  const melhor = trechos[0];

  // Fundamento vindo só das unidades não passa pela recuperação, e é dado
  // cadastrado e exato — endereço e horário são mais confiáveis que qualquer
  // trecho de texto recuperado por similaridade.
  if (!melhor) return origem === 'unidades' ? 0.8 : 0;

  // O escore do RRF vive numa faixa estreita; normaliza para algo interpretável.
  let confianca = Math.min(1, melhor.escore / (1 / 61) / 2);
  if (melhor.origem === 'ambos') confianca = Math.min(1, confianca + 0.2);
  if (origem === 'ambos') confianca = Math.min(1, confianca + 0.15);
  if (trechos.length >= 2) confianca = Math.min(1, confianca + 0.1);

  // Resposta que admite desconhecimento não deve passar como confiante — é
  // exatamente o caso em que um humano resolve melhor.
  const recusa = /não (sei|tenho|consigo|posso)|não encontrei|chamar alguém|equipe/i;
  if (recusa.test(texto)) confianca = Math.min(confianca, 0.3);

  return Number(confianca.toFixed(2));
}

/** Comportamento publicado da empresa, ou o padrão quando ainda não há um. */
async function comportamentoAtivo(
  tenantId: string,
): Promise<{ personalidade: Personalidade; versaoId: string | null }> {
  return withTenant(tenantId, async (tx) => {
    const [agente] = await tx
      .select({ id: agents.id, versaoAtiva: agents.activeVersionId, nome: agents.displayName })
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .limit(1);

    if (!agente) return { personalidade: PERSONALIDADE_PADRAO, versaoId: null };

    if (agente.versaoAtiva) {
      const [versao] = await tx
        .select({ settings: agentVersions.settings })
        .from(agentVersions)
        .where(eq(agentVersions.id, agente.versaoAtiva))
        .limit(1);

      if (versao) {
        const analise = esquemaPersonalidade.safeParse(versao.settings);
        if (analise.success) {
          return { personalidade: analise.data, versaoId: agente.versaoAtiva };
        }
      }
    }

    // Sem versão publicada, o nome do agente já vale — é o mínimo que a empresa
    // configurou ao ser criada.
    return {
      personalidade: { ...PERSONALIDADE_PADRAO, nome: agente.nome },
      versaoId: null,
    };
  });
}

interface DadosExecucao {
  runId: string;
  tenantId: string;
  conversationId: string;
  mensagemId: string;
  versaoId: string | null;
  provedor: string;
  modelo: string;
  uso: { tokensEntrada: number; tokensSaida: number; tokensCacheados: number };
  custoMicroUsd: number;
  latenciaMs: number;
  confianca: number;
  fundamentado: boolean;
  trechos: TrechoRecuperado[];
  desfecho: DesfechoAgente;
  tentativas: number;
  erro?: string;
  fuso: string;
}

/**
 * Grava a execução e o consumo.
 *
 * As duas gravações ficam na mesma transação: contabilizar consumo sem a
 * execução correspondente, ou o contrário, produz relatório que não fecha — e o
 * faturamento depende disso.
 */
async function registrarExecucao(d: DadosExecucao): Promise<void> {
  const agora = new Date();
  const { dataISO } = partesLocais(agora, d.fuso);

  await withTenant(d.tenantId, async (tx) => {
    await tx.insert(aiRuns).values({
      id: d.runId,
      tenantId: d.tenantId,
      conversationId: d.conversationId,
      triggerMessageId: d.mensagemId,
      agentVersionId: d.versaoId,
      purpose: 'responder',
      provider: d.provedor,
      model: d.modelo,
      inputTokens: d.uso.tokensEntrada,
      outputTokens: d.uso.tokensSaida,
      cachedTokens: d.uso.tokensCacheados,
      costMicroUsd: d.custoMicroUsd,
      latencyMs: d.latenciaMs,
      confidence: d.confianca,
      grounded: d.fundamentado,
      retrievedItemIds: [...new Set(d.trechos.map((t) => t.itemId))],
      outcome: d.desfecho,
      error: d.erro ?? null,
      attempts: d.tentativas,
      completedAt: agora,
    });

    const tokens = d.uso.tokensEntrada + d.uso.tokensSaida;
    if (tokens > 0) {
      await tx.insert(usageEvents).values({
        tenantId: d.tenantId,
        kind: 'ia_tokens',
        quantity: tokens,
        unit: 'tokens',
        costMicroUsd: d.custoMicroUsd,
        refType: 'ai_run',
        refId: d.runId,
        localDate: dataISO,
      });
    }
  });
}
