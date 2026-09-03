import {
  and,
  asc,
  desc,
  eq,
  knowledgeCategories,
  knowledgeItems,
  knowledgeVersions,
  sql,
  users,
  withTenant,
} from '@otto/db';
import { childLogger, conflito, naoEncontrado } from '@otto/shared';

import { indexarItem } from './indexacao.ts';

/**
 * Gestão do conhecimento.
 *
 * O ciclo de vida de um item é o que separa este produto de um campo de texto
 * gigante: rascunho → publicado → desatualizado → arquivado, com versão imutável
 * a cada publicação.
 *
 * Publicar é o único momento em que o conhecimento muda o comportamento do
 * agente, e é sempre um ato humano deliberado — nunca um efeito colateral de
 * salvar.
 */

export type StatusItem =
  | 'rascunho'
  | 'em_aprovacao'
  | 'publicado'
  | 'desatualizado'
  | 'arquivado';

export interface ItemListado {
  id: string;
  titulo: string;
  tipo: string;
  status: StatusItem;
  categoria: string | null;
  versao: number;
  usos: number;
  ultimoUsoEm: Date | null;
  revisarAte: Date | null;
  atualizadoEm: Date;
  atualizadoPor: string | null;
}

export async function listarItens(
  tenantId: string,
  filtros: { status?: StatusItem; categoriaId?: string; busca?: string } = {},
): Promise<ItemListado[]> {
  return withTenant(tenantId, async (tx) => {
    const condicoes = [];
    if (filtros.status) condicoes.push(eq(knowledgeItems.status, filtros.status));
    if (filtros.categoriaId) condicoes.push(eq(knowledgeItems.categoryId, filtros.categoriaId));
    if (filtros.busca?.trim()) {
      const termo = `%${filtros.busca.trim()}%`;
      condicoes.push(sql`${knowledgeItems.title} ilike ${termo}`);
    }

    return tx
      .select({
        id: knowledgeItems.id,
        titulo: knowledgeItems.title,
        tipo: knowledgeItems.kind,
        status: knowledgeItems.status,
        categoria: knowledgeCategories.name,
        versao: knowledgeItems.version,
        usos: knowledgeItems.usageCount,
        ultimoUsoEm: knowledgeItems.lastUsedAt,
        revisarAte: knowledgeItems.reviewDueAt,
        atualizadoEm: knowledgeItems.updatedAt,
        atualizadoPor: users.name,
      })
      .from(knowledgeItems)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, knowledgeItems.categoryId))
      .leftJoin(users, eq(users.id, knowledgeItems.updatedBy))
      .where(condicoes.length ? and(...condicoes) : undefined)
      // Rascunho e "em aprovação" primeiro: são os que pedem ação de alguém.
      .orderBy(
        sql`case ${knowledgeItems.status}
              when 'em_aprovacao' then 0
              when 'rascunho' then 1
              when 'desatualizado' then 2
              when 'publicado' then 3
              else 4 end`,
        desc(knowledgeItems.updatedAt),
      )
      .limit(200);
  });
}

export interface DetalheItem extends ItemListado {
  corpo: string;
  aliases: string[];
  fonte: string;
  publicadoEm: Date | null;
  historico: {
    versao: number;
    titulo: string;
    nota: string | null;
    autor: string | null;
    criadaEm: Date;
  }[];
}

export async function detalharItem(
  tenantId: string,
  itemId: string,
): Promise<DetalheItem | null> {
  return withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .select({
        id: knowledgeItems.id,
        titulo: knowledgeItems.title,
        corpo: knowledgeItems.body,
        aliases: knowledgeItems.aliases,
        tipo: knowledgeItems.kind,
        status: knowledgeItems.status,
        categoria: knowledgeCategories.name,
        versao: knowledgeItems.version,
        usos: knowledgeItems.usageCount,
        ultimoUsoEm: knowledgeItems.lastUsedAt,
        revisarAte: knowledgeItems.reviewDueAt,
        atualizadoEm: knowledgeItems.updatedAt,
        atualizadoPor: users.name,
        fonte: knowledgeItems.sourceType,
        publicadoEm: knowledgeItems.publishedAt,
      })
      .from(knowledgeItems)
      .leftJoin(knowledgeCategories, eq(knowledgeCategories.id, knowledgeItems.categoryId))
      .leftJoin(users, eq(users.id, knowledgeItems.updatedBy))
      .where(eq(knowledgeItems.id, itemId))
      .limit(1);

    if (!item) return null;

    const historico = await tx
      .select({
        versao: knowledgeVersions.version,
        titulo: knowledgeVersions.title,
        nota: knowledgeVersions.changeNote,
        autor: users.name,
        criadaEm: knowledgeVersions.createdAt,
      })
      .from(knowledgeVersions)
      .leftJoin(users, eq(users.id, knowledgeVersions.authorId))
      .where(eq(knowledgeVersions.itemId, itemId))
      .orderBy(desc(knowledgeVersions.version));

    return {
      ...item,
      aliases: Array.isArray(item.aliases) ? (item.aliases as string[]) : [],
      historico,
    };
  });
}

export interface DadosItem {
  titulo: string;
  corpo: string;
  tipo:
    | 'fato'
    | 'pergunta_frequente'
    | 'politica'
    | 'procedimento'
    | 'servico'
    | 'horario'
    | 'localizacao'
    | 'documento';
  categoriaId?: string | null;
  aliases?: string[];
  revisarAte?: Date | null;
}

