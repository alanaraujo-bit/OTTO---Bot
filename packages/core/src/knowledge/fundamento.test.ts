import { describe, expect, it } from 'vitest';

import { decidirTrecho, temFundamento, trechoQueSustenta } from './recuperacao.ts';
import type { TrechoRecuperado } from './recuperacao.ts';

/**
 * A barreira anti-alucinação, em tabela.
 *
 * Os números não são inventados: cada linha é uma medição real feita por
 * `packages/db/scripts/calibrar-fundamento.mjs` contra a base publicada em
 * produção, com `text-embedding-3-small`. O teste congela a decisão que aqueles
 * pares (cobertura, similaridade) devem produzir.
 *
 * A regra que estas linhas defendem tem dois lados, e os dois importam igual:
 * uma informação que a empresa **tem** não pode ser recusada porque o cliente
 * conjugou o verbo diferente, disse "bom dia" antes ou usou sinônimo; e uma
 * informação que a empresa **não tem** não pode ser respondida por parecença
 * semântica vaga.
 */

const trecho = (
  cobertura: number,
  similaridade: number | null,
  titulo = 'Horário de funcionamento',
): TrechoRecuperado => ({
  itemId: 'i1',
  chunkId: `c-${titulo}-${cobertura}-${similaridade}`,
  titulo,
  conteudo: '…',
  tipo: 'fato',
  escore: 0.016,
  origem: 'ambos',
  similaridade,
  trigrama: 0,
  cobertura,
});

/**
 * Variantes reais da mesma intenção: "quando a loja abre no domingo?".
 *
 * Todas devem chegar à mesma informação oficial. Antes desta mudança, só a
 * segunda e a quarta passavam — as outras eram recusadas por flexão (`abrem`
 * não stemiza para `abre`), por sinônimo (`horas` vira `hor`, `horário` vira
 * `horari`) ou por cumprimento inflando o denominador.
 */
const VARIANTES_DE_HORARIO: Array<[string, number, number]> = [
  ['Que horas vocês abrem no domingo?', 0.25, 0.594],
  ['Qual o horário de domingo?', 0.5, 0.581],
  ['Oi, bom dia, vocês funcionam domingo?', 0.667, 0.514],
  ['Domingo abre que horas?', 0.667, 0.52],
  ['Vocês ficam abertos domingo?', 0.25, 0.481],
  ['Oiê, bom dia! Que horas vocês abrem no domingo?', 0.25, 0.535],
];

/**
 * Perguntas sem fonte. Não existe preço, estoque nem promoção na plataforma —
 * o adaptador do CISS é um contrato de ferramenta ainda não implementado (B4).
 * Enquanto não existir, inventar um preço é o pior desfecho possível.
 *
 * Note a cobertura zero em todas: nenhuma divide um único termo significativo
 * com a base. É a assimetria em que a corroboração se apoia.
 */
const SEM_FONTE: Array<[string, number, number]> = [
  ['Quanto está o arroz?', 0, 0.244],
  ['Tem promoção de arroz hoje?', 0, 0.295],
  ['Quanto custa o quilo do arroz?', 0, 0.244],
  ['Vocês aceitam cartão?', 0, 0.326],
  ['Vendem pneu de caminhão?', 0, 0.31],
];

describe('variantes linguísticas da mesma pergunta', () => {
  for (const [pergunta, cobertura, similaridade] of VARIANTES_DE_HORARIO) {
    it(`fundamenta: ${pergunta}`, () => {
      expect(decidirTrecho(cobertura, similaridade)).not.toBeNull();
    });
  }

  it('todas as variantes chegam ao mesmo item', () => {
    const motivos = VARIANTES_DE_HORARIO.map(([, c, s]) => decidirTrecho(c, s));
    expect(motivos.every((m) => m !== null)).toBe(true);
  });
});

describe('perguntas sem fonte', () => {
  for (const [pergunta, cobertura, similaridade] of SEM_FONTE) {
    it(`recusa: ${pergunta}`, () => {
      expect(decidirTrecho(cobertura, similaridade)).toBeNull();
    });
  }
});

describe('nenhum sinal isolado autoriza', () => {
  it('semântica forte sem nenhum termo em comum não basta', () => {
    // O caso que a corroboração existe para barrar: a busca vetorial sempre
    // devolve um vizinho, e sem esta regra o mais próximo viraria resposta.
    expect(decidirTrecho(0, 0.95)).toBeNull();
  });

  it('um termo em comum com semântica fraca não basta', () => {
    expect(decidirTrecho(0.25, 0.2)).toBeNull();
  });

  it('sem embedding, o léxico continua valendo sozinho', () => {
    // Degradação, não falha: se o provedor de embedding cair, uma pergunta com
    // casamento lexical forte segue sendo respondida.
    expect(decidirTrecho(0.75, null)).toBe('lexico');
  });

  it('sem embedding, o léxico fraco não vira resposta', () => {
    expect(decidirTrecho(0.25, null)).toBeNull();
  });
});

/**
 * A irregularidade do stemmer, medida contra o banco real.
 *
 * `feriado` reduz a `feri` e `feriados` a `feriad`. Singular e plural da mesma
 * palavra não casam, e a pergunta mais óbvia possível contra um item chamado
 * "Funcionamento em feriados" tinha cobertura **zero**. Sem o trigrama, a
 * corroboração lexical reintroduziria a fragilidade que ela deveria remover.
 */
describe('corroboração por trigrama, quando o stemmer falha', () => {
  it('"Vocês abrem no feriado?" responde apesar de cobertura zero', () => {
    // cob 0,000 (feri × feriad) · sim 0,592 · trg 0,800
    expect(decidirTrecho(0, 0.592, 0.8)).toBe('semantico_corroborado');
  });

  it('"Vendem pneu de caminhão?" continua recusada mesmo com trigrama alto', () => {
    // trg 0,800 vem de "vendem" × "vendemos" — parentesco acidental. Quem barra
    // é a semântica: 0,301 está na faixa das perguntas sem fonte.
    expect(decidirTrecho(0.333, 0.301, 0.8)).toBeNull();
  });

  it('trigrama alto com semântica forte mas sem nada em comum não é possível por construção', () => {
    // Trigrama baixo e cobertura zero: nada corrobora, e não há resposta.
    expect(decidirTrecho(0, 0.592, 0.5)).toBeNull();
  });
});

describe('trechoQueSustenta', () => {
  it('acha o trecho que autoriza mesmo fora da primeira posição', () => {
    // Exatamente a falha do desenho anterior: o primeiro colocado da fusão é um
    // trecho fraco, e o que responde a pergunta está atrás dele.
    const trechos = [
      trecho(0.1, 0.3, 'Estacionamento'),
      trecho(0.667, 0.514, 'Horário de funcionamento'),
    ];
    const achado = trechoQueSustenta(trechos);
    expect(achado?.trecho.titulo).toBe('Horário de funcionamento');
    expect(achado?.motivo).toBe('lexico');
  });

  it('devolve null quando nenhum trecho autoriza', () => {
    const trechos = [trecho(0, 0.244, 'Contato'), trecho(0, 0.295, 'Entrega')];
    expect(trechoQueSustenta(trechos)).toBeNull();
    expect(temFundamento(trechos)).toBe(false);
  });

  it('registra o motivo semântico quando foi a semântica que sustentou', () => {
    const achado = trechoQueSustenta([trecho(0.25, 0.594)]);
    expect(achado?.motivo).toBe('semantico_corroborado');
  });

  it('lista vazia não fundamenta', () => {
    expect(temFundamento([])).toBe(false);
    expect(trechoQueSustenta([])).toBeNull();
  });
});
