import { describe, expect, it } from 'vitest';

import { avaliarFundamento } from './fundamento.ts';
import type { ContextoEmpresa } from './personalidade.ts';

/**
 * A hierarquia de autoridade contextual.
 *
 * Quatro fontes podem sustentar uma resposta, e a ordem entre elas não é
 * estética — decide qual informação o cliente recebe quando duas discordam:
 *
 * 1. cadastro da empresa (unidades: horário, endereço, telefone)
 * 2. conhecimento oficial publicado
 * 3. o que a equipe disse **nesta conversa**
 * 4. o que o próprio cliente disse (nunca sustenta — é o que se quer responder)
 *
 * A terceira existe por um defeito medido em produção: um operador respondeu "o
 * cuscuz está 4,99" e, quarenta segundos depois, a Bia ofereceu chamar a equipe
 * para a mesma pergunta.
 */

const SEM_UNIDADES: ContextoEmpresa = {
  nome: 'Teste',
  unidades: [],
  foraDeHorario: false,
};

const COM_UNIDADE: ContextoEmpresa = {
  ...SEM_UNIDADES,
  unidades: [
    {
      nome: 'Loja',
      endereco: 'Rua A, 1',
      telefone: null,
      horarioHoje: '08:00 às 20:00',
      abertoAgora: true,
    },
  ],
};

describe('hierarquia de autoridade', () => {
  it('cadastro e base juntos ganham de tudo', () => {
    expect(avaliarFundamento('que horas abre?', [], COM_UNIDADE, true, true)).toBe('ambos');
  });

  it('a base oficial ganha da fala da equipe', () => {
    // O caso que a ordem protege: um operador digitou um horário errado, e o
    // cadastro tem o certo. Quem vale é o cadastro.
    expect(avaliarFundamento('quanto custa?', [], SEM_UNIDADES, true, true)).toBe('conhecimento');
  });

  it('o cadastro da unidade ganha da fala da equipe', () => {
    expect(avaliarFundamento('que horas abre?', [], COM_UNIDADE, false, true)).toBe('unidades');
  });

  it('a fala da equipe sustenta quando não há fonte oficial', () => {
    expect(avaliarFundamento('quanto custa o cuscuz?', [], SEM_UNIDADES, false, true)).toBe(
      'operador',
    );
  });

  it('sem nenhuma fonte, encaminha', () => {
    expect(avaliarFundamento('quanto custa o cuscuz?', [], SEM_UNIDADES, false, false)).toBe(
      'nenhum',
    );
  });

  it('a fala da equipe é opcional — chamadas antigas seguem valendo', () => {
    expect(avaliarFundamento('quanto custa?', [], SEM_UNIDADES, false)).toBe('nenhum');
  });
});
