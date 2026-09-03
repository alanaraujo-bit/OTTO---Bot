import { sql, withTenant, type TenantTransaction } from '@otto/db';

/**
 * Recuperação de conhecimento.
 *
 * Busca híbrida: full-text em português sem acento **e** similaridade vetorial,
 * fundidos por *reciprocal rank fusion*. Os dois caminhos são independentes de
 * propósito:
 *
 * · O texto resolve bem uma base curada de algumas centenas de itens, não custa
 *   nada e não depende de fornecedor externo.
 * · O vetor cobre a pergunta feita com palavras diferentes das do documento —
 *   "dá pra pagar com o cartão do vale?" contra um item que diz
 *   "vale-alimentação".
 *
 * Se a geração de embeddings falhar ou o provedor cair, a recuperação **degrada
 * para texto puro** em vez de parar. É por isso que o vetor entra como argumento
 * opcional em vez de ser buscado aqui dentro.
 */

export interface TrechoRecuperado {
  itemId: string;
  chunkId: string;
  titulo: string;
  conteudo: string;
  tipo: string;
  /** 0..1. Fusão dos dois caminhos, não a distância bruta de nenhum deles. */
  escore: number;
  /** Como este trecho chegou aqui. Aparece na auditoria da resposta. */
  origem: 'texto' | 'vetor' | 'ambos';
}

export interface OpcoesRecuperacao {
  /** Quantos trechos devolver. Acima de 6 o contexto dilui em vez de ajudar. */
  limite?: number;
  /**
   * Vetor da pergunta. Ausente → só busca textual, o que é degradação
   * aceitável e não erro.
   */
  embedding?: number[] | null;
  /** Abaixo disso o trecho não entra no contexto. */
  escoreMinimo?: number;
}

/**
 * Constante do RRF. 60 é o valor da literatura original e funciona bem: alto o
 * suficiente para que a primeira posição não domine, baixo o suficiente para
 * que a ordem ainda importe.
 */
const K_RRF = 60;

/** Escore de um trecho na posição `n` (base zero) de uma das listas. */
const escoreNaPosicao = (n: number) => 1 / (K_RRF + n + 1);

/**
 * Piso de escore.
 *
 * Precisa ser derivado da escala do RRF, não escolhido à mão: com K=60, o
 * primeiro colocado de uma lista vale ~0,0164, e qualquer piso "redondo" acima
 * disso descarta silenciosamente **todos** os resultados. Foi exatamente o que
 * aconteceu com um piso de 0,02 — a busca funcionava e a recuperação devolvia
 * vazio.
 *
 * O valor aqui aceita um trecho que apareceu razoavelmente bem em uma das
 * listas, e o `temFundamento` continua exigindo mais para autorizar resposta.
 */
const PISO_PADRAO = escoreNaPosicao(9);

export async function recuperar(
  tenantId: string,
  pergunta: string,
  opcoes: OpcoesRecuperacao = {},
): Promise<TrechoRecuperado[]> {
  const { limite = 5, embedding = null, escoreMinimo = PISO_PADRAO } = opcoes;

  const consulta = pergunta.trim();
  if (consulta.length < 2) return [];

  return withTenant(tenantId, async (tx) => {
    const porTexto = await buscaTextual(tx, consulta, limite * 3);
    const porVetor = embedding ? await buscaVetorial(tx, embedding, limite * 3) : [];

    return fundir(porTexto, porVetor, limite, escoreMinimo);
  });
}

interface LinhaBruta extends Record<string, unknown> {
  chunkId: string;
  itemId: string;
  titulo: string;
  conteudo: string;
  tipo: string;
}

/**
 * Full-text sobre a coluna gerada `content_tsv`, que usa a configuração
 * `pt_unaccent` — "acougue" encontra "açougue", e cliente digitando no celular
 * não põe acento.
 *
 * **Os termos são combinados com OU, não com E.** Esta é a decisão que faz a
 * busca funcionar para perguntas de gente de verdade: `websearch_to_tsquery` e
 * `plainto_tsquery` ligam tudo com E, então "vocês aceitam pix?" exigiria que o
 * documento contivesse também "vocês" — e nenhum item da base contém. A pergunta
 * simplesmente não encontraria nada.
 *
 * Com OU, quem separa o relevante do acidental é o `ts_rank_cd`: um item que casa
 * "aceita" e "pix" pontua muito acima de um que casa só uma palavra comum. E o
 * RRF depois exige corroboração para o trecho entrar no contexto.
 */
