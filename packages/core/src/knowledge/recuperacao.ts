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
  /** Fusão dos dois caminhos, não a distância bruta de nenhum deles. */
  escore: number;
  /** Como este trecho chegou aqui. Aparece na auditoria da resposta. */
  origem: 'texto' | 'vetor' | 'ambos';
  /**
   * Cosseno entre a pergunta e este trecho (0..1), ou `null` quando a busca
   * vetorial não rodou — sem embedding, ou trecho ainda sem vetor.
   *
   * É a medida **absoluta** do sinal semântico, e existir aqui é o que permite
   * a semântica fundamentar uma resposta. Antes, a busca vetorial devolvia
   * apenas ordem: um trecho podia ser o vizinho mais próximo por acaso, e a
   * decisão não tinha como distinguir "muito parecido" de "o menos distante
   * entre coisas distantes". Ordem não responde essa pergunta; distância sim.
   */
  similaridade: number | null;
  /**
   * Melhor semelhança por trigramas entre um termo da pergunta e o texto do
   * trecho (0..1), via `pg_trgm`.
   *
   * Existe porque o stemmer do português é irregular de um jeito que a
   * cobertura não consegue absorver: `feriado` reduz a `feri` e `feriados` a
   * `feriad`, então singular e plural da **mesma palavra** não casam; o mesmo
   * vale para `abre`/`abrem` e `horas`/`horário`. Medido nesta base, "Vocês
   * abrem no feriado?" tinha cobertura zero contra o item chamado
   * "Funcionamento em feriados".
   *
   * O trigrama trabalha no caractere, então atravessa flexão sem depender de
   * dicionário. Ele **não** substitui a cobertura: sozinho aceita "vendem" ×
   * "vendemos" com 0,800 e deixaria passar "vendem pneu de caminhão?". Serve
   * como segunda forma de corroborar, nunca como autorização.
   */
  trigrama: number;
  /**
   * Fração dos termos significativos da pergunta presentes neste trecho (0..1).
   *
   * É a medida de qualidade **absoluta** da correspondência, e o `escore` não
   * substitui: o RRF ordena, mas o primeiro colocado de uma busca ruim continua
   * sendo o primeiro colocado. Sem esta fração, "vendem pneu de caminhão?"
   * casava a palavra "vendem" com um item sobre padaria e o agente respondia
   * sobre açougue — exatamente a alucinação que o produto existe para evitar.
   */
  cobertura: number;
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

    const fundidos = fundir(porTexto, porVetor, limite, escoreMinimo);
    if (!fundidos.length) return fundidos;

    // O trigrama é medido depois da fusão, e não dentro das duas buscas, porque
    // o caso que ele existe para resolver é justamente o trecho que a busca
    // textual **não** devolveu — medir só onde o texto já casou não ajudaria
    // ninguém. São poucas linhas neste ponto, então uma consulta extra sai
    // barata comparada a calcular trigrama sobre a base inteira duas vezes.
    const trigramas = await semelhancaPorTrigrama(
      tx,
      consulta,
      fundidos.map((t) => t.chunkId),
    );
    for (const trecho of fundidos) trecho.trigrama = trigramas.get(trecho.chunkId) ?? 0;

    return fundidos;
  });
}

interface LinhaBruta extends Record<string, unknown> {
  chunkId: string;
  itemId: string;
  titulo: string;
  conteudo: string;
  tipo: string;
  /** Quantos termos da pergunta este trecho contém, e quantos ela tinha. */
  termosCasados?: number;
  termosTotal?: number;
  /** Cosseno com a pergunta, só na lista vetorial. */
  similaridade?: number;
}

/**
 * Termos de cortesia, descontados do **denominador** da cobertura.
 *
 * `to_tsvector` descarta as stopwords do português, mas cumprimento não é
 * stopword: `oi`, `bom`, `dia`, `obrigado` sobrevivem e entram na conta como se
 * fossem assunto. O efeito é perverso justamente na forma mais educada de
 * perguntar — medido nesta base, "Oi, bom dia, vocês funcionam domingo?" tinha
 * cobertura 0,333 contra 0,667 da mesma pergunta sem o cumprimento, e a versão
 * educada era recusada enquanto a seca era respondida.
 *
 * São descontados só da cobertura, **não** da `tsquery`: tirá-los da busca
 * mudaria o `ts_rank_cd` e, com ele, a ordem sobre a qual os limiares foram
 * calibrados. Eles não atrapalham o ranking; atrapalham a contagem.
 *
 * A lista está em lexemas já stemizados, que é a forma com que chegam.
 */
