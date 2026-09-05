import { describe, expect, it } from 'vitest';

import { apenasCortesia, respostaDeCortesia, saudacaoDoMomento } from './social.ts';

/**
 * O defeito que originou este arquivo, visto em produção com cliente real:
 * alguém escreveu "Boa tarde" e recebeu "Essa informação eu não tenho
 * confirmada aqui. Vou chamar alguém da equipe para te ajudar." A conversa foi
 * para a fila humana por causa de um cumprimento.
 */

const SO_CORTESIA = [
  'Boa tarde',
  'boa tarde!',
  'Bom dia',
  'Boa noite 😊',
  'oi',
  'Oi!',
  'Olá',
  'Oi, tudo bem?',
  'bom dia, tudo bem?',
  'opa',
  'e aí',
  'Obrigado!',
  'obrigada 🙏',
  'valeu',
  'vlw',
  'ok',
  'Ok, obrigado',
  'entendi',
  'perfeito, obrigado',
  'show',
  'tchau',
  'até logo',
  'Boa semana!',
];

/**
 * O outro lado, e é onde a regra ganha ou perde valor: cumprimento **com**
 * pergunta continua sendo pergunta. Tratar isto como cortesia seria trocar um
 * defeito por outro pior — responder "Boa tarde! Em que posso ajudar?" a quem
 * acabou de perguntar o preço.
 */
const TEM_PERGUNTA = [
  'Boa tarde, quanto custa o arroz?',
  'Oi, vocês entregam no Centro?',
  'bom dia! que horas abre?',
  'Olá, qual o valor da cesta básica?',
  'obrigado, mas e o horário de domingo?',
  'ok e o endereço?',
  'quanto custa?',
  'vocês abrem domingo',
  // Casamento parcial não pode virar cortesia: "sim" dentro de "simulador",
  // "boa" dentro de "boato".
  'simulador',
  'tem boato de promoção?',
];

describe('apenasCortesia', () => {
  for (const t of SO_CORTESIA) {
    it(`reconhece: "${t}"`, () => expect(apenasCortesia(t)).toBe(true));
  }

  for (const t of TEM_PERGUNTA) {
    it(`não reconhece: "${t}"`, () => expect(apenasCortesia(t)).toBe(false));
  }

  it('mensagem vazia não é cortesia', () => {
    expect(apenasCortesia('   ')).toBe(false);
  });

  it('mensagem longa não é cortesia, mesmo começando com uma', () => {
    expect(
      apenasCortesia(
        'boa tarde boa tarde boa tarde boa tarde boa tarde boa tarde boa tarde',
      ),
    ).toBe(false);
  });
});

describe('saudacaoDoMomento', () => {
  // O fuso é o da empresa, não o do servidor: responder "bom dia" às nove da
  // noite denuncia um robô mal-feito, e Belém não é UTC.
  const em = (isoUtc: string) => new Date(isoUtc);

  it('manhã em Belém', () => {
    expect(saudacaoDoMomento(em('2026-09-05T13:00:00Z'), 'America/Belem')).toBe('Bom dia');
  });

  it('tarde em Belém', () => {
    expect(saudacaoDoMomento(em('2026-09-05T18:00:00Z'), 'America/Belem')).toBe('Boa tarde');
  });

  it('noite em Belém', () => {
    expect(saudacaoDoMomento(em('2026-09-05T23:00:00Z'), 'America/Belem')).toBe('Boa noite');
  });

  it('o mesmo instante muda de saudação conforme o fuso', () => {
    const instante = em('2026-09-05T23:00:00Z');
    expect(saudacaoDoMomento(instante, 'America/Belem')).toBe('Boa noite');
    expect(saudacaoDoMomento(instante, 'America/Sao_Paulo')).toBe('Boa noite');
    expect(saudacaoDoMomento(instante, 'Asia/Tokyo')).toBe('Bom dia');
  });
});

describe('respostaDeCortesia', () => {
  const tarde = new Date('2026-09-05T18:00:00Z');

  it('cumprimento abre a conversa e convida a perguntar', () => {
    expect(respostaDeCortesia('Boa tarde', tarde, 'America/Belem')).toBe(
      'Boa tarde! Em que posso ajudar?',
    );
  });

  it('agradecimento não empurra assunto novo', () => {
    expect(respostaDeCortesia('obrigado!', tarde, 'America/Belem')).toContain('Por nada');
  });

  it('despedida fecha sem convidar', () => {
    expect(respostaDeCortesia('tchau', tarde, 'America/Belem')).toContain('Até logo');
  });

  it('nunca afirma fato nenhum — não há o que alucinar', () => {
    for (const t of SO_CORTESIA) {
      const r = respostaDeCortesia(t, tarde, 'America/Belem');
      expect(r).not.toMatch(/\d{1,2}h|R\$|\d+,\d{2}|rua|avenida/i);
    }
  });
});
