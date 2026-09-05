import { conversations } from '@otto/db/schema';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Mediana do tempo até a primeira resposta, em segundos.
 *
 * A expressão existe como função porque a mesma métrica aparece na Início e na
 * Análise, e as duas erravam do mesmo jeito — corrigir em um lugar só deixaria
 * a outra tela mentindo.
 *
 * ## O que deu errado
 *
 * A versão anterior ordenava `first_response_at - first_inbound_at` sem
 * qualificar nada além de a resposta existir. Em produção isso rendeu
 * **8759 h 54 min** (≈ 1 ano) na Análise e **4379 h 59 min** (≈ 6 meses) na
 * Início. Não era erro de fuso — os horários exibidos na Inbox estão certos.
 *
 * São duas causas somadas, e o número de 6 meses é a assinatura da segunda:
 *
 * 1. **Conversas de ensaio.** Fixtures com primeira mensagem de um ano atrás e
 *    conversa criada há poucos dias entram na janela pelo `created_at` e
 *    contribuem com um intervalo de um ano.
 * 2. **Interpolação da mediana.** `percentile_cont` interpola: com duas
 *    amostras, uma de segundos e outra de um ano, a "mediana" vira a média das
 *    duas — exatamente metade, que é o 4379 h.
 *
 * ## O que a correção exige
 *
 * · **Intervalo positivo.** Medimos intervalos negativos por muito tempo: no
 *   banco de desenvolvimento há dezenas de conversas com `first_response_at`
 *   *anterior* ao `first_inbound_at`. Responder antes de perguntar é
 *   impossível, então o dado é incoerente e não pode entrar numa mediana.
 * · **Primeira mensagem dentro da janela.** "Mediana dos últimos 7 dias"
 *   precisa medir conversas cuja pergunta chegou nos últimos 7 dias. Filtrar
 *   pelo `created_at` e medir pelo `first_inbound_at` compara coisas de janelas
 *   diferentes, e é por isso que uma fixture de um ano atrás contaminava a
 *   conta de hoje.
 *
 * A alternativa seria um teto arbitrário ("ignore acima de X horas"), que
 * esconderia o dado ruim em vez de excluí-lo — e esconderia junto um atraso
 * real de atendimento, que é justamente o que esta métrica existe para mostrar.
 */
export function medianaPrimeiraResposta(inicioDaJanela: Date): SQL<number | null> {
  return sql<number | null>`
    percentile_cont(0.5) within group (
      order by extract(epoch from ${conversations.firstResponseAt} - ${conversations.firstInboundAt})
    ) filter (
      where ${conversations.firstResponseAt} is not null
        and ${conversations.firstInboundAt} is not null
        and ${conversations.firstResponseAt} > ${conversations.firstInboundAt}
        and ${conversations.firstInboundAt} >= ${inicioDaJanela}
    )
  `;
}
