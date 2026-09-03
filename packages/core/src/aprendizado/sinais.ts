import {
  and,
  desc,
  eq,
  isNull,
  knowledgeSignals,
  knowledgeSuggestions,
  sql,
  withTenant,
} from '@otto/db';
import { childLogger, dias } from '@otto/shared';

/**
 * Sinais de aprendizado.
 *
 * Um sinal é um **fato observado** durante um atendimento: a base não respondeu,
 * a confiança ficou baixa, o cliente pediu uma pessoa, um humano corrigiu a
 * resposta da IA.
 *
 * Por si só, um sinal não muda nada. É essa separação que impede a
 * autocontaminação: o cliente pode estar errado, pode estar brincando, pode
 * mentir — e a própria IA erra. Sinais viram sugestões, sugestões passam por
 * uma pessoa, e só então o conhecimento oficial muda.
 */

export type TipoSinal =
  | 'sem_resultado'
  | 'confianca_baixa'
  | 'handoff_pedido'
  | 'resposta_corrigida'
  | 'cliente_insatisfeito';

export interface RegistroSinal {
  tenantId: string;
  tipo: TipoSinal;
  conversationId?: string | null;
  messageId?: string | null;
  /** A pergunta do cliente. É por ela que a recorrência é agrupada. */
  pergunta?: string | null;
  confianca?: number | null;
  dados?: Record<string, unknown>;
}

export async function registrarSinal(sinal: RegistroSinal): Promise<void> {
  await withTenant(sinal.tenantId, (tx) =>
    tx.insert(knowledgeSignals).values({
      tenantId: sinal.tenantId,
      type: sinal.tipo,
      conversationId: sinal.conversationId ?? null,
      messageId: sinal.messageId ?? null,
      queryText: sinal.pergunta ? normalizar(sinal.pergunta) : null,
      confidence: sinal.confianca ?? null,
      data: sinal.dados ?? {},
    }),
  );
}

/**
 * Normaliza a pergunta para agrupar recorrência.
 *
 * "Vocês aceitam PIX?", "aceitam pix" e "aceita pix???" precisam contar como a
 * mesma pergunta — senão nenhuma sugestão jamais atinge o limite de ocorrências.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .sort()
    .join(' ')
    .slice(0, 300);
}

/**
 * Quantas vezes a mesma pergunta precisa aparecer para virar sugestão.
 *
 * Três é deliberado: uma pergunta única costuma ser caso isolado, e sugerir a
 * cada uma encheria a fila de revisão de ruído — que é a forma mais rápida de
 * fazer o administrador parar de olhar a fila.
 */
const OCORRENCIAS_MINIMAS = 3;

/** Janela de agrupamento. Além disso, é outro assunto, não a mesma demanda. */
const JANELA = dias(14);

export interface SugestaoGerada {
  id: string;
  titulo: string;
  ocorrencias: number;
}

/**
 * Agrega sinais em sugestões.
 *
 * Roda periodicamente no worker. Agrupa perguntas parecidas que a base não
 * respondeu e, quando passam do limite, cria — ou atualiza — uma sugestão para
 * revisão humana.
 */
