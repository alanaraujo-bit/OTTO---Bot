import { describe, expect, it } from 'vitest';

import { temFundamento } from './recuperacao.ts';

describe('temFundamento', () => {
  it('não afrouxa a cobertura quando texto e vetor corroboram o mesmo trecho', () => {
    // O vetor sempre retorna um vizinho. Portanto, "ambos" só melhora o
    // ranking; não pode transformar uma coincidência textual insuficiente em
    // fundamento para responder ao cliente.
    expect(
      temFundamento([
        {
          itemId: 'item',
          chunkId: 'chunk',
          titulo: 'Conhecimento sem relação',
          conteudo: 'Vendemos alimentos.',
          tipo: 'pergunta_frequente',
          escore: 1 / 61 + 1 / 62,
          origem: 'ambos',
          cobertura: 0.4,
        },
      ]),
    ).toBe(false);
  });
});
