import { messages, sql, users, withTenant } from '@otto/db';

import { decidirTrecho } from '../knowledge/recuperacao.ts';

/**
 * O que a equipe já disse **nesta conversa**.
 *
 * ## Por que isto existe
 *
 * Medido em produção: um operador respondeu "o cuscuz está 4,99", e quarenta
 * segundos depois a Bia ofereceu chamar a equipe para a mesma pergunta. Ela
 * oferecia chamar a pessoa que acabara de responder.
 *
 * A investigação mostrou duas causas, e nenhuma delas era falta de memória:
 *
 * 1. `historicoDaConversa` só é consultado **depois** da barreira de
 *    fundamento. Sem fundamento, o modelo não é chamado, e o histórico nunca
 *    chega a ele. O contexto não foi insuficiente — ele não foi lido.
 * 2. O histórico colapsava `operador` e `agente` no mesmo papel `assistente`,
 *    então o modelo não teria como distinguir "um humano da equipe afirmou
 *    isto" de "eu mesma disse isto".
 *
 * ## Por que não há tabela nova
 *
 * `messages` **já é** o registro por sessão, com autor, texto, ordem e
 * timestamp. Criar uma camada de "fatos da conversa" duplicaria isso e criaria
 * uma segunda verdade para manter em dia. O que faltava não era onde guardar —
 * era a barreira reconhecer o operador como fonte, e a proveniência sobreviver
 * até o prompt.
 *
 * ## O que isto **não** faz
 *
 * Não promove nada a conhecimento. O que o operador diz vale **nesta conversa e
 * só nela**: um preço dito para um cliente hoje não é política da empresa, e
 * transformá-lo em fato global é exatamente a contaminação que o §8 da
 * arquitetura proíbe. Conversa vira conhecimento por revisão humana, nunca
 * sozinha.
 */

export interface FalaDoOperador {
  mensagemId: string;
  texto: string;
  autor: string;
  em: Date;
}

/** Quantas falas do operador olhar para trás. */
const JANELA = 12;

/**
 * Falas da equipe na conversa, da mais recente para a mais antiga.
 *
 * A ordem é o mecanismo de correção: se o operador disse 4,99 e depois
 * corrigiu para 5,49, a primeira que casar é a mais nova. Não é preciso
 * detectar que uma contradiz a outra — basta preferir a última palavra, que é
 * o que uma pessoa faria lendo a conversa.
 */
export async function falasDoOperador(
  tenantId: string,
  conversationId: string,
): Promise<FalaDoOperador[]> {
  return withTenant(tenantId, async (tx) => {
    const linhas = await tx.execute<{
      id: string;
      body: string;
      nome: string | null;
      created_at: string;
    }>(sql`
      select m.id, m.body, u.name as nome, m.created_at
        from ${messages} m
        left join ${users} u on u.id = m.author_user_id
       where m.conversation_id = ${conversationId}
         and m.author = 'operador'
         and m.body is not null
         and length(trim(m.body)) > 0
       order by m.created_at desc
       limit ${JANELA}
    `);

    return linhas.rows.map((l) => ({
      mensagemId: l.id,
      texto: l.body.trim(),
      autor: l.nome ?? 'a equipe',
      em: new Date(l.created_at),
    }));
  });
}

/**
 * A fala da equipe que responde a pergunta, se houver.
 *
 * Reusa `decidirTrecho` — a **mesma** regra calibrada que decide o
 * conhecimento. Duas regras para a mesma pergunta divergiriam com o tempo, e a
 * que estivesse errada seria a que o cliente veria. De graça, isso já descarta
 * "Oi, tudo bem?" como resposta a uma pergunta de preço.
 *
 * A cobertura e o trigrama saem do Postgres, com a mesma configuração de busca
 * do resto; a similaridade sai do cosseno contra o embedding da pergunta, que o
 * agente já calculou.
 */
