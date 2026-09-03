import { describe, expect, it } from 'vitest';

import { horaParaMinutos, inicioDoDiaLocal, minutosParaHora, partesLocais } from './time.ts';

/**
 * Tempo.
 *
 * Este arquivo existe por causa de um bug real: `inicioDoDiaLocal` devolvia
 * meia-noite **UTC** em vez de meia-noite local, e por isso toda métrica diária
 * contava o dia errado — as três últimas horas de movimento de Canaã dos Carajás
 * caíam no dia seguinte.
 *
 * A causa foi `new Date(string)`, que reinterpreta a string no fuso do processo:
 * o resultado ficava certo na máquina de quem escreveu e errado no servidor. Os
 * testes abaixo fixam o comportamento independentemente do fuso da máquina.
 */

describe('início do dia local', () => {
  it('devolve meia-noite no fuso da empresa, não em UTC', () => {
    // 3 de setembro, 00h34 em Belém (UTC-3) — já é dia 3 em UTC também.
    const instante = new Date('2026-09-03T03:34:00Z');
    const inicio = inicioDoDiaLocal(instante, 'America/Belem');

    // Meia-noite em Belém = 03:00 UTC.
    expect(inicio.toISOString()).toBe('2026-09-03T03:00:00.000Z');
  });

  it('mantém o dia da loja quando em UTC já é o dia seguinte', () => {
    // 2 de setembro, 21h30 em Belém. Em UTC já são 00h30 do dia 3.
    const instante = new Date('2026-09-03T00:30:00Z');

    expect(partesLocais(instante, 'America/Belem').dataISO).toBe('2026-09-02');

    const inicio = inicioDoDiaLocal(instante, 'America/Belem');
    // O dia da loja começou às 00h de 2 de setembro, ou seja, 03:00Z.
    expect(inicio.toISOString()).toBe('2026-09-02T03:00:00.000Z');
  });

  it('acerta o deslocamento em fuso com horário de verão', () => {
    // Lisboa em julho está em UTC+1.
    const verao = inicioDoDiaLocal(new Date('2026-07-15T12:00:00Z'), 'Europe/Lisbon');
    expect(verao.toISOString()).toBe('2026-07-14T23:00:00.000Z');

    // Em janeiro, UTC+0.
    const inverno = inicioDoDiaLocal(new Date('2026-01-15T12:00:00Z'), 'Europe/Lisbon');
    expect(inverno.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('o instante devolvido pertence ao mesmo dia local', () => {
    for (const fuso of ['America/Belem', 'America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      const agora = new Date();
      const inicio = inicioDoDiaLocal(agora, fuso);

      expect(partesLocais(inicio, fuso).dataISO).toBe(partesLocais(agora, fuso).dataISO);
      expect(partesLocais(inicio, fuso).minutosDoDia).toBe(0);
      expect(inicio.getTime()).toBeLessThanOrEqual(agora.getTime());
    }
  });
});

describe('partes locais', () => {
  it('lê a hora no fuso pedido', () => {
    const instante = new Date('2026-09-03T03:34:00Z');
    const belem = partesLocais(instante, 'America/Belem');

    expect(belem.dataISO).toBe('2026-09-03');
    expect(belem.hora).toBe(0);
    expect(belem.minuto).toBe(34);
    expect(belem.minutosDoDia).toBe(34);
    // 3 de setembro de 2026 é uma quinta-feira.
    expect(belem.diaDaSemana).toBe(4);
  });

  it('trata meia-noite como hora zero, não como 24', () => {
    const meiaNoite = partesLocais(new Date('2026-09-03T03:00:00Z'), 'America/Belem');
    expect(meiaNoite.hora).toBe(0);
    expect(meiaNoite.minutosDoDia).toBe(0);
  });
});

describe('horário de funcionamento', () => {
  it('converte hora em minutos e de volta', () => {
    expect(horaParaMinutos('07:00')).toBe(420);
    expect(horaParaMinutos('21:30')).toBe(1290);
    expect(minutosParaHora(420)).toBe('07:00');
    expect(minutosParaHora(1290)).toBe('21:30');
  });

  it('recusa hora malformada em vez de inventar um valor', () => {
    expect(horaParaMinutos('25:00')).toBeNull();
    expect(horaParaMinutos('7h')).toBeNull();
    expect(horaParaMinutos('')).toBeNull();
  });
});
