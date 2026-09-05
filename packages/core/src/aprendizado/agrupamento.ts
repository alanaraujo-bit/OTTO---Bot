/**
 * Agrupamento de perguntas sem resposta por intenção.
 *
 * ## Por que o agrupamento por texto não servia
 *
 * A versão anterior agrupava por `GROUP BY query_text`, onde `query_text` é a
 * pergunta reduzida a um saco de palavras ordenado. Duas formas da mesma
 * demanda viram chaves diferentes:
 *
 *   "Que horas vocês abrem no domingo?"  →  abrem domingo horas que voces
 *   "Domingo abre que horas?"            →  abre domingo horas que
 *
 * `abrem` ≠ `abre`, e contam como duas perguntas distintas. Como só vira
 * sugestão a partir de três ocorrências, o efeito prático foi o aprendizado
 * **nunca sair do lugar**: em produção, 19 sinais gravados e zero sugestões,
 * com todas as perguntas contando 1×.
 *
 * É a mesma fragilidade de flexão que a recuperação já tinha, resolvida lá com
 * trigrama e semântica. Aqui a solução é semântica pura: agrupar perguntas cujo
 * significado é o mesmo, mesmo sem compartilhar palavra nenhuma — "Tem
 * delivery?" e "Vocês entregam em casa?" são a mesma demanda.
 *
 * ## Por que 0,65
 *
 * Medido por `packages/db/scripts/calibrar-agrupamento.mjs` sobre perguntas
 * reais dos sinais de produção. A escala do cosseno **entre perguntas** não é a
 * do fundamento (pergunta contra trecho), então o limiar de lá não serve
 * emprestado.
 *
 * A medição mostrou que **não existe separação perfeita**: "Vocês passam cartão
 * aí?" e "Vocês fazem desconto?" ficam em 0,647 sendo assuntos diferentes,
 * acima de vários pares da mesma intenção. Como não dá para acertar os dois
 * lados, a escolha é sobre qual erro custa mais:
 *
 * | limiar | junta certo | junta errado |
 * | 0,55   | 22/31       | 3/159        |
 * | 0,60   | 22/31       | 2/159        |
 * | 0,65   | 17/31       | **0/159**    |
 *
 * Juntar errado produz sugestão que mistura assuntos; o administrador
 * desconfia da fila e para de olhar — a mesma falha que o mínimo de ocorrências
 * já existe para evitar. Juntar de menos só atrasa a sugestão. A assimetria
 * decide.
 */

/** Cosseno a partir do qual duas perguntas são a mesma demanda. */
export const SIMILARIDADE_DE_INTENCAO = 0.65;

export interface PerguntaParaAgrupar {
  /** Identificador do sinal. */
  id: string;
  /** O que o cliente escreveu, como escreveu. */
  texto: string;
  /** Chave normalizada — usada quando não há embedding. */
  chave: string;
  em: Date;
  conversationId: string | null;
}

export interface GrupoDeIntencao {
  /** A pergunta que dá nome ao grupo — a primeira vista. */
  representante: PerguntaParaAgrupar;
  membros: PerguntaParaAgrupar[];
}

export function cosseno(a: number[], b: number[]): number {
  let produto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    produto += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : produto / d;
}

/**
 * Agrupa perguntas por intenção.
 *
 * Guloso e comparando sempre contra o **representante** do grupo, nunca contra
 * qualquer membro. Comparar com qualquer membro permitiria encadeamento: A
 * parecido com B, B parecido com C, e C acaba no mesmo grupo de A sem se
 * parecer com A. Num agrupamento que vira sugestão para uma pessoa revisar,
 * esse arrasto produz exatamente a sugestão confusa que o limiar alto evita.
 *
 * Sem `embeddings`, cai no agrupamento por chave normalizada — o comportamento
 * antigo. Degradação, não falha: sem o provedor de vetor o aprendizado fica
 * mais lento, não quebrado.
 */
export function agruparPorIntencao(
  perguntas: PerguntaParaAgrupar[],
  embeddings: Map<string, number[]> | null,
  limiar = SIMILARIDADE_DE_INTENCAO,
): GrupoDeIntencao[] {
  const grupos: GrupoDeIntencao[] = [];

  for (const p of perguntas) {
    const vetor = embeddings?.get(p.id);

    const alvo = grupos.find((g) => {
      if (!embeddings || !vetor) return g.representante.chave === p.chave;

      const vetorRep = embeddings.get(g.representante.id);
      // Representante sem vetor: cai na comparação por chave para esse grupo,
      // em vez de nunca casar.
      if (!vetorRep) return g.representante.chave === p.chave;

      return cosseno(vetor, vetorRep) >= limiar;
    });

    if (alvo) alvo.membros.push(p);
    else grupos.push({ representante: p, membros: [p] });
  }

  // Maior primeiro: a fila de revisão tem que abrir no que mais gente perguntou.
  return grupos.sort((a, b) => b.membros.length - a.membros.length);
}
