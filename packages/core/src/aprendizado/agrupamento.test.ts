import { describe, expect, it } from 'vitest';

import { agruparPorIntencao, SIMILARIDADE_DE_INTENCAO } from './agrupamento.ts';
import type { PerguntaParaAgrupar } from './agrupamento.ts';

/**
 * O aprendizado do produto parou aqui, e o número é constrangedor: 19 sinais
 * gravados em produção, **zero** sugestões. Não porque faltasse volume — porque
 * o agrupamento casava saco de palavras, e "abrem" não é "abre".
 */

const p = (id: string, texto: string, chave = texto): PerguntaParaAgrupar => ({
  id,
  texto,
  chave,
  em: new Date(`2026-09-0${id}T12:00:00Z`),
  conversationId: `c${id}`,
});

/** Vetores sintéticos: o que importa é a geometria, não o modelo. */
const vetor = (angulo: number) => [Math.cos(angulo), Math.sin(angulo), 0];
const proximos = new Map<string, number[]>([
  ['1', vetor(0)],
  ['2', vetor(0.1)],
  ['3', vetor(0.2)],
]);

describe('agrupamento por intenção', () => {
  it('junta perguntas parecidas mesmo com palavras diferentes', () => {
    const grupos = agruparPorIntencao(
      [p('1', 'Que horas abre?'), p('2', 'Qual o horário?'), p('3', 'Abre que horas?')],
      proximos,
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.membros).toHaveLength(3);
  });

  it('separa intenções distantes', () => {
    const distantes = new Map([
      ['1', vetor(0)],
      ['2', vetor(Math.PI / 2)],
    ]);
    const grupos = agruparPorIntencao([p('1', 'Que horas abre?'), p('2', 'Tem entrega?')], distantes);
    expect(grupos).toHaveLength(2);
  });

  /**
   * O encadeamento é o modo clássico de um agrupamento guloso apodrecer: A
   * parecido com B, B com C, e C acaba junto de A sem se parecer com A. Numa
   * sugestão que uma pessoa vai revisar, isso vira uma fila de assuntos
   * misturados — e o revisor para de confiar nela.
   */
  it('não encadeia: compara sempre contra o representante', () => {
    const cadeia = new Map([
      ['1', vetor(0)],
      ['2', vetor(0.8)], // longe de 1
      ['3', vetor(1.6)], // perto de 2, muito longe de 1
    ]);
    const grupos = agruparPorIntencao([p('1', 'a'), p('2', 'b'), p('3', 'c')], cadeia, 0.9);
    expect(grupos.every((g) => g.membros.length === 1)).toBe(true);
  });

  it('sem embedding, cai no agrupamento por chave — degradação, não falha', () => {
    const grupos = agruparPorIntencao(
      [p('1', 'Aceita pix?', 'aceita pix'), p('2', 'ACEITA PIX', 'aceita pix'), p('3', 'Tem entrega?', 'entrega tem')],
      null,
    );
    expect(grupos[0]!.membros).toHaveLength(2);
    expect(grupos).toHaveLength(2);
  });

  it('ordena do maior grupo para o menor — a fila abre no que mais gente perguntou', () => {
    const v = new Map([
      ['1', vetor(0)],
      ['2', vetor(0.05)],
      ['3', vetor(0.1)],
      ['4', vetor(Math.PI / 2)],
    ]);
    const grupos = agruparPorIntencao([p('1', 'a'), p('2', 'b'), p('3', 'c'), p('4', 'z')], v);
    expect(grupos[0]!.membros.length).toBeGreaterThan(grupos[1]!.membros.length);
  });

  it('o limiar veio de medição, não de memória', () => {
    // Documentado em `agrupamento.ts` e reproduzível por
    // `packages/db/scripts/calibrar-agrupamento.mjs`.
    expect(SIMILARIDADE_DE_INTENCAO).toBe(0.65);
  });
});
