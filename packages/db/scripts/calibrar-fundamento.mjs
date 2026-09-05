/**
 * Matriz de calibração do fundamento.
 *
 * Mede, para cada pergunta e cada item da base, os **dois sinais** que decidem
 * se a Bia pode responder:
 *
 * · cobertura lexical — fração dos termos significativos da pergunta presentes
 *   no trecho, calculada pelo mesmo `to_tsvector('pt_unaccent', …)` que a
 *   recuperação usa em produção;
 * · similaridade semântica — cosseno entre o embedding da pergunta e o do
 *   trecho, com o mesmo modelo da produção.
 *
 * Os limiares do `decidirFundamento` **não são escolhidos de memória**: saem da
 * separação que esta matriz mostra entre as perguntas que devem ser respondidas
 * e as que não têm fonte. Rode antes de mexer em qualquer limiar.
 *
 *   node --env-file=.env scripts/calibrar-fundamento.mjs
 *
 * Usa o Postgres de `development` apenas como calculadora de `tsvector` (nada é
 * gravado) e a API de embeddings. Não toca em produção.
 */
import pg from 'pg';

const MODELO = 'text-embedding-3-small';

/** Conteúdo real dos itens publicados em produção (empresa `aionixdev`). */
const BASE = {
  'Horário de funcionamento':
    'A loja abre de segunda a sábado, das 8h às 20h. Aos domingos, das 8h às 14h. Feriados nacionais seguem o horário de domingo.',
  'Endereço e como chegar':
    'Ficamos na Avenida das Palmeiras, 1200, bairro Cidade Nova. A entrada fica ao lado da praça, e há estacionamento gratuito para clientes.',
  'Área de entrega':
    'Entregamos nos bairros Cidade Nova, Centro e Jardim Aurora. Pedidos até as 17h chegam no mesmo dia; depois disso, no dia seguinte pela manhã.',
  'Contato e atendimento humano':
    'O telefone da loja é (94) 3322-1100, das 8h às 18h. Quem preferir falar com uma pessoa pode pedir a qualquer momento por aqui.',
};

/**
 * O conjunto de avaliação.
 *
 * `esperado` é o item que **deve** fundamentar a resposta, ou `null` quando não
 * existe fonte e o certo é encaminhar. As variantes de horário são formas reais
 * de perguntar a mesma coisa — é exatamente onde o casamento lexical falha.
 */
const CASOS = [
  ['Que horas vocês abrem no domingo?', 'Horário de funcionamento'],
  ['Qual o horário de domingo?', 'Horário de funcionamento'],
  ['Oi, bom dia, vocês funcionam domingo?', 'Horário de funcionamento'],
  ['Domingo abre que horas?', 'Horário de funcionamento'],
  ['Vocês ficam abertos domingo?', 'Horário de funcionamento'],
  ['Oiê, bom dia! Que horas vocês abrem no domingo?', 'Horário de funcionamento'],
  ['Onde fica a loja?', 'Endereço e como chegar'],
  ['Vocês entregam no Jardim Aurora?', 'Área de entrega'],
  ['Quero falar com uma pessoa', 'Contato e atendimento humano'],
  // Sem fonte de preço, estoque ou promoção: nenhuma pode ser respondida.
  // A família de preço está deliberadamente sobre-representada — é a que mais
  // se aproxima do limiar, e é a que causa dano se atravessar.
  ['Quanto está o arroz?', null],
  ['Tem promoção de arroz hoje?', null],
  ['Quanto custa o quilo do arroz?', null],
  ['O arroz tá quanto?', null],
  ['Tem oferta hoje?', null],
  ['Quanto sai o quilo?', null],
  ['Vocês fazem desconto?', null],
  ['Tem promoção essa semana?', null],
  ['Qual o preço do feijão?', null],
  ['Tem arroz em estoque?', null],
  ['Vocês aceitam cartão?', null],
  ['Vendem pneu de caminhão?', null],
];

/**
 * Termos de cortesia.
 *
 * Não são stopwords do português — `to_tsvector` mantém `oi`, `bom`, `dia` — e
 * por isso inflam o denominador da cobertura sem acrescentar assunto nenhum.
 * "Oiê, bom dia! Que horas vocês abrem no domingo?" tem 7 termos onde a mesma
 * pergunta sem cumprimento tem 4, e a cobertura cai de 0,25 para 0,14 sem que a
 * pergunta tenha mudado.
 */
const CORTESIA = new Set([
  'oi', 'oie', 'ola', 'ai', 'bom', 'boa', 'dia', 'tard', 'noit',
  'tudo', 'bem', 'favor', 'obrig', 'obrigad', 'agradec', 'desculp',
  'licenc', 'gent', 'amig', 'querid', 'ei', 'opa', 'alo',
]);

const cos = (a, b) => {
  let p = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { p += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return p / (Math.sqrt(na) * Math.sqrt(nb));
};

async function embutir(textos) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODELO, input: textos }),
  });
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data.map((d) => d.embedding);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

/** Lexemas significativos da pergunta, com e sem os termos de cortesia. */
async function termos(pergunta) {
  const { rows } = await c.query(
    `select array_agg(distinct lexeme) as lista
       from unnest(to_tsvector('pt_unaccent', $1)) as t(lexeme)`,
    [pergunta],
  );
  const todos = rows[0].lista ?? [];
  return { todos, uteis: todos.filter((t) => !CORTESIA.has(t)) };
}

