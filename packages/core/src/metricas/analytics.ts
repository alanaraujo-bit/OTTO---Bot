import { aiRuns, and, conversations, gte, lt, messages, sql, withTenant } from '@otto/db';
import { inicioDoDiaLocal } from '@otto/shared';

import { medianaPrimeiraResposta } from './tempo-resposta.ts';

/**
 * Analytics.
 *
 * A regra que governa tudo aqui: **toda métrica precisa levar a uma decisão**, e
 * precisa ser possível chegar às conversas que a originaram. Um número que não
 * vai a lugar nenhum é enfeite, e enfeite em painel operacional atrapalha —
 * esconde o que importa.
 *
 * Toda agregação usa o dia local da empresa. Somar por dia UTC jogaria as três
 * últimas horas de movimento de Canaã dos Carajás no dia seguinte.
 */

export type Periodo = 'hoje' | '7dias' | '30dias';

export interface JanelaTempo {
  inicio: Date;
  fim: Date;
  /** Mesma duração, imediatamente antes. Serve à comparação. */
  inicioAnterior: Date;
  rotulo: string;
}

export function janela(periodo: Periodo, fuso: string): JanelaTempo {
  const agora = new Date();
  const hoje = inicioDoDiaLocal(agora, fuso);
  const DIA = 86_400_000;

  const dias = periodo === 'hoje' ? 1 : periodo === '7dias' ? 7 : 30;
  const inicio = new Date(hoje.getTime() - (dias - 1) * DIA);

  return {
    inicio,
    fim: agora,
    inicioAnterior: new Date(inicio.getTime() - dias * DIA),
    rotulo: periodo === 'hoje' ? 'hoje' : `últimos ${dias} dias`,
  };
}

export interface ResumoAnalytics {
  conversas: number;
  conversasAnterior: number;
  mensagensRecebidas: number;
  mensagensEnviadas: number;
  clientesUnicos: number;
  /** Conversas encerradas sem nenhum handoff, em porcentagem. */
  resolucaoAutomatica: number | null;
  resolucaoAnterior: number | null;
  handoffs: number;
  /** Mediana em segundos. Mediana e não média: um caso extremo distorce a média. */
  tempoPrimeiraResposta: number | null;
  custoMicroUsd: number;
  custoAnteriorMicroUsd: number;
  /** Custo médio por conversa. É o número que interessa ao dono do negócio. */
  custoPorConversaMicroUsd: number | null;
  /** Perguntas que a base não respondeu. Aponta lacuna de conhecimento. */
  semFundamento: number;
}

export async function resumo(
  tenantId: string,
  periodo: Periodo,
  fuso: string,
): Promise<ResumoAnalytics> {
  const j = janela(periodo, fuso);

  return withTenant(tenantId, async (tx) => {
    const [atual] = await tx
      .select({
        conversas: sql<number>`count(*)::int`,
        encerradas: sql<number>`count(*) filter (where ${conversations.status} in ('resolvida','encerrada'))::int`,
        comHandoff: sql<number>`count(*) filter (where ${conversations.handoffCount} > 0)::int`,
        handoffs: sql<number>`coalesce(sum(${conversations.handoffCount}), 0)::int`,
        clientes: sql<number>`count(distinct ${conversations.contactId})::int`,
        medianaResposta: medianaPrimeiraResposta(j.inicio),
      })
      .from(conversations)
      .where(gte(conversations.createdAt, j.inicio));

    const [anterior] = await tx
      .select({
        conversas: sql<number>`count(*)::int`,
        encerradas: sql<number>`count(*) filter (where ${conversations.status} in ('resolvida','encerrada'))::int`,
        comHandoff: sql<number>`count(*) filter (where ${conversations.handoffCount} > 0)::int`,
      })
      .from(conversations)
      .where(
        and(
          gte(conversations.createdAt, j.inicioAnterior),
          lt(conversations.createdAt, j.inicio),
        ),
      );

    const [msgs] = await tx
      .select({
        recebidas: sql<number>`count(*) filter (where ${messages.direction} = 'entrada')::int`,
        enviadas: sql<number>`count(*) filter (where ${messages.direction} = 'saida')::int`,
      })
      .from(messages)
      .where(gte(messages.createdAt, j.inicio));

    const [ia] = await tx
      .select({
        custo: sql<number>`coalesce(sum(${aiRuns.costMicroUsd}), 0)::bigint`,
        semFundamento: sql<number>`count(*) filter (where ${aiRuns.outcome} = 'sem_fundamento')::int`,
      })
      .from(aiRuns)
      .where(gte(aiRuns.createdAt, j.inicio));

    const [iaAnterior] = await tx
      .select({ custo: sql<number>`coalesce(sum(${aiRuns.costMicroUsd}), 0)::bigint` })
      .from(aiRuns)
      .where(and(gte(aiRuns.createdAt, j.inicioAnterior), lt(aiRuns.createdAt, j.inicio)));

    const taxa = (encerradas: number, comHandoff: number) =>
      encerradas > 0 ? Math.round(((encerradas - comHandoff) / encerradas) * 100) : null;

    const conversas = atual?.conversas ?? 0;
    const custo = Number(ia?.custo ?? 0);

    return {
      conversas,
      conversasAnterior: anterior?.conversas ?? 0,
      mensagensRecebidas: msgs?.recebidas ?? 0,
      mensagensEnviadas: msgs?.enviadas ?? 0,
      clientesUnicos: atual?.clientes ?? 0,
      resolucaoAutomatica: taxa(atual?.encerradas ?? 0, atual?.comHandoff ?? 0),
      resolucaoAnterior: taxa(anterior?.encerradas ?? 0, anterior?.comHandoff ?? 0),
      handoffs: atual?.handoffs ?? 0,
      tempoPrimeiraResposta:
        atual?.medianaResposta != null ? Math.round(Number(atual.medianaResposta)) : null,
      custoMicroUsd: custo,
      custoAnteriorMicroUsd: Number(iaAnterior?.custo ?? 0),
      custoPorConversaMicroUsd: conversas > 0 ? Math.round(custo / conversas) : null,
      semFundamento: ia?.semFundamento ?? 0,
    };
  });
}

