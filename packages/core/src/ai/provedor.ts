/**
 * Contrato de fornecedor de IA.
 *
 * Nada em `@otto/core` importa um SDK de fornecedor. Trocar de modelo, misturar
 * fornecedores por tarefa ou cair para um alternativo é implementar esta
 * interface — o domínio não muda.
 *
 * O contrato existe também pela contabilidade: se qualquer parte do código
 * pudesse chamar um modelo direto, o custo por empresa deixaria de fechar.
 */

export interface MensagemChat {
  papel: 'sistema' | 'usuario' | 'assistente' | 'ferramenta';
  conteudo: string;
  /** Preenchido quando `papel` é `ferramenta`. */
  nomeFerramenta?: string;
  chamadaId?: string;
}

export interface DefinicaoFerramenta {
  nome: string;
  descricao: string;
  /** JSON Schema dos argumentos. */
  parametros: Record<string, unknown>;
}

export interface ChamadaFerramenta {
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
}

export interface PedidoGeracao {
  modelo: string;
  mensagens: MensagemChat[];
  ferramentas?: DefinicaoFerramenta[];
  /** Baixa para fato, mais alta para conversa. Nunca acima de 0,7 aqui. */
  temperatura?: number;
  maxTokens?: number;
}

export interface RespostaGeracao {
  texto: string | null;
  chamadas: ChamadaFerramenta[];
  uso: {
    tokensEntrada: number;
    tokensSaida: number;
    tokensCacheados: number;
  };
  /** `parou`, `limite_tokens`, `ferramenta`, `filtrado`. */
  motivoParada: string;
}

export interface PedidoEmbedding {
  modelo: string;
  textos: string[];
}

export interface RespostaEmbedding {
  vetores: number[][];
  uso: { tokensEntrada: number };
}

export interface Provedor {
  /** `openai`, `anthropic`, `simulado`. Vai para `ai_runs.provider`. */
  readonly nome: string;
  gerar(pedido: PedidoGeracao): Promise<RespostaGeracao>;
  embutir(pedido: PedidoEmbedding): Promise<RespostaEmbedding>;
  /** Micro-dólares. Preços por modelo vivem no adaptador do fornecedor. */
  custoMicroUsd(modelo: string, uso: { entrada: number; saida: number; cacheados?: number }): number;
}

/** Erro do fornecedor, com a informação que a orquestração precisa para decidir. */
export class ErroProvedor extends Error {
  constructor(
    message: string,
    readonly detalhes: {
      provedor: string;
      /** Se tentar de novo pode dar certo: instabilidade, limite de taxa. */
      recuperavel: boolean;
      status?: number;
      /** Segundos sugeridos pelo fornecedor antes de nova tentativa. */
      esperarSegundos?: number;
      cause?: unknown;
    },
  ) {
    super(message, detalhes.cause !== undefined ? { cause: detalhes.cause } : undefined);
    this.name = 'ErroProvedor';
  }
}
