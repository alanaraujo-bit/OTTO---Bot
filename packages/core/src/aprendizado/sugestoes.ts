import {
  and,
  desc,
  eq,
  knowledgeItems,
  knowledgeSuggestions,
  sql,
  users,
  withTenant,
} from '@otto/db';
import { childLogger, conflito, naoEncontrado } from '@otto/shared';

import { criarItem, publicarItem } from '../knowledge/gestao.ts';

/**
 * Revisão das sugestões.
 *
 * A fronteira entre "o sistema observou" e "a empresa decidiu". Nada aqui muda o
 * conhecimento oficial sem um humano com permissão — é a regra que o §5 da
 * missão chama de proibida conceitualmente.
 */

export interface SugestaoListada {
  id: string;
  tipo: string;
  status: string;
  titulo: string;
  razao: string;
  ocorrencias: number;
  prioridade: number;
  vistaPrimeiroEm: Date;
  vistaPorUltimoEm: Date;
  /** Conversas que sustentam a sugestão — permite conferir a evidência. */
  evidencia: string[];
  revisadaPor: string | null;
  revisadaEm: Date | null;
  itemGerado: string | null;
}

export async function listarSugestoes(
  tenantId: string,
  status: 'aberta' | 'aceita' | 'recusada' | 'todas' = 'aberta',
): Promise<SugestaoListada[]> {
  return withTenant(tenantId, async (tx) => {
    const linhas = await tx
      .select({
        id: knowledgeSuggestions.id,
        tipo: knowledgeSuggestions.type,
        status: knowledgeSuggestions.status,
        titulo: knowledgeSuggestions.title,
        razao: knowledgeSuggestions.rationale,
        ocorrencias: knowledgeSuggestions.occurrences,
        prioridade: knowledgeSuggestions.priority,
        vistaPrimeiroEm: knowledgeSuggestions.firstSeenAt,
        vistaPorUltimoEm: knowledgeSuggestions.lastSeenAt,
        evidencia: knowledgeSuggestions.evidence,
        revisadaPor: users.name,
        revisadaEm: knowledgeSuggestions.reviewedAt,
        itemGerado: knowledgeSuggestions.resultingItemId,
      })
      .from(knowledgeSuggestions)
      .leftJoin(users, eq(users.id, knowledgeSuggestions.reviewedBy))
      .where(status === 'todas' ? undefined : eq(knowledgeSuggestions.status, status))
      .orderBy(desc(knowledgeSuggestions.priority), desc(knowledgeSuggestions.lastSeenAt))
      .limit(100);

    return linhas.map((l) => ({
      ...l,
      evidencia: Array.isArray(l.evidencia) ? (l.evidencia as string[]) : [],
    }));
  });
}

/**
 * Aceitar uma sugestão.
 *
 * Cria o item de conhecimento com o texto que o **humano** escreveu — nunca com
 * um texto gerado automaticamente. A sugestão aponta o que falta; a resposta
 * oficial é da empresa.
 *
 * Publica em seguida, porque aceitar sem publicar deixaria a lacuna aberta e o
 * administrador achando que resolveu.
 */
export async function aceitarSugestao(
  tenantId: string,
  userId: string,
  sugestaoId: string,
  conteudo: { titulo: string; corpo: string; categoriaId?: string | null },
): Promise<{ itemId: string }> {
  const log = childLogger({ tenantId, userId });

  const sugestao = await withTenant(tenantId, async (tx) => {
    const [s] = await tx
      .select({ id: knowledgeSuggestions.id, status: knowledgeSuggestions.status })
      .from(knowledgeSuggestions)
      .where(eq(knowledgeSuggestions.id, sugestaoId))
      .limit(1);
    return s;
  });

  if (!sugestao) throw naoEncontrado('Esta sugestão');
  if (sugestao.status !== 'aberta' && sugestao.status !== 'em_analise') {
    throw conflito('Esta sugestão já foi revisada.');
  }

  if (!conteudo.corpo.trim()) {
    throw conflito('Escreva a resposta antes de aceitar a sugestão.');
  }

  const itemId = await criarItem(tenantId, userId, {
    titulo: conteudo.titulo,
    corpo: conteudo.corpo,
    tipo: 'pergunta_frequente',
    categoriaId: conteudo.categoriaId ?? null,
  });

  await publicarItem(tenantId, userId, itemId, 'Criado a partir de uma sugestão de melhoria.');

  await withTenant(tenantId, (tx) =>
    tx
      .update(knowledgeSuggestions)
      .set({
        status: 'aceita',
        reviewedBy: userId,
        reviewedAt: new Date(),
        resultingItemId: itemId,
      })
      .where(eq(knowledgeSuggestions.id, sugestaoId)),
  );

  // Marca a origem: permite responder "de onde veio esse conhecimento?" meses
  // depois, que é a pergunta que se faz quando a informação está errada.
  await withTenant(tenantId, (tx) =>
    tx
      .update(knowledgeItems)
      .set({ sourceType: 'sugestao', sourceRef: sugestaoId })
      .where(eq(knowledgeItems.id, itemId)),
  );

  log.info({ sugestaoId, itemId }, 'sugestão aceita e conhecimento publicado');
  return { itemId };
}

/**
 * Recusar.
 *
 * A recusa é uma decisão que o sistema respeita: a agregação não reabre uma
 * sugestão recusada, mesmo que a pergunta continue aparecendo. Sem isso, o
 * administrador recusaria a mesma coisa toda semana.
 */
export async function recusarSugestao(
  tenantId: string,
  userId: string,
  sugestaoId: string,
  motivo?: string,
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(knowledgeSuggestions)
      .set({
        status: 'recusada',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: motivo?.trim() || null,
      })
      .where(eq(knowledgeSuggestions.id, sugestaoId)),
  );

  childLogger({ tenantId, userId }).info({ sugestaoId }, 'sugestão recusada');
}

/** Quantas sugestões esperam revisão. Alimenta o distintivo na navegação. */
export async function contarAbertas(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeSuggestions)
      .where(eq(knowledgeSuggestions.status, 'aberta'));
    return r?.n ?? 0;
  });
}