export interface PontoDoDia extends Record<string, unknown> {
  data: string;
  conversas: number;
  mensagens: number;
  custoMicroUsd: number;
}

/**
 * Série diária.
 *
 * `generate_series` preenche os dias sem movimento com zero. Sem isso, o gráfico
 * ligaria segunda a quarta como se terça não existisse — e é justamente o dia
 * parado que costuma ser a informação.
 */
export async function serieDiaria(
  tenantId: string,
  periodo: Periodo,
  fuso: string,
): Promise<PontoDoDia[]> {
  const j = janela(periodo, fuso);

  return withTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<PontoDoDia>(sql`
      with dias as (
        select generate_series(
          ${j.inicio}::timestamptz at time zone ${fuso},
          ${j.fim}::timestamptz at time zone ${fuso},
          interval '1 day'
        )::date as dia
      )
      select
        to_char(d.dia, 'YYYY-MM-DD') as "data",
        (
          select count(*)::int from conversations c
          where (c.created_at at time zone ${fuso})::date = d.dia
        ) as "conversas",
        (
          select count(*)::int from messages m
          where (m.created_at at time zone ${fuso})::date = d.dia
        ) as "mensagens",
        (
          select coalesce(sum(r.cost_micro_usd), 0)::bigint from ai_runs r
          where (r.created_at at time zone ${fuso})::date = d.dia
        ) as "custoMicroUsd"
      from dias d
      order by d.dia
    `);

    return rows.map((r) => ({ ...r, custoMicroUsd: Number(r.custoMicroUsd) }));
  });
}

export interface AssuntoFrequente extends Record<string, unknown> {
  assunto: string;
  ocorrencias: number;
  /** Quantas terminaram sem resposta da IA. Aponta onde falta conhecimento. */
  semResposta: number;
}

/**
 * O que os clientes mais perguntam.
 *
 * Agrupa pelo item de conhecimento que fundamentou a resposta — e não por
 * classificação por modelo, que custaria dinheiro e daria rótulos instáveis. O
 * conhecimento usado **é** o assunto, por construção.
 */
export async function assuntosFrequentes(
  tenantId: string,
  periodo: Periodo,
  fuso: string,
): Promise<AssuntoFrequente[]> {
  const j = janela(periodo, fuso);

  return withTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<AssuntoFrequente>(sql`
      select
        i.title as "assunto",
        count(*)::int as "ocorrencias",
        count(*) filter (where r.outcome <> 'ok')::int as "semResposta"
      from ai_runs r
      cross join lateral jsonb_array_elements_text(r.retrieved_item_ids) as item(id)
      join knowledge_items i on i.id = item.id::uuid
      where r.created_at >= ${j.inicio}
      group by i.title
      order by count(*) desc
      limit 10
    `);
    return rows;
  });
}
