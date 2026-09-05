import {
  and,
  desc,
  inArray,
  eq,
  isNull,
  knowledgeSignals,
  knowledgeSuggestions,
  sql,
  withTenant,
} from '@otto/db';
import { childLogger, dias } from '@otto/shared';

import { rotaPara } from '../ai/roteador.ts';
import { agruparPorIntencao, type PerguntaParaAgrupar } from './agrupamento.ts';

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
    // Um sinal por linha, e não `GROUP BY` — o agrupamento agora é por
    // intenção, e isso o Postgres não sabe fazer. Ver `agrupamento.ts`.
    const sinais = await tx
      .select({
        id: knowledgeSignals.id,
        chave: knowledgeSignals.queryText,
        original: sql<string | null>`${knowledgeSignals.data} ->> 'textoOriginal'`,
        conversationId: knowledgeSignals.conversationId,
        em: knowledgeSignals.createdAt,
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
      .orderBy(knowledgeSignals.createdAt)
      .limit(500);

    // Abaixo do mínimo não há grupo possível — nem vale pagar o embedding.
    if (sinais.length < OCORRENCIAS_MINIMAS) return [];

    const perguntas: PerguntaParaAgrupar[] = sinais.map((s) => ({
      id: s.id,
      // O texto original é o que o cliente escreveu; a chave é o saco de
      // palavras. Agrupar pelo original é o ponto da mudança — a chave só
      // sobrevive como plano B sem embedding.
      texto: s.original?.trim() || (s.chave ?? ''),
      chave: s.chave ?? '',
      em: s.em,
      conversationId: s.conversationId,
    }));

    // Um lote só para todas as perguntas da janela. Sem isso, cada rodada faria
    // uma chamada por sinal.
    let embeddings: Map<string, number[]> | null = null;
    try {
      const rota = rotaPara('embutir');
      const r = await rota.provedor.embutir({
        modelo: rota.modelo,
        textos: perguntas.map((p) => p.texto),
      });
      embeddings = new Map(perguntas.map((p, i) => [p.id, r.vetores[i]!]));
    } catch (erro) {
      log.warn({ erro }, 'embedding indisponível; agrupando por texto normalizado');
    }

    const grupos = agruparPorIntencao(perguntas, embeddings)
      .filter((g) => g.membros.length >= OCORRENCIAS_MINIMAS)
      .slice(0, 20);

    const geradas: SugestaoGerada[] = [];

    for (const grupo of grupos) {
      const exemplo = grupo.representante.texto;
      const ocorrencias = grupo.membros.length;
      const chaveDoGrupo = grupo.representante.chave;
      const primeira = grupo.membros[0]!.em;
      const ultima = grupo.membros[grupo.membros.length - 1]!.em;
      const evidencia = [...new Set(grupo.membros.map((m) => m.conversationId).filter(Boolean))] as string[];
      const titulo = `Clientes perguntam: "${exemplo}"`;

      // A mesma demanda pode reaparecer depois de já ter sido recusada; nesse
      // caso, atualizar a contagem é melhor que criar uma sugestão duplicada.
      const [existente] = await tx
        .select({ id: knowledgeSuggestions.id, status: knowledgeSuggestions.status })
        .from(knowledgeSuggestions)
        .where(
          and(
            eq(knowledgeSuggestions.type, 'conhecimento_ausente'),
            sql`${knowledgeSuggestions.rationale} like ${'%' + chaveDoGrupo + '%'}`,
          ),
        )
        .limit(1);

      const razao =
        `${ocorrencias} ${ocorrencias === 1 ? 'cliente perguntou' : 'clientes perguntaram'} ` +
        `sobre isso nos últimos 14 dias, e a base de conhecimento não tinha resposta. ` +
        `A conversa foi encaminhada para atendimento humano em todos os casos.\n\n` +
        `Como perguntaram:\n` +
        grupo.membros
          .map((m) => `· ${m.texto}`)
          .slice(0, 8)
          .join('\n') +
        `\n\nPergunta normalizada: ${chaveDoGrupo}`;

      if (existente) {
        // Recusa anterior é uma decisão; não reabrimos sozinhos.
        if (existente.status === 'recusada') continue;

        await tx
          .update(knowledgeSuggestions)
          .set({
            occurrences: ocorrencias,
            lastSeenAt: ultima,
            rationale: razao,
            priority: prioridade(ocorrencias),
          })
          .where(eq(knowledgeSuggestions.id, existente.id));

        geradas.push({ id: existente.id, titulo, ocorrencias });
      } else {
        const [criada] = await tx
          .insert(knowledgeSuggestions)
          .values({
            tenantId,
            type: 'conhecimento_ausente',
            status: 'aberta',
            title: titulo.slice(0, 200),
            rationale: razao,
            evidence: evidencia.slice(0, 20),
            occurrences: ocorrencias,
            firstSeenAt: primeira,
            lastSeenAt: ultima,
            priority: prioridade(ocorrencias),
          })
          .returning({ id: knowledgeSuggestions.id });

        geradas.push({ id: criada!.id, titulo, ocorrencias });
      }

      // Marca os sinais como consumidos para não recontá-los na próxima rodada.
      await tx
        .update(knowledgeSignals)
        .set({ aggregatedAt: new Date() })
        .where(
          and(
            inArray(
              knowledgeSignals.id,
              grupo.membros.map((m) => m.id),
            ),
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
