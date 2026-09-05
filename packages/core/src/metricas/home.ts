import {
  and,
  aiRuns,
  conversations,
  eq,
  gte,
  isNotNull,
  messages,
  sql,
  withTenant,
} from '@otto/db';
import { inicioDoDiaLocal } from '@otto/shared';

import { conversaReal, deConversaReal } from './ensaio.ts';
import { medianaPrimeiraResposta } from './tempo-resposta.ts';

/**
 * Indicadores da Home.
 *
 * Cada número aqui existe para levar a uma decisão — a regra do §17 da missão.
 * Nada entra por ser bonito de mostrar. Se um indicador não muda o que alguém
 * faria a seguir, ele sai.
 *
 * O dia é o **dia local da empresa**, não UTC: às 21h em Canaã dos Carajás já é
 * o dia seguinte em UTC, e "conversas hoje" precisa bater com o que o dono viu
 * na loja.
 */

export interface IndicadoresHome {
  /** Precisam de gente agora. É o número que interrompe alguém. */
  aguardandoHumano: number;
  /** Conversa viva neste momento — cliente ou IA falaram há pouco. */
  emAndamento: number;
  conversasHoje: number;
  mensagensHoje: number;
  /** Resolvidas sem humano nenhum, em porcentagem inteira. `null` sem volume. */
  resolucaoAutomatica: number | null;
  /** Segundos até a primeira resposta, mediana. `null` sem volume. */
  tempoPrimeiraResposta: number | null;
  /** Micro-dólares gastos com IA hoje. */
  custoHojeMicroUsd: number;
  /** Perguntas que a base não respondeu hoje. Aponta lacuna de conhecimento. */
  semFundamentoHoje: number;
}

export async function indicadoresHome(
  tenantId: string,
  fuso: string,
): Promise<IndicadoresHome> {
  const inicioLocal = inicioDoDiaLocal(new Date(), fuso);

  return withTenant(tenantId, async (tx) => {
    const [fila] = await tx
      .select({
        aguardandoHumano: sql<number>`count(*) filter (where ${conversations.status} = 'aguardando_humano')::int`,
        emAndamento: sql<number>`count(*) filter (where ${conversations.status} in ('aberta','aguardando_cliente'))::int`,
      })
      .from(conversations)
      .where(conversaReal());

    const [dia] = await tx
      .select({
        conversas: sql<number>`count(*)::int`,
        comHandoff: sql<number>`count(*) filter (where ${conversations.handoffCount} > 0)::int`,
        encerradas: sql<number>`count(*) filter (where ${conversations.status} in ('resolvida','encerrada'))::int`,
        medianaResposta: medianaPrimeiraResposta(inicioLocal),
      })
      .from(conversations)
      .where(and(gte(conversations.createdAt, inicioLocal), conversaReal()));

    const [msgs] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(gte(messages.createdAt, inicioLocal), deConversaReal(messages.conversationId)));

    const [ia] = await tx
      .select({
        custo: sql<number>`coalesce(sum(${aiRuns.costMicroUsd}), 0)::bigint`,
        semFundamento: sql<number>`count(*) filter (where ${aiRuns.outcome} = 'sem_fundamento')::int`,
      })
      .from(aiRuns)
      .where(and(gte(aiRuns.createdAt, inicioLocal), deConversaReal(aiRuns.conversationId)));

    const conversasHoje = dia?.conversas ?? 0;
    const encerradas = dia?.encerradas ?? 0;
    const comHandoff = dia?.comHandoff ?? 0;

    return {
      aguardandoHumano: fila?.aguardandoHumano ?? 0,
      emAndamento: fila?.emAndamento ?? 0,
      conversasHoje,
      mensagensHoje: msgs?.total ?? 0,
      // Só faz sentido com conversa encerrada: uma em andamento ainda pode virar
      // handoff, e contá-la agora inflaria o número.
      resolucaoAutomatica:
        encerradas > 0 ? Math.round(((encerradas - comHandoff) / encerradas) * 100) : null,
      tempoPrimeiraResposta:
        dia?.medianaResposta != null ? Math.round(Number(dia.medianaResposta)) : null,
      custoHojeMicroUsd: Number(ia?.custo ?? 0),
      semFundamentoHoje: ia?.semFundamento ?? 0,
    };
  });
}

/** Micro-dólares → texto em reais. A cotação vem de configuração, não daqui. */
export function formatarCusto(microUsd: number, cotacao = 5.5): string {
  const reais = (microUsd / 1_000_000) * cotacao;
  if (reais === 0) return 'R$ 0,00';
  if (reais < 0.01) return 'menos de R$ 0,01';
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDuracao(segundos: number | null): string {
  if (segundos === null) return '—';
  if (segundos < 60) return `${Math.round(segundos)} s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}
