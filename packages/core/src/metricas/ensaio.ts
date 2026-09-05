import { conversations } from '@otto/db/schema';
import { eq, sql, type SQL } from 'drizzle-orm';

/**
 * Exclusão de dados de ensaio das métricas comerciais.
 *
 * Os predicados vivem aqui, e não escritos à mão em cada consulta, por uma
 * razão específica: um filtro que precisa ser lembrado é um filtro que uma hora
 * é esquecido, e o sintoma de esquecer é um painel que mente sem avisar. Foi
 * assim que "9 conversas, 9 encaminhadas, 0 resolvidas pela Bia" descreveu, em
 * produção, seis meses de ensaio como se fosse atendimento real.
 *
 * A regra é uma frase: **métrica comercial não conta ensaio.** Diagnóstico,
 * Inbox e Backoffice contam — lá os ensaios são justamente o que se quer ver.
 */

/** Conversas reais. Para consultas que partem de `conversations`. */
export const conversaReal = (): SQL => eq(conversations.isTest, false);

/**
 * Linhas de outras tabelas cuja conversa não é ensaio.
 *
 * `not exists` em vez de `join`: um `join` mudaria a cardinalidade da consulta
 * que o chama, e algumas destas são agregações onde isso silenciosamente
 * duplicaria contagem. Este predicado só filtra.
 *
 * A coluna é passada como referência do Drizzle, então a tabela de origem não
 * precisa ser conhecida aqui — serve para `messages`, `ai_runs` e o que vier.
 */
export function deConversaReal(colunaConversationId: unknown): SQL {
  return sql`not exists (
    select 1 from ${conversations} cv
     where cv.id = ${colunaConversationId}
       and cv.is_test
  )`;
}
