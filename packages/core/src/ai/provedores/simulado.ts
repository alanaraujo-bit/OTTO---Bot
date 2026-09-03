import { createHash } from 'node:crypto';

import {
  type PedidoEmbedding,
  type PedidoGeracao,
  type Provedor,
  type RespostaEmbedding,
  type RespostaGeracao,
} from '../provedor.ts';

/**
 * Provedor determinístico.
 *
 * **Não é um mock que finge ser a OpenAI.** Ele se identifica como `simulado` em
 * toda linha de `ai_runs`, e nenhuma métrica confunde o que ele produziu com
 * atendimento real.
 *
 * Existe por dois motivos legítimos e permanentes:
 *
 * 1. A cadeia inteira — contexto, recuperação, ferramentas, fundamentação,
 *    registro de custo — precisa ser exercitável em teste automatizado, sem
 *    depender de rede, de chave e de uma conta que gasta dinheiro a cada
 *    execução.
 * 2. Enquanto a chave da OpenAI não chega, a construção do resto do produto não
 *    pode parar.
 *
 * A resposta é **derivada do contexto recuperado**, nunca inventada: se a base
 * não trouxe nada, ele devolve a mesma recusa que o modelo real deveria dar. É
 * isso que o torna útil para testar a regra anti-alucinação.
 */

const DIMENSOES = 1536;

export class ProvedorSimulado implements Provedor {
  readonly nome = 'simulado';

  async gerar(pedido: PedidoGeracao): Promise<RespostaGeracao> {
    const ultimaDoCliente =
      [...pedido.mensagens].reverse().find((m) => m.papel === 'usuario')?.conteudo ?? '';

    // O contexto recuperado chega como mensagem de sistema marcada.
    const fundamento = pedido.mensagens
      .filter((m) => m.papel === 'sistema' && m.conteudo.includes('CONHECIMENTO'))
      .map((m) => m.conteudo)
      .join('\n');

    const trechos = extrairTrechos(fundamento);
    const texto = trechos.length
      ? responderCom(trechos, ultimaDoCliente)
      : 'Essa eu não sei responder com segurança. Posso chamar alguém da equipe para te ajudar?';

    const tokensEntrada = Math.ceil(
      pedido.mensagens.reduce((soma, m) => soma + m.conteudo.length, 0) / 4,
    );

    return {
      texto,
      chamadas: [],
      uso: {
        tokensEntrada,
        tokensSaida: Math.ceil(texto.length / 4),
        tokensCacheados: 0,
      },
      motivoParada: 'parou',
    };
  }

  /**
   * Vetor determinístico derivado do texto por hash.
   *
   * Não tem semântica — textos parecidos não ficam próximos. É deliberado: serve
   * para exercitar a mecânica (dimensão certa, índice HNSW, gravação, fusão de
   * resultados) sem fingir qualidade que não existe. Com este provedor, quem faz
   * o trabalho de recuperação é a busca textual.
   */
  async embutir(pedido: PedidoEmbedding): Promise<RespostaEmbedding> {
    const vetores = pedido.textos.map((texto) => {
      const semente = createHash('sha256').update(texto).digest();
      const vetor = new Array<number>(DIMENSOES);

      for (let i = 0; i < DIMENSOES; i++) {
        const b = semente[i % semente.length]!;
        vetor[i] = (b / 255) * 2 - 1;
      }

      // Normaliza: a distância de cosseno pressupõe vetores unitários.
      const norma = Math.hypot(...vetor) || 1;
      return vetor.map((v) => v / norma);
    });

    return {
      vetores,
      uso: { tokensEntrada: Math.ceil(pedido.textos.join('').length / 4) },
    };
  }

  /** Zero. Sem custo real, e nenhum relatório deve somar despesa por teste. */
  custoMicroUsd(): number {
    return 0;
  }
}

function extrairTrechos(bloco: string): string[] {
  return bloco
    .split(/\n---\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !t.startsWith('CONHECIMENTO'));
}

/**
 * Monta a resposta a partir do que foi recuperado.
 *
 * Pega a frase do trecho com mais palavras em comum com a pergunta. Grosseiro de
 * propósito: o objetivo é provar que a resposta veio do conhecimento da empresa,
 * não simular fluência.
 */
function responderCom(trechos: string[], pergunta: string): string {
  const palavras = new Set(
    pergunta
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/\W+/)
      .filter((p) => p.length > 3),
  );

  const frases = trechos
    .flatMap((t) => t.split('\n').slice(1).join(' ').split(/(?<=[.!?])\s+/))
    .map((f) => f.trim())
    .filter((f) => f.length > 20);

  if (frases.length === 0) return trechos[0]!.split('\n').slice(1).join(' ').trim();

  const pontuar = (frase: string) => {
    const normalizada = frase
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    let pontos = 0;
    for (const p of palavras) if (normalizada.includes(p)) pontos++;
    return pontos;
  };

  const melhor = [...frases].sort((a, b) => pontuar(b) - pontuar(a))[0]!;
  return melhor;
}