export async function falaQueResponde(
  tenantId: string,
  pergunta: string,
  falas: FalaDoOperador[],
  embeddings: Map<string, number[]>,
  embeddingDaPergunta: number[] | null,
): Promise<FalaDoOperador | null> {
  if (!falas.length) return null;

  const sinais = await sinaisLexicais(tenantId, pergunta, falas);

  // `falas` já vem da mais recente para a mais antiga: a primeira que passar é
  // a última palavra da equipe sobre o assunto.
  for (const fala of falas) {
    const lexico = sinais.get(fala.mensagemId);
    if (!lexico) continue;

    const vetor = embeddings.get(fala.mensagemId);
    const similaridade =
      vetor && embeddingDaPergunta ? cosseno(embeddingDaPergunta, vetor) : null;

    if (decidirTrecho(lexico.cobertura, similaridade, lexico.trigrama)) return fala;
  }

  return null;
}

/**
 * Cobertura e trigrama de cada fala contra a pergunta.
 *
 * Uma consulta só, com as falas entrando como `values`: o cálculo precisa da
 * mesma configuração `pt_unaccent` e do mesmo `word_similarity` usados na
 * recuperação, e reimplementá-los em JavaScript daria dois resultados
 * diferentes para a mesma regra.
 */
async function sinaisLexicais(
  tenantId: string,
  pergunta: string,
  falas: FalaDoOperador[],
): Promise<Map<string, { cobertura: number; trigrama: number }>> {
  const valores = sql.join(
    falas.map((f) => sql`(${f.mensagemId}, ${f.texto})`),
    sql`, `,
  );

  return withTenant(tenantId, async (tx) => {
    const { rows } = await tx.execute<{
      id: string;
      cobertura: number;
      trigrama: number;
    }>(sql`
      with termos as (
        select array_agg(distinct lexeme) as lista
        from unnest(to_tsvector('pt_unaccent', ${pergunta})) as t(lexeme)
      ),
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
      falas(id, texto) as (values ${valores})
      select
        f.id,
        coalesce((
          select count(*)::float8
          from unnest(u.lista) as termo
          where to_tsvector('pt_unaccent', f.texto) @@ to_tsquery('pt_unaccent', termo)
        ) / nullif(cardinality(u.lista), 0), 0)::float8 as "cobertura",
        coalesce((
          select max(word_similarity(termo, unaccent(f.texto)))
          from unnest(u.lista) as termo
        ), 0)::float8 as "trigrama"
      from falas f
      cross join uteis u
    `);

    return new Map(
      rows.map((r) => [
        r.id,
        { cobertura: Number(r.cobertura), trigrama: Number(r.trigrama) },
      ]),
    );
  });
}

/**
 * Cortesia fora do denominador — mesma lista da recuperação, mesma razão.
 *
 * Duplicada aqui como literal SQL porque a constante de `recuperacao.ts` é
 * privada ao módulo. Se uma terceira consulta precisar dela, vira export.
 */
const CORTESIA_SQL = sql.raw(
  `array[${[
    'oi', 'oie', 'ola', 'ai', 'bom', 'boa', 'dia', 'tard', 'noit',
    'tudo', 'bem', 'favor', 'obrig', 'obrigad', 'agradec', 'desculp',
    'licenc', 'gent', 'amig', 'querid', 'ei', 'opa', 'alo',
  ]
    .map((t) => `'${t}'`)
    .join(',')}]::text[]`,
);

function cosseno(a: number[], b: number[]): number {
  let produto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    produto += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denominador = Math.sqrt(na) * Math.sqrt(nb);
  return denominador === 0 ? 0 : produto / denominador;
}

/**
 * O bloco que vai para o modelo.
 *
 * Diz **quem** falou e **quando**, e instrui a atribuir. Sem isso a Bia
 * repetiria "o cuscuz está 5,49" como se fosse política da casa — que é a mesma
 * alucinação que o produto existe para evitar, só que lavada por um humano.
 */
export function blocoDoOperador(fala: FalaDoOperador, fuso: string): string {
  const hora = fala.em.toLocaleTimeString('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    'INFORMADO PELA EQUIPE NESTA CONVERSA\n' +
    'Isto não é conhecimento oficial da empresa: foi dito por uma pessoa da ' +
    'equipe, para este cliente, agora. Vale nesta conversa.\n' +
    'Ao usar, deixe claro que a informação veio do atendimento — por exemplo ' +
    '"como a equipe te informou". Não apresente como política da loja, e não ' +
    'estenda para outros produtos ou situações.\n' +
    '---\n' +
    `${fala.autor} informou às ${hora}: ${fala.texto}`
  );
}
