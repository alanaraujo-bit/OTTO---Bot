import OpenAI from 'openai';

import {
  ErroProvedor,
  type PedidoEmbedding,
  type PedidoGeracao,
  type Provedor,
  type RespostaEmbedding,
  type RespostaGeracao,
} from '../provedor.ts';

/**
 * Adaptador da OpenAI.
 *
 * Traduz o contrato do produto para a API do fornecedor e de volta. Toda
 * particularidade da OpenAI para aqui: o restante do código não sabe que ela
 * existe.
 */

/**
 * Preços em micro-dólares por milhão de tokens.
 *
 * Ficam no adaptador porque são fato do fornecedor, e mudam sem aviso. Um modelo
 * desconhecido cobra o preço do mais caro que conhecemos — subestimar custo é
 * pior que superestimar quando existe orçamento por empresa.
 */
const PRECOS: Record<string, { entrada: number; saida: number; cacheado?: number }> = {
  'gpt-4.1-mini': { entrada: 400_000, saida: 1_600_000, cacheado: 100_000 },
  'gpt-4.1-nano': { entrada: 100_000, saida: 400_000, cacheado: 25_000 },
  'gpt-4.1': { entrada: 2_000_000, saida: 8_000_000, cacheado: 500_000 },
  'text-embedding-3-small': { entrada: 20_000, saida: 0 },
  'text-embedding-3-large': { entrada: 130_000, saida: 0 },
};

const MAIS_CARO: { entrada: number; saida: number; cacheado?: number } = {
  entrada: 2_000_000,
  saida: 8_000_000,
};

export class ProvedorOpenAI implements Provedor {
  readonly nome = 'openai';
  private readonly cliente: OpenAI;

  constructor(apiKey: string) {
    this.cliente = new OpenAI({
      apiKey,
      // A orquestração decide sobre nova tentativa: ela conhece o orçamento, o
      // prazo do atendimento e a alternativa. O SDK não conhece nada disso.
      maxRetries: 0,
      timeout: 30_000,
    });
  }

  async gerar(pedido: PedidoGeracao): Promise<RespostaGeracao> {
    try {
      const resposta = await this.cliente.chat.completions.create({
        model: pedido.modelo,
        messages: pedido.mensagens.map(paraMensagemOpenAI),
        temperature: pedido.temperatura ?? 0.3,
        max_completion_tokens: pedido.maxTokens ?? 600,
        ...(pedido.ferramentas?.length
          ? {
              tools: pedido.ferramentas.map((f) => ({
                type: 'function' as const,
                function: { name: f.nome, description: f.descricao, parameters: f.parametros },
              })),
            }
          : {}),
      });

      const escolha = resposta.choices[0];
      const chamadas = (escolha?.message.tool_calls ?? []).flatMap((c) =>
        c.type === 'function'
          ? [{ id: c.id, nome: c.function.name, argumentos: analisarArgumentos(c.function.arguments) }]
          : [],
      );

      return {
        texto: escolha?.message.content ?? null,
        chamadas,
        uso: {
          tokensEntrada: resposta.usage?.prompt_tokens ?? 0,
          tokensSaida: resposta.usage?.completion_tokens ?? 0,
          tokensCacheados: resposta.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        },
        motivoParada: traduzirParada(escolha?.finish_reason),
      };
    } catch (erro) {
      throw traduzirErro(erro);
    }
  }

  async embutir(pedido: PedidoEmbedding): Promise<RespostaEmbedding> {
    try {
      const resposta = await this.cliente.embeddings.create({
        model: pedido.modelo,
        input: pedido.textos,
      });

      return {
        // A API não garante ordem; `index` garante.
        vetores: resposta.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding as number[]),
        uso: { tokensEntrada: resposta.usage?.prompt_tokens ?? 0 },
      };
    } catch (erro) {
      throw traduzirErro(erro);
    }
  }

  custoMicroUsd(
    modelo: string,
    uso: { entrada: number; saida: number; cacheados?: number },
  ): number {
    const preco = PRECOS[modelo] ?? MAIS_CARO;
    const cacheados = uso.cacheados ?? 0;
    const naoCacheados = Math.max(0, uso.entrada - cacheados);

    const custo =
      (naoCacheados * preco.entrada) / 1_000_000 +
      (cacheados * (preco.cacheado ?? preco.entrada)) / 1_000_000 +
      (uso.saida * preco.saida) / 1_000_000;

    return Math.round(custo);
  }
}

function paraMensagemOpenAI(m: PedidoGeracao['mensagens'][number]) {
  switch (m.papel) {
    case 'sistema':
      return { role: 'system' as const, content: m.conteudo };
    case 'assistente':
      return { role: 'assistant' as const, content: m.conteudo };
    case 'ferramenta':
      return {
        role: 'tool' as const,
        content: m.conteudo,
        tool_call_id: m.chamadaId ?? m.nomeFerramenta ?? 'desconhecida',
      };
    default:
      return { role: 'user' as const, content: m.conteudo };
  }
}

/** Argumento malformado não derruba o atendimento — vira objeto vazio. */
function analisarArgumentos(bruto: string): Record<string, unknown> {
  try {
    const valor: unknown = JSON.parse(bruto);
    return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function traduzirParada(motivo: string | null | undefined): string {
  switch (motivo) {
    case 'stop':
      return 'parou';
    case 'length':
      return 'limite_tokens';
    case 'tool_calls':
      return 'ferramenta';
    case 'content_filter':
      return 'filtrado';
    default:
      return motivo ?? 'desconhecido';
  }
}

function traduzirErro(erro: unknown): ErroProvedor {
  if (erro instanceof OpenAI.APIError) {
    const status = erro.status ?? 0;
    // 429 e 5xx passam com nova tentativa; 400 e 401 não passam nunca.
    const recuperavel = status === 429 || status >= 500;
    const cabecalho = erro.headers?.get?.('retry-after');

    return new ErroProvedor(erro.message, {
      provedor: 'openai',
      recuperavel,
      status,
      esperarSegundos: cabecalho ? Number(cabecalho) : undefined,
      cause: erro,
    });
  }

  // Timeout e queda de rede chegam aqui, e valem nova tentativa.
  return new ErroProvedor(erro instanceof Error ? erro.message : 'falha ao chamar a OpenAI', {
    provedor: 'openai',
    recuperavel: true,
    cause: erro,
  });
}
