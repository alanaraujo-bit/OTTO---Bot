import { describe, expect, it } from 'vitest';

import { temFundamento, type TrechoRecuperado } from './recuperacao.ts';

const trecho = (over: Partial<TrechoRecuperado> = {}): TrechoRecuperado => ({
  itemId: 'item',
  chunkId: 'chunk',
  titulo: 'Conhecimento sem relação',
  conteudo: 'Vendemos alimentos.',
  tipo: 'pergunta_frequente',
  escore: 1 / 61 + 1 / 62,
  origem: 'ambos',
  similaridade: null,
  trigrama: 0,
  cobertura: 0.4,
  ...over,
});

describe('temFundamento', () => {
  /**
   * Esta expectativa mudou de razão, não de valor.
   *
   * Antes, o motivo de reprovar era estrutural: aparecer nas duas listas
   * ("ambos") nunca podia baixar a barra lexical, porque a busca vetorial
   * devolve um vizinho para qualquer pergunta e a ordem não distingue vizinho
   * próximo de vizinho distante.
   *
   * Agora a distância é medida, então a corroboração pode contar — mas só
   * quando ela é **forte**. Este trecho continua reprovando porque 0,28 está na
   * faixa medida das perguntas sem fonte (0,244–0,326), que é exatamente o
   * vizinho incidental que o teste original protegia.
   */
  it('vizinho vetorial incidental não vira fundamento', () => {
    expect(temFundamento([trecho({ similaridade: 0.28 })])).toBe(false);
  });

  it('sem embedding, cobertura insuficiente continua reprovando', () => {
    expect(temFundamento([trecho({ similaridade: null })])).toBe(false);
  });

  /**
   * O outro lado da mesma regra, e a razão da mudança: uma pergunta que a base
   * responde não pode ser recusada por flexão ou sinônimo. "Que horas vocês
   * abrem no domingo?" mede 0,25 de cobertura contra o item de horário — porque
   * `horas`/`horário` e `abrem`/`abre` não compartilham raiz — e 0,594 de
   * similaridade. Antes era recusada; agora responde.
   */
  it('semântica forte com corroboração lexical fundamenta', () => {
    expect(
      temFundamento([
        trecho({
          titulo: 'Horário de funcionamento',
          cobertura: 0.25,
          similaridade: 0.594,
        }),
      ]),
    ).toBe(true);
  });
});