async function buscaTextual(
  tx: TenantTransaction,
  consulta: string,
  limite: number,
): Promise<LinhaBruta[]> {
  // to_tsvector já aplica stemming e descarta as stopwords do português, então
  // o que sobra em `termos` são as palavras que de fato carregam sentido.
  const { rows } = await tx.execute<LinhaBruta>(sql`
    with termos as (
      select array_agg(distinct lexeme) as lista
      from unnest(to_tsvector('pt_unaccent', ${consulta})) as t(lexeme)
    ),
    pergunta as (
      select case
        when lista is null or cardinality(lista) = 0 then null
        else to_tsquery('pt_unaccent', array_to_string(lista, ' | '))
      end as tsq
      from termos
    )
    select
      c.id           as "chunkId",
      c.item_id      as "itemId",
      i.title        as "titulo",
      c.content      as "conteudo",
      i.kind::text   as "tipo"
    from knowledge_chunks c
    join knowledge_items i on i.id = c.item_id
    cross join pergunta p
    where i.status = 'publicado'
      and (i.valid_from is null or i.valid_from <= now())
      and (i.valid_until is null or i.valid_until >= now())
      and c.content_tsv @@ p.tsq
    order by ts_rank_cd(c.content_tsv, p.tsq) desc
    limit ${limite}
  `);
  return rows;
}

/**
 * Vizinhos mais próximos por cosseno, usando o índice HNSW.
 *
 * O vetor entra como literal formatado, e não como parâmetro: o driver enviaria
 * um array do Postgres, e o operador `<=>` precisa do tipo `vector`.
 */
async function buscaVetorial(
  tx: TenantTransaction,
  embedding: number[],
  limite: number,
): Promise<LinhaBruta[]> {
  const literal = `[${embedding.join(',')}]`;

  const { rows } = await tx.execute<LinhaBruta>(sql`
    select
      c.id           as "chunkId",
      c.item_id      as "itemId",
      i.title        as "titulo",
      c.content      as "conteudo",
      i.kind::text   as "tipo"
    from knowledge_chunks c
    join knowledge_items i on i.id = c.item_id
    where i.status = 'publicado'
      and c.embedding is not null
      and (i.valid_from is null or i.valid_from <= now())
      and (i.valid_until is null or i.valid_until >= now())
    order by c.embedding <=> ${literal}::vector
    limit ${limite}
  `);
  return rows;
}

/**
 * *Reciprocal rank fusion.*
 *
 * Combina as duas listas pela **posição**, não pela pontuação. É o ponto central:
 * `ts_rank_cd` e distância de cosseno vivem em escalas incomparáveis, e
 * normalizá-las exigiria calibração que envelhece a cada mudança de modelo. A
 * posição é comparável por construção.
 *
 * Um trecho que aparece bem nas duas listas sobe acima de um que domina só uma —
 * exatamente o comportamento desejado.
 */
function fundir(
  texto: LinhaBruta[],
  vetor: LinhaBruta[],
  limite: number,
  escoreMinimo: number,
): TrechoRecuperado[] {
  const acumulado = new Map<
    string,
    { linha: LinhaBruta; escore: number; noTexto: boolean; noVetor: boolean }
  >();

  const somar = (lista: LinhaBruta[], marca: 'noTexto' | 'noVetor') => {
    lista.forEach((linha, posicao) => {
      const atual = acumulado.get(linha.chunkId) ?? {
        linha,
        escore: 0,
        noTexto: false,
        noVetor: false,
      };
      atual.escore += escoreNaPosicao(posicao);
      atual[marca] = true;
      acumulado.set(linha.chunkId, atual);
    });
  };

  somar(texto, 'noTexto');
  somar(vetor, 'noVetor');

  return [...acumulado.values()]
    .sort((a, b) => b.escore - a.escore)
    .filter((e) => e.escore >= escoreMinimo)
    .slice(0, limite)
    .map((e) => ({
      chunkId: e.linha.chunkId,
      itemId: e.linha.itemId,
      titulo: e.linha.titulo,
      conteudo: e.linha.conteudo,
      tipo: e.linha.tipo,
      escore: e.escore,
      origem: e.noTexto && e.noVetor ? 'ambos' : e.noTexto ? 'texto' : 'vetor',
    }));
}

/**
 * Se o que foi recuperado sustenta uma resposta.
 *
 * Esta é a regra que impede a alucinação, e ela é **código**, não instrução de
 * prompt — um modelo pode ignorar instrução; não pode ignorar um `if`.
 *
 * O critério: existir ao menos um trecho, e o melhor deles ter chegado por
 * ambos os caminhos ou com folga clara sobre o piso. Um único acerto fraco de
 * texto costuma ser coincidência de palavra comum.
 */
export function temFundamento(trechos: TrechoRecuperado[]): boolean {
  const melhor = trechos[0];
  if (!melhor) return false;
  if (melhor.origem === 'ambos') return true;
  return melhor.escore >= escoreNaPosicao(2);
}