export async function criarItem(
  tenantId: string,
  userId: string,
  dados: DadosItem,
): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    const [criado] = await tx
      .insert(knowledgeItems)
      .values({
        tenantId,
        title: dados.titulo.trim(),
        body: dados.corpo.trim(),
        kind: dados.tipo,
        categoryId: dados.categoriaId ?? null,
        aliases: dados.aliases ?? [],
        reviewDueAt: dados.revisarAte ?? null,
        status: 'rascunho',
        sourceType: 'manual',
        createdBy: userId,
        updatedBy: userId,
      })
      .returning({ id: knowledgeItems.id });

    return criado!.id;
  });
}

export async function atualizarItem(
  tenantId: string,
  userId: string,
  itemId: string,
  dados: Partial<DadosItem>,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .select({ status: knowledgeItems.status })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, itemId))
      .limit(1);

    if (!item) throw naoEncontrado('Este item de conhecimento');

    await tx
      .update(knowledgeItems)
      .set({
        ...(dados.titulo !== undefined ? { title: dados.titulo.trim() } : {}),
        ...(dados.corpo !== undefined ? { body: dados.corpo.trim() } : {}),
        ...(dados.tipo !== undefined ? { kind: dados.tipo } : {}),
        ...(dados.categoriaId !== undefined ? { categoryId: dados.categoriaId } : {}),
        ...(dados.aliases !== undefined ? { aliases: dados.aliases } : {}),
        ...(dados.revisarAte !== undefined ? { reviewDueAt: dados.revisarAte } : {}),
        updatedBy: userId,
      })
      .where(eq(knowledgeItems.id, itemId));
  });

  // Item publicado que muda precisa ser reindexado na hora: o agente responde
  // com o texto novo a partir da próxima mensagem.
  await indexarItem(tenantId, itemId);
}

/**
 * Publicar.
 *
 * Cria a versão imutável, muda o status e reindexa. As três coisas juntas, em
 * ordem: sem a versão, o histórico mente; sem a reindexação, o agente continua
 * respondendo o texto antigo — que é a incoerência mais difícil de diagnosticar
 * depois.
 */
export async function publicarItem(
  tenantId: string,
  userId: string,
  itemId: string,
  nota?: string,
): Promise<number> {
  const log = childLogger({ tenantId, userId });

  const versao = await withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .select({
        titulo: knowledgeItems.title,
        corpo: knowledgeItems.body,
        tipo: knowledgeItems.kind,
        versao: knowledgeItems.version,
        status: knowledgeItems.status,
      })
      .from(knowledgeItems)
      .where(eq(knowledgeItems.id, itemId))
      .limit(1);

    if (!item) throw naoEncontrado('Este item de conhecimento');
    if (!item.corpo.trim()) {
      throw conflito('O item está sem conteúdo. Escreva a resposta antes de publicar.');
    }

    const novaVersao = item.status === 'publicado' ? item.versao + 1 : item.versao;

    await tx.insert(knowledgeVersions).values({
      tenantId,
      itemId,
      version: novaVersao,
      title: item.titulo,
      body: item.corpo,
      kind: item.tipo,
      changeNote: nota?.trim() || null,
      authorId: userId,
    });

    await tx
      .update(knowledgeItems)
      .set({
        status: 'publicado',
        version: novaVersao,
        publishedBy: userId,
        publishedAt: new Date(),
        updatedBy: userId,
        archivedAt: null,
      })
      .where(eq(knowledgeItems.id, itemId));

    return novaVersao;
  });

  await indexarItem(tenantId, itemId);
  log.info({ itemId, versao }, 'conhecimento publicado');

  return versao;
}

/**
 * Arquivar.
 *
 * O item sai do ar para o agente — os trechos são removidos do índice — mas
 * continua visível no console com todo o histórico. Apagar destruiria a
 * resposta à pergunta "o que a gente respondia antes?".
 */
export async function arquivarItem(
  tenantId: string,
  userId: string,
  itemId: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(knowledgeItems)
      .set({ status: 'arquivado', archivedAt: new Date(), updatedBy: userId })
      .where(eq(knowledgeItems.id, itemId));

    const { knowledgeChunks } = await import('@otto/db');
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.itemId, itemId));
  });

  childLogger({ tenantId, userId }).info({ itemId }, 'conhecimento arquivado');
}

export async function listarCategorias(
  tenantId: string,
): Promise<{ id: string; nome: string; descricao: string | null; itens: number }[]> {
  return withTenant(tenantId, (tx) =>
    tx
      .select({
        id: knowledgeCategories.id,
        nome: knowledgeCategories.name,
        descricao: knowledgeCategories.description,
        itens: sql<number>`(
          select count(*)::int from knowledge_items ki
          where ki.category_id = ${knowledgeCategories.id}
            and ki.status <> 'arquivado'
        )`,
      })
      .from(knowledgeCategories)
      .orderBy(asc(knowledgeCategories.position), asc(knowledgeCategories.name)),
  );
}

/**
 * Registra que um item fundamentou uma resposta.
 *
 * Alimenta a pergunta "o que a minha IA realmente usa?" — um item publicado há
 * meses e nunca utilizado costuma estar escrito com palavras que ninguém usa.
 */
export async function registrarUso(tenantId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;

  await withTenant(tenantId, (tx) =>
    tx
      .update(knowledgeItems)
      .set({
        usageCount: sql`${knowledgeItems.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(sql`${knowledgeItems.id} = any(${itemIds})`),
  );
}
