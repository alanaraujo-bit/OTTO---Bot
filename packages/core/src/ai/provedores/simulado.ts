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

    // Pelo marcador estrutural, nunca pelo conteúdo: a instrução do agente
    // menciona a palavra CONHECIMENTO ao proibir o modelo de sair dela, e um
    // filtro por string chegou a mandar uma frase da instrução para o cliente
    // como se fosse resposta.
    const fundamento = pedido.mensagens
      .filter((m) => m.marcador === 'conhecimento')
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

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Monta a resposta a partir do que foi recuperado.
 *
 * Escolhe a frase do conhecimento que mais responde à pergunta, e a pontuação
 * pesa **raridade**: uma palavra que aparece em uma frase só vale muito mais que
 * uma que aparece em todas.
 *
 * Sem isso, "vocês aceitam pix?" premiava qualquer frase com "aceitamos" — e o
 * cliente que perguntou sobre PIX recebia a frase sobre vale-alimentação, porque
 * as duas contêm o verbo. Grosseiro é aceitável aqui; errado não.
 */
function responderCom(trechos: string[], pergunta: string): string {
  const termos = [
    ...new Set(normalizar(pergunta).split(/\W+/).filter((p) => p.length > 2)),
  ];

  // Cada candidato é uma unidade de resposta independente: uma frase de um item
  // de conhecimento, ou uma linha de fato de uma unidade ("Funcionamento hoje:
  // 07:00 às 21:00"). Tratar o bloco inteiro como um texto só faria o cliente
  // que perguntou o horário receber também endereço e telefone.
  const frases = trechos.flatMap((trecho) => {
    const linhas = trecho
      .split('\n')
      .map((l) => l.trim())
      // Metadado de indexação, não resposta ao cliente.
      .filter((l) => l && !/^\(também perguntado como:/i.test(l));

    const [cabecalho, ...resto] = linhas;

    return resto.flatMap((linha) =>
      // Fato de unidade já é atômico; texto corrido precisa ser quebrado.
      /^[A-ZÀ-Ú][a-zà-ú ]+:/.test(linha)
        ? [`${cabecalho ? `${cabecalho} — ` : ''}${linha}`]
        : linha.split(/(?<=[.!?])\s+/),
    );
  });

  const candidatos = frases.map((f) => f.trim()).filter((f) => f.length > 12);
  if (candidatos.length === 0) return trechos[0]?.split('\n').slice(1).join(' ').trim() ?? '';

  // Em quantas frases cada termo aparece — a base da raridade.
  const ocorrencias = new Map<string, number>();
  for (const termo of termos) {
    ocorrencias.set(termo, candidatos.filter((f) => normalizar(f).includes(termo)).length);
  }

  const pontuar = (frase: string) => {
    const texto = normalizar(frase);
    let pontos = 0;
    for (const termo of termos) {
      if (!texto.includes(termo)) continue;
      const em = ocorrencias.get(termo) ?? candidatos.length;
      // Termo presente em todas as frases não distingue nada; peso ~1.
      // Termo presente em uma só é o que a pergunta realmente busca.
      pontos += candidatos.length / em;
    }
    return pontos;
  };

  return [...candidatos].sort((a, b) => pontuar(b) - pontuar(a))[0]!;
}