export async function agregarSinais(tenantId: string): Promise<SugestaoGerada[]> {
  const log = childLogger({ tenantId });
  const desde = new Date(Date.now() - JANELA);

  return withTenant(tenantId, async (tx) => {
    const grupos = await tx
      .select({
        pergunta: knowledgeSignals.queryText,
        ocorrencias: sql<number>`count(*)::int`,
        // Convertido para texto no SQL de propósito: o driver devolve string
        // para agregado de timestamp, e o Drizzle chamaria `toISOString()` nela
        // ao regravar — o que quebra em tempo de execução, não de compilação.
        primeira: sql<string>`min(${knowledgeSignals.createdAt})::text`,
        ultima: sql<string>`max(${knowledgeSignals.createdAt})::text`,
        evidencia: sql<string[]>`array_agg(distinct ${knowledgeSignals.conversationId}::text)`,
        exemplos: sql<string[]>`array_agg(distinct ${knowledgeSignals.data} ->> 'textoOriginal')`,
      })
      .from(knowledgeSignals)
      .where(
        and(
          eq(knowledgeSignals.type, 'sem_resultado'),
          isNull(knowledgeSignals.aggregatedAt),
          sql`${knowledgeSignals.createdAt} >= ${desde}`,
          sql`${knowledgeSignals.queryText} is not null`,
        ),
      )
      .groupBy(knowledgeSignals.queryText)
      .having(sql`count(*) >= ${OCORRENCIAS_MINIMAS}`)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    const geradas: SugestaoGerada[] = [];

    for (const grupo of grupos) {
      if (!grupo.pergunta) continue;

      const exemplo =
        grupo.exemplos?.filter(Boolean)[0] ?? grupo.pergunta;
      const titulo = `Clientes perguntam: "${exemplo}"`;

      // A mesma demanda pode reaparecer depois de já ter sido recusada; nesse
      // caso, atualizar a contagem é melhor que criar uma sugestão duplicada.
      const [existente] = await tx
        .select({ id: knowledgeSuggestions.id, status: knowledgeSuggestions.status })
        .from(knowledgeSuggestions)
        .where(
          and(
            eq(knowledgeSuggestions.type, 'conhecimento_ausente'),
            sql`${knowledgeSuggestions.rationale} like ${'%' + grupo.pergunta + '%'}`,
          ),
        )
        .limit(1);

      const razao =
        `${grupo.ocorrencias} ${grupo.ocorrencias === 1 ? 'cliente perguntou' : 'clientes perguntaram'} ` +
        `sobre isso nos últimos 14 dias, e a base de conhecimento não tinha resposta. ` +
        `A conversa foi encaminhada para atendimento humano em todos os casos.\n\n` +
        `Pergunta normalizada: ${grupo.pergunta}`;

      if (existente) {
        // Recusa anterior é uma decisão; não reabrimos sozinhos.
        if (existente.status === 'recusada') continue;

        await tx
          .update(knowledgeSuggestions)
          .set({
            occurrences: grupo.ocorrencias,
            lastSeenAt: new Date(grupo.ultima),
            rationale: razao,
            priority: prioridade(grupo.ocorrencias),
          })
          .where(eq(knowledgeSuggestions.id, existente.id));

        geradas.push({
          id: existente.id,
          titulo,
          ocorrencias: grupo.ocorrencias,
        });
      } else {
        const [criada] = await tx
          .insert(knowledgeSuggestions)
          .values({
            tenantId,
            type: 'conhecimento_ausente',
            status: 'aberta',
            title: titulo.slice(0, 200),
            rationale: razao,
            evidence: (grupo.evidencia ?? []).filter(Boolean).slice(0, 20),
            occurrences: grupo.ocorrencias,
            firstSeenAt: new Date(grupo.primeira),
            lastSeenAt: new Date(grupo.ultima),
            priority: prioridade(grupo.ocorrencias),
          })
          .returning({ id: knowledgeSuggestions.id });

        geradas.push({
          id: criada!.id,
          titulo,
          ocorrencias: grupo.ocorrencias,
        });
      }

      // Marca os sinais como consumidos para não recontá-los na próxima rodada.
      await tx
        .update(knowledgeSignals)
        .set({ aggregatedAt: new Date() })
        .where(
          and(
            eq(knowledgeSignals.queryText, grupo.pergunta),
            isNull(knowledgeSignals.aggregatedAt),
          ),
        );
    }

    if (geradas.length) log.info({ sugestoes: geradas.length }, 'sugestões de aprendizado geradas');
    return geradas;
  });
}

/** 0..1. Ordena a fila de revisão por impacto — mais gente perguntando, mais alto. */
function prioridade(ocorrencias: number): number {
  return Math.min(1, ocorrencias / 20);
}
