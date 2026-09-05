import { describe, expect, it } from 'vitest';

import { calcularConfiancaParaTeste as calcular } from './agente.ts';

/**
 * Confiança da resposta.
 *
 * Dois defeitos medidos em produção moram aqui, e os dois derrubavam resposta
 * boa em vez de deixar passar resposta ruim — que é a falha menos visível e
 * mais cara: o cliente vê silêncio e ninguém vê erro nenhum no log.
 */
describe('fonte operador', () => {
  it('não é pontuada pelos trechos que a barreira descartou', () => {
    // Em produção: `origem: operador` saiu com 0,3 e virou handoff, porque a
    // conta usava os trechos de conhecimento — que eram justamente os que não
    // sustentavam nada.
    expect(calcular([], 'como a equipe te informou, está 4,99.', 'operador')).toBe(0.75);
  });

  it('fica abaixo do cadastro da unidade', () => {
    expect(calcular([], 'abre às 8h', 'operador')).toBeLessThan(
      calcular([], 'abre às 8h', 'unidades'),
    );
  });
});

describe('detecção de recusa', () => {
  it('a frase de encaminhamento continua sendo recusa', () => {
    const c = calcular([], 'Essa informação eu não tenho confirmada aqui. Vou chamar alguém da equipe.', 'unidades');
    expect(c).toBeLessThanOrEqual(0.3);
  });

  it('atribuir à equipe não é recusa', () => {
    // A palavra "equipe" aparece nos dois casos, e eles são opostos. Antes,
    // atribuir corretamente a fonte capava a confiança da própria resposta.
    expect(calcular([], 'Como a equipe te informou, o cuscuz está 4,99.', 'unidades')).toBe(0.8);
  });

  it('texto vazio não tem confiança', () => {
    expect(calcular([], '', 'unidades')).toBe(0);
  });
});
