import { describe, expect, it } from 'vitest';

import { avisoParaEspera } from './atendimento.ts';

/**
 * O que o cliente lê quando a Bia não sabe responder.
 *
 * Vem de uma reclamação concreta sobre o produto em uso: a Bia avisava uma vez
 * que ia chamar a equipe e, a partir daí, **calava** nas perguntas que não
 * sabia. Do lado do cliente isso é indistinguível de ter sido ignorado — e ele
 * fica mandando mensagem no vazio até alguém da equipe aparecer.
 *
 * A regra tem que equilibrar duas coisas opostas: nunca calar, e não repetir a
 * mesma frase como um robô travado.
 */
describe('escalada dos avisos de espera', () => {
  it('a primeira vez explica e convida a continuar perguntando', () => {
    const t = avisoParaEspera(0);
    expect(t).toMatch(/não tenho confirmada/i);
    expect(t).toMatch(/chamei alguém da equipe/i);
    // O convite é o ponto: a frase anterior terminava em ponto final e
    // encerrava a conversa.
    expect(t).toMatch(/posso ajudar em mais alguma coisa\?/i);
  });

  it('as seguintes reconhecem sem repetir o discurso inteiro', () => {
    for (const n of [1, 2]) {
      const t = avisoParaEspera(n);
      expect(t).toMatch(/também não tenho/i);
      expect(t).toMatch(/equipe já foi avisada/i);
      // Continua se oferecendo enquanto ainda é plausível ajudar.
      expect(t).toMatch(/outra dúvida/i);
    }
  });

  it('depois de muitas, para de oferecer o que não está conseguindo dar', () => {
    const t = avisoParaEspera(3);
    expect(t).toMatch(/aguardar a equipe/i);
    // Insistir em "posso ajudar?" na quarta seguida sem resposta soa desatento.
    expect(t).not.toMatch(/posso ajudar|outra dúvida/i);
  });

  it('continua no último aviso indefinidamente — nunca volta ao silêncio', () => {
    for (const n of [4, 10, 50]) {
      expect(avisoParaEspera(n)).toBe(avisoParaEspera(3));
    }
  });

  it('nenhum aviso promete prazo que a equipe não controla', () => {
    // "responde em instantes" é o limite aceitável; nada de "em até X minutos",
    // que seria um compromisso que o produto não tem como cumprir.
    for (const n of [0, 1, 2, 3]) {
      expect(avisoParaEspera(n)).not.toMatch(/\d+\s*(min|hora|dia)/i);
    }
  });
});