async function casados(lista, alvo) {
  if (!lista.length) return 0;
  const { rows } = await c.query(
    `select count(*)::int as n from unnest($1::text[]) l
       where to_tsvector('pt_unaccent', $2) @@ to_tsquery('pt_unaccent', l)`,
    [lista, alvo],
  );
  return rows[0].n;
}

/** Melhor semelhança por trigramas entre um termo e o trecho — o mesmo
 *  `word_similarity` que a recuperação usa para corroborar. */
async function trigrama(lista, alvo) {
  if (!lista.length) return 0;
  const { rows } = await c.query(
    `select coalesce(max(word_similarity(l, unaccent($2))), 0)::float8 as t
       from unnest($1::text[]) l`,
    [lista, alvo],
  );
  return rows[0].t;
}

// Os trechos são indexados como título + corpo (ver `indexacao.ts`).
const titulos = Object.keys(BASE);
const trechos = titulos.map((t) => `${t}\n\n${BASE[t]}`);
const vetoresTrecho = await embutir(trechos);
const vetoresPergunta = await embutir(CASOS.map(([p]) => p));

const linhas = [];
for (let i = 0; i < CASOS.length; i++) {
  const [pergunta, esperado] = CASOS[i];
  const { todos, uteis } = await termos(pergunta);

  let melhor = null;
  for (let k = 0; k < titulos.length; k++) {
    const nCru = await casados(todos, trechos[k]);
    const nUtil = await casados(uteis, trechos[k]);
    const candidato = {
      titulo: titulos[k],
      cobCrua: todos.length ? nCru / todos.length : 0,
      cobertura: uteis.length ? nUtil / uteis.length : 0,
      similaridade: cos(vetoresPergunta[i], vetoresTrecho[k]),
      trigrama: await trigrama(todos, trechos[k]),
    };
    // Espelha `decidirTrecho`: é a regra do produto, não uma aproximação.
    candidato.motivo =
      candidato.cobertura >= 0.5
        ? 'lexico'
        : candidato.similaridade >= 0.4 &&
            (candidato.cobertura >= 0.2 || candidato.trigrama >= 0.7)
          ? 'semantico'
          : null;

    // Interessa o trecho que **autoriza**, e só depois o mais parecido: um
    // negativo que fundamenta por um trecho qualquer é uma falha, mesmo que o
    // vizinho mais próximo fosse inofensivo.
    const ganha =
      !melhor ||
      (candidato.motivo && !melhor.motivo) ||
      (!!candidato.motivo === !!melhor.motivo &&
        candidato.similaridade > melhor.similaridade);
    if (ganha) melhor = candidato;
  }

  linhas.push({
    pergunta,
    esperado,
    achou: melhor.titulo,
    certo: esperado === null ? '—' : melhor.titulo === esperado ? 'sim' : 'NAO',
    cobCrua: melhor.cobCrua,
    cobertura: melhor.cobertura,
    similaridade: melhor.similaridade,
    trigrama: melhor.trigrama,
    motivo: melhor.motivo,
  });
}

const fmt = (n) => n.toFixed(3);
const linha = (l) =>
  `  ${fmt(l.cobertura)}     ${fmt(l.similaridade)}     ${fmt(l.trigrama)}    ` +
  `${(l.motivo ?? 'ENCAMINHA').padEnd(10)} ${l.achou.padEnd(30)} ${l.pergunta}`;

console.log('\nDEVEM SER RESPONDIDAS (existe fonte na base)');
console.log('  cobert.   similar.  trigr.   decisao    item                           pergunta');
for (const l of linhas.filter((l) => l.esperado !== null)) console.log(linha(l));

console.log('\nNAO PODEM SER RESPONDIDAS (sem fonte)');
console.log('  cobert.   similar.  trigr.   decisao    vizinho                        pergunta');
for (const l of linhas.filter((l) => l.esperado === null)) console.log(linha(l));

const pos = linhas.filter((l) => l.esperado !== null);
const neg = linhas.filter((l) => l.esperado === null);
const falsosNegativos = pos.filter((l) => !l.motivo);
const falsosPositivos = neg.filter((l) => l.motivo);

console.log('\nVEREDITO');
console.log(`  positivas respondidas: ${pos.length - falsosNegativos.length}/${pos.length}`);
console.log(`  negativas recusadas:   ${neg.length - falsosPositivos.length}/${neg.length}`);
for (const l of falsosNegativos) console.log(`  FALSO NEGATIVO: ${l.pergunta}`);
for (const l of falsosPositivos) console.log(`  FALSO POSITIVO: ${l.pergunta}`);

// A margem que importa não é a da similaridade sozinha. Uma negativa só é
// perigosa se **também** passar pela corroboração — aí o limiar semântico é a
// única coisa entre ela e uma resposta inventada. É essa a folga real.
const corroboradas = neg.filter((l) => l.cobertura >= 0.2 || l.trigrama >= 0.7);
const maxCorroborada = corroboradas.length
  ? Math.max(...corroboradas.map((l) => l.similaridade))
  : 0;
console.log('\nMARGEM REAL DO LIMIAR SEMANTICO (0,40)');
console.log(`  menor similaridade entre as positivas:            ${fmt(Math.min(...pos.map((l) => l.similaridade)))}`);
console.log(`  negativas que passam na corroboracao:             ${corroboradas.length}/${neg.length}`);
console.log(`  maior similaridade entre essas:                   ${fmt(maxCorroborada)}`);
console.log(`  folga abaixo do limiar:                           ${fmt(0.4 - maxCorroborada)}`);

await c.end();

