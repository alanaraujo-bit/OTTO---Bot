import { and, eq, isNull, knowledgeChunks, knowledgeItems, withTenant } from '@otto/db';
import { logger } from '@otto/shared';

/**
 * Indexação do conhecimento.
 *
 * Publicar um item recorta o conteúdo em trechos e os regrava. O embedding vem
 * depois, em segundo plano: a publicação não pode ficar esperando um fornecedor
 * externo, e a busca textual já funciona sem ele.
 */

/**
 * Tamanho do trecho, em caracteres.
 *
 * Itens curtos — a maioria em uma base curada — viram um trecho só. Recuperar
 * uma política inteira para responder "aceita PIX?" gasta contexto e dilui o
 * sinal, então documentos longos são partidos.
 */
const ALVO = 700;
const MAXIMO = 1000;
/** Sobreposição entre trechos, para a resposta não ser cortada na emenda. */
const SOBREPOSICAO = 120;

/**
 * Recorta preferindo fronteiras que uma pessoa reconheceria: parágrafo, depois
 * frase. Cortar no meio de uma frase produz trecho que não se sustenta sozinho.
 */
export function recortar(texto: string): string[] {
  const limpo = texto.trim().replace(/\r\n/g, '\n');
  if (limpo.length <= MAXIMO) return [limpo];

  const paragrafos = limpo.split(/\n{2,}/).filter((p) => p.trim());
  const trechos: string[] = [];
  let atual = '';

  for (const paragrafo of paragrafos) {
    if (atual && atual.length + paragrafo.length + 2 > ALVO) {
      trechos.push(atual.trim());
      // Recomeça com a cauda do anterior, para não perder a emenda.
      atual = atual.slice(-SOBREPOSICAO) + '\n\n';
    }

    if (paragrafo.length > MAXIMO) {
      // Parágrafo grande demais: quebra por frase.
      const frases = paragrafo.match(/[^.!?]+[.!?]+|\S+$/g) ?? [paragrafo];
      for (const frase of frases) {
        if (atual.length + frase.length > ALVO && atual.trim()) {
          trechos.push(atual.trim());
          atual = '';
        }
        atual += frase;
      }
    } else {
      atual += paragrafo + '\n\n';
    }
  }

  if (atual.trim()) trechos.push(atual.trim());
  return trechos.filter((t) => t.length > 0);
}

/**
 * Regrava os trechos de um item.
 *
 * Apaga e reinsere, em uma transação. A alternativa — comparar e atualizar em
 * lugar — só valeria se o embedding sobrevivesse, e ele não sobrevive: o texto
 * mudou, então o vetor está errado de qualquer forma.
 */
export async function indexarItem(tenantId: string, itemId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .select({ titulo: knowledgeItems.title, corpo: knowledgeItems.body, aliases: knowledgeItems.aliases })
      .from(knowledgeItems)
      .where(and(eq(knowledgeItems.id, itemId), eq(knowledgeItems.tenantId, tenantId)))
      .limit(1);

    if (!item) return 0;

    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.itemId, itemId));

    // O título entra no texto indexado: "Formas de pagamento aceitas" é
    // frequentemente a melhor correspondência para "como posso pagar", e o corpo
    // sozinho pode nem repetir essas palavras.
    const aliases = Array.isArray(item.aliases) ? (item.aliases as string[]) : [];
    const cabecalho = aliases.length
      ? `${item.titulo}\n(também perguntado como: ${aliases.join('; ')})`
      : item.titulo;

    const partes = recortar(item.corpo);
    const trechos = partes.map((conteudo, posicao) => ({
      tenantId,
      itemId,
      position: posicao,
      // O cabeçalho acompanha todo trecho: recuperado isolado, ele precisa
      // dizer de onde veio.
      content: `${cabecalho}\n\n${conteudo}`,
    }));

    if (trechos.length) await tx.insert(knowledgeChunks).values(trechos);

    logger.debug({ tenantId, itemId, trechos: trechos.length }, 'item indexado');
    return trechos.length;
  });
}

/** Trechos ainda sem vetor. O worker consome esta fila. */
export async function trechosSemEmbedding(
  tenantId: string,
  limite = 50,
): Promise<{ id: string; conteudo: string }[]> {
  return withTenant(tenantId, async (tx) => {
    const linhas = await tx
      .select({ id: knowledgeChunks.id, conteudo: knowledgeChunks.content })
      .from(knowledgeChunks)
      .where(isNull(knowledgeChunks.embeddingModel))
      .limit(limite);
    return linhas;
  });
}
