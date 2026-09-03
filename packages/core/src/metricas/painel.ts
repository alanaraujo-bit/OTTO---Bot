import { conversations, gte, messages, sql, withTenant } from '@otto/db';
import { inicioDoDiaLocal } from '@otto/shared';

/**
 * Séries para o painel inicial.
 *
 * Duas leituras que a Home usa e a Análise não: a série dos últimos N dias com
 * dia da semana já resolvido (para marcar fim de semana no gráfico) e a
 * distribuição por hora do dia. A segunda responde a uma pergunta operacional
 * real do §Operating Context — "quando preciso ter alguém pronto?" — e por isso
 * mora aqui, não em `analytics.ts`, que é sobre período fechado.
 */

export interface DiaDaSerie extends Record<string, unknown> {
  data: string;
  conversas: number;
  mensagens: number;
  /** 0 = domingo … 6 = sábado. Resolvido no fuso da empresa. */
  diaSemana: number;
}

/** Série diária dos últimos `dias` dias, terminando hoje (dia local da empresa). */
export async function serieUltimosDias(
  tenantId: string,
  fuso: string,
  dias = 14,
): Promise<DiaDaSerie[]> {
  const fim = new Date();
  const inicio = new Date(inicioDoDiaLocal(fim, fuso).getTime() - (dias - 1) * 86_400_000);

  return withTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<DiaDaSerie>(sql`
      with dias as (
        select generate_series(
          ${inicio}::timestamptz at time zone ${fuso},
          ${fim}::timestamptz at time zone ${fuso},
          interval '1 day'
        )::date as dia
      )
      select
        to_char(d.dia, 'YYYY-MM-DD') as "data",
        extract(dow from d.dia)::int as "diaSemana",
        (select count(*)::int from conversations c
          where (c.created_at at time zone ${fuso})::date = d.dia) as "conversas",
        (select count(*)::int from messages m
          where (m.created_at at time zone ${fuso})::date = d.dia) as "mensagens"
      from dias d
      order by d.dia
    `);
    return rows;
  });
}

export interface HoraDoDia extends Record<string, unknown> {
  /** 0–23, no fuso da empresa. */
  hora: number;
  conversas: number;
}

/**
 * Quantas conversas começam em cada hora do dia, somando os últimos `dias` dias.
 * As 24 horas sempre voltam, inclusive as vazias — o vale entre os picos é
 * informação.
 */
export async function distribuicaoPorHora(
  tenantId: string,
  fuso: string,
  dias = 30,
): Promise<HoraDoDia[]> {
  const desde = new Date(
    inicioDoDiaLocal(new Date(), fuso).getTime() - (dias - 1) * 86_400_000,
  );

  return withTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<HoraDoDia>(sql`
      with horas as (select generate_series(0, 23) as hora)
      select
        h.hora as "hora",
        (select count(*)::int from conversations c
          where c.created_at >= ${desde}
            and extract(hour from c.created_at at time zone ${fuso})::int = h.hora
        ) as "conversas"
      from horas h
      order by h.hora
    `);
    return rows;
  });
}

/**
 * Faixas contínuas de maior movimento — "das 10h às 12h", "das 17h às 20h".
 * Uma faixa é uma sequência de horas cujo volume está acima da média do dia.
 */
export function faixasDePico(horas: HoraDoDia[]): { inicio: number; fim: number }[] {
  const total = horas.reduce((s, h) => s + h.conversas, 0);
  if (total === 0) return [];
  const ativas = horas.filter((h) => h.conversas > 0);
  const media = total / Math.max(ativas.length, 1);
  const limiar = media * 1.15;

  const faixas: { inicio: number; fim: number }[] = [];
  let atual: { inicio: number; fim: number } | null = null;
  for (const h of horas) {
    if (h.conversas >= limiar) {
      if (atual) atual.fim = h.hora;
      else atual = { inicio: h.hora, fim: h.hora };
    } else if (atual) {
      faixas.push(atual);
      atual = null;
    }
  }
  if (atual) faixas.push(atual);
  return faixas.sort(
    (a, b) => somaFaixa(horas, b) - somaFaixa(horas, a),
  ).slice(0, 2).sort((a, b) => a.inicio - b.inicio);
}

function somaFaixa(horas: HoraDoDia[], f: { inicio: number; fim: number }): number {
  return horas
    .filter((h) => h.hora >= f.inicio && h.hora <= f.fim)
    .reduce((s, h) => s + h.conversas, 0);
}
