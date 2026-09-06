import { describe, expect, it } from 'vitest';

import { ehCortesia } from './sinais.ts';

/**
 * O agrupamento por intenção juntou "Boa noite" e "Boa tarde" a 0,792 em
 * produção — resíduo de antes de o atendimento interceptar cortesia. Está
 * certo: como intenção, os dois *são* a mesma coisa. O defeito é o cumprimento
 * ter virado sinal de aprendizado, e é isso que a guarda impede na entrada.
 */
describe('cortesia nunca vira aprendizado', () => {
  it('descarta cumprimento, agradecimento e despedida', () => {
    for (const texto of ['Boa noite', 'boa tarde!', 'Oi', 'obrigado 😊', 'Tchau', 'ok, valeu']) {
      expect(ehCortesia(texto), texto).toBe(true);
    }
  });

  it('mantém pergunta de verdade, mesmo precedida de cumprimento', () => {
    for (const texto of [
      'Boa tarde, vocês entregam no bairro?',
      'aceita pix?',
      'qual o horário de funcionamento',
    ]) {
      expect(ehCortesia(texto), texto).toBe(false);
    }
  });

  it('não descarta sinal sem pergunta', () => {
    // Sem texto não há como classificar — e um sinal sem pergunta ainda é um
    // fato observado que vale gravar.
    expect(ehCortesia(null)).toBe(false);
    expect(ehCortesia(undefined)).toBe(false);
    expect(ehCortesia('')).toBe(false);
  });
});