const CORTESIA = [
  'oi', 'oie', 'ola', 'ai', 'bom', 'boa', 'dia', 'tard', 'noit',
  'tudo', 'bem', 'favor', 'obrig', 'obrigad', 'agradec', 'desculp',
  'licenc', 'gent', 'amig', 'querid', 'ei', 'opa', 'alo',
];

/** Literal de array para o SQL. Constante do módulo — não vem de entrada. */
const CORTESIA_SQL = sql.raw(
  `array[${CORTESIA.map((t) => `'${t}'`).join(',')}]::text[]`,
);

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
    -- O denominador da cobertura ignora cortesia. Se a pergunta for *só*
    -- cumprimento, cai de volta na lista inteira em vez de dividir por zero.
    uteis as (
      select case
        when lista is null then null
        when cardinality(coalesce(filtrada, '{}')) = 0 then lista
        else filtrada
      end as lista
      from termos,
        lateral (
          select array_agg(l) as filtrada
          from unnest(termos.lista) as l
          where l <> all (${CORTESIA_SQL})
        ) f
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
      i.kind::text   as "tipo",
      -- Quantos termos da pergunta este trecho de fato contém. É o que separa
      -- "casou em uma palavra qualquer" de "responde a pergunta".
      (
        select count(*)::int
        from unnest(u.lista) as termo
        where c.content_tsv @@ to_tsquery('pt_unaccent', termo)
      )              as "termosCasados",
      cardinality(u.lista) as "termosTotal"
    from knowledge_chunks c
    join knowledge_items i on i.id = c.item_id
    cross join pergunta p
    cross join uteis u
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
      i.kind::text   as "tipo",
      -- O cosseno sai junto com a linha. Ordenar por ele e descartá-lo deixava
      -- a decisão sem a única medida absoluta que o caminho semântico tem: a
      -- busca vetorial **sempre** devolve um vizinho mais próximo, e sem a
      -- distância não há como separar "muito parecido" de "o menos distante
      -- entre coisas distantes".
      (1 - (c.embedding <=> ${literal}::vector))::float8 as "similaridade"
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
 * Melhor semelhança por trigramas entre um termo da pergunta e cada trecho.
 *
 * `word_similarity(termo, texto)` procura o trecho de `texto` que melhor casa
 * com `termo`, então mede a palavra e não o documento inteiro — sem isso um
 * texto longo diluiria qualquer termo curto até zero.
 *
 * O `unaccent()` aqui é chamada de função, não a configuração `pt_unaccent`:
 * este valor é calculado em tempo de consulta e nunca vai para índice nem para
 * coluna gerada, que é onde a imutabilidade seria exigida.
 */
async function semelhancaPorTrigrama(
  tx: TenantTransaction,
  consulta: string,
  chunkIds: string[],
): Promise<Map<string, number>> {
  const { rows } = await tx.execute<{ chunkId: string; trigrama: number }>(sql`
    with termos as (
      select array_agg(distinct lexeme) as lista
      from unnest(to_tsvector('pt_unaccent', ${consulta})) as t(lexeme)
    )
    select
      c.id as "chunkId",
      coalesce((
        select max(word_similarity(termo, unaccent(c.content)))
        from unnest(t.lista) as termo
      ), 0)::float8 as "trigrama"
    from knowledge_chunks c
    cross join termos t
    -- A lista chega como um texto separado por vírgula e é reaberta no
    -- servidor. Passar o array do JavaScript direto para \`any()\` não funciona:
    -- o driver não o tipa, e o Postgres recusa tanto o cast para \`uuid[]\`
    -- (42846) quanto o operador (42883). São ids que nós mesmos acabamos de
    -- ler do banco, e uuid não contém vírgula.
    where c.id::text = any(string_to_array(${chunkIds.join(',')}, ','))
  `);

  return new Map(rows.map((r) => [r.chunkId, Number(r.trigrama)]));
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
    {
      linha: LinhaBruta;
      escore: number;
      noTexto: boolean;
      noVetor: boolean;
      similaridade: number | null;
      termosCasados: number | null;
      termosTotal: number | null;
    }
  >();

  const somar = (lista: LinhaBruta[], marca: 'noTexto' | 'noVetor') => {
    lista.forEach((linha, posicao) => {
      const atual = acumulado.get(linha.chunkId) ?? {
        linha,
        escore: 0,
        noTexto: false,
        noVetor: false,
        similaridade: null as number | null,
        termosCasados: null as number | null,
        termosTotal: null as number | null,
      };
      atual.escore += escoreNaPosicao(posicao);
      atual[marca] = true;
      // Cada lista traz uma metade dos sinais. Um trecho que só apareceu no
      // vetor não tem contagem lexical, e vice-versa — daí guardá-los conforme
      // chegam, em vez de ler da última linha vista.
      if (linha.similaridade != null) atual.similaridade = linha.similaridade;
      if (linha.termosTotal != null) {
        atual.termosCasados = linha.termosCasados ?? 0;
        atual.termosTotal = linha.termosTotal;
      }
      acumulado.set(linha.chunkId, atual);
    });
  };

  somar(texto, 'noTexto');
  somar(vetor, 'noVetor');

  return [...acumulado.values()]
    .sort((a, b) => b.escore - a.escore)
    // O piso é uma régua de **posição**, e por isso não pode se aplicar a quem
    // carrega medida absoluta. Um trecho achado só pelo vetor entra na fusão
    // com o escore de uma lista só: na posição 10 ele vale 1/71, abaixo do piso
    // de 1/70, e sumiria antes de `decidirTrecho` chegar a ver a similaridade
    // dele — ainda que fosse 0,95. É o mesmo defeito da porta de posição que
    // tirei do `temFundamento`, uma camada acima. Com quatro itens na base isso
    // nunca dispara; com algumas centenas, dispara sempre.
    .filter((e) => e.escore >= escoreMinimo || e.similaridade != null)
    .slice(0, limite)
    .map((e) => ({
      chunkId: e.linha.chunkId,
      itemId: e.linha.itemId,
      titulo: e.linha.titulo,
      conteudo: e.linha.conteudo,
      tipo: e.linha.tipo,
      escore: e.escore,
      origem: (e.noTexto && e.noVetor ? 'ambos' : e.noTexto ? 'texto' : 'vetor') as
        'texto' | 'vetor' | 'ambos',
      similaridade: e.similaridade,
      // Preenchido logo após a fusão, em `recuperar`.
      trigrama: 0,
      // Ausente da lista textual significa que o trecho não casou **nenhum**
      // termo da pergunta — a busca textual só devolve o que casa. Cobertura
      // zero aqui é informação, não falta de informação.
      cobertura:
        e.termosTotal && e.termosTotal > 0 ? (e.termosCasados ?? 0) / e.termosTotal : 0,
    }));
}

/**
 * Cobertura mínima para uma resposta ser considerada fundamentada.
 *
 * Metade dos termos significativos da pergunta precisa estar no trecho. O valor
 * vem do formato real das perguntas: "vocês aceitam pix?" tem três termos
 * (`voc`, `aceit`, `pix`) e o item correto casa dois — enquanto "vendem pneu de
 * caminhão?" casa apenas um de quatro contra qualquer item da base.
 */
const COBERTURA_MINIMA = 0.5;

/**
 * Similaridade a partir da qual o sinal semântico é considerado forte.
 *
 * Calibrado, não escolhido: `packages/db/scripts/calibrar-fundamento.mjs` mede
 * os dois sinais sobre a base real e um conjunto de perguntas reais. Na medição
 * de 2026-09-05, com `text-embedding-3-small`, as nove perguntas que **têm**
 * fonte ficaram entre 0,434 e 0,677, e as cinco que **não têm** entre 0,244 e
 * 0,326. O limiar fica no meio da margem, mais perto do piso das positivas
 * porque errar para o lado de encaminhar é barato e errar para o lado de
 * responder é o que este produto existe para não fazer.
 *
 * Reexecute a calibração ao trocar o modelo de embedding: a escala do cosseno
 * é do modelo, não nossa, e um limiar herdado de outro modelo não significa
 * nada.
 */
const SIMILARIDADE_FORTE = 0.4;

/**
 * Cobertura mínima quando quem sustenta é a semântica.
 *
 * Deliberadamente baixa — basta **um** termo significativo em comum. Não é uma
 * segunda barreira lexical disfarçada; é a exigência de que a pergunta e o
 * trecho falem, ao menos em uma palavra, da mesma coisa.
 *
 * O que ela impede é preciso: a busca vetorial sempre devolve um vizinho, e sem
 * corroboração "quanto está o arroz?" seria fundamentada pelo item de contato
 * só por ser o menos distante. Na calibração, **todas** as perguntas sem fonte
 * tiveram cobertura exatamente zero — nenhuma dividia um único termo com a
 * base. É essa a assimetria que a regra explora.
 */
const COBERTURA_CORROBORANTE = 0.2;

/**
 * Trigrama a partir do qual a superfície corrobora, mesmo sem cobertura.
 *
 * É a saída para a irregularidade do stemmer. `feriado` e `feriados` reduzem a
 * lexemas diferentes e dão cobertura zero, mas ficam em 0,800 de trigrama —
 * enquanto as perguntas sem fonte ficaram em 0,500. O corte fica entre os dois.
 *
 * Note que 0,800 é também o valor de "vendem" × "vendemos" em "vendem pneu de
 * caminhão?". Isso não é falha do limiar: aquela pergunta é barrada pela
 * similaridade semântica (0,301), que é a outra metade obrigatória da regra.
 * Nenhum destes números autoriza sozinho.
 */
const TRIGRAMA_CORROBORANTE = 0.7;

/** Por que um trecho foi aceito. Vai para a auditoria da resposta. */
export type MotivoFundamento = 'lexico' | 'semantico_corroborado' | null;

/**
 * A regra, isolada do banco e da rede.
 *
 * Função pura de propósito: é a barreira anti-alucinação do produto, e uma
 * barreira que só pode ser exercitada com Postgres e OpenAI de pé não é
 * exercitada. Aqui ela é uma tabela de casos.
 */
export function decidirTrecho(
  cobertura: number,
  similaridade: number | null,
  trigrama = 0,
): MotivoFundamento {
  // Léxico forte basta sozinho: metade dos termos da pergunta está no trecho.
  // Continua valendo sem embedding nenhum, que é a degradação desejada quando
  // o provedor de vetor cai.
  if (cobertura >= COBERTURA_MINIMA) return 'lexico';

  // Daqui para baixo, a semântica é obrigatória.
  if (similaridade == null || similaridade < SIMILARIDADE_FORTE) return null;

  // …e precisa de corroboração na superfície do texto. Duas formas servem,
  // porque uma só não cobre o português: a cobertura falha em flexão irregular
  // (`feriado`/`feriados`), e o trigrama sozinho casa parentesco acidental
  // (`vendem`/`vendemos`). Exigir as duas recusaria perguntas legítimas;
  // aceitar qualquer uma, com a semântica já exigida acima, não.
  const corroborado =
    cobertura >= COBERTURA_CORROBORANTE || trigrama >= TRIGRAMA_CORROBORANTE;

  return corroborado ? 'semantico_corroborado' : null;
}

/**
 * Se o que foi recuperado sustenta uma resposta.
 *
 * Esta é a regra que impede a alucinação, e ela é **código**, não instrução de
 * prompt: um modelo pode ignorar instrução; não pode ignorar um `if`.
 *
 * O critério é de **qualidade absoluta**, não de posição. O RRF ordena bem, mas
 * o primeiro colocado de uma busca ruim continua sendo o primeiro colocado — e
 * como a busca textual liga os termos com OU, quase toda pergunta encontra
 * alguma coisa. Sem a cobertura, "vendem pneu de caminhão?" casava a palavra
 * "vendem" e o agente respondia sobre açougue e padaria.
 */
export function temFundamento(trechos: TrechoRecuperado[]): boolean {
  return trechos.some((t) => decidirTrecho(t.cobertura, t.similaridade, t.trigrama) !== null);
}

/**
 * Qual trecho sustenta a resposta, e por quê. `null` quando nenhum sustenta.
 *
 * Percorre **todos** os trechos, e não apenas o primeiro. O RRF ordena pela
 * fusão das duas listas, então o trecho semanticamente mais próximo pode ficar
 * em segundo se um trecho fraco dominou a lista textual. Olhar só `trechos[0]`
 * fazia a decisão depender da ordem, quando os critérios são absolutos.
 *
 * Também não há mais porta de posição (`escore >= …`): ela vetava em silêncio
 * exatamente o caso novo — um trecho achado só pelo vetor cai para o fim da
 * fusão e reprovaria com similaridade 0,95.
 */
export function trechoQueSustenta(
  trechos: TrechoRecuperado[],
): { trecho: TrechoRecuperado; motivo: MotivoFundamento } | null {
  let melhor: { trecho: TrechoRecuperado; motivo: MotivoFundamento } | null = null;

  for (const trecho of trechos) {
    const motivo = decidirTrecho(trecho.cobertura, trecho.similaridade, trecho.trigrama);
    if (!motivo) continue;
    // Empate resolvido pela cobertura: entre dois trechos que autorizam, o que
    // compartilha mais termos com a pergunta é o mais provável de respondê-la.
    if (!melhor || trecho.cobertura > melhor.trecho.cobertura) melhor = { trecho, motivo };
  }

  return melhor;
}
