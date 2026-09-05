/**
 * Calibração do agrupamento de perguntas sem resposta.
 *
 * O aprendizado só nasce quando a **mesma demanda** aparece várias vezes. Hoje
 * o agrupamento casa string normalizada, e por isso nunca dispara: "Que horas
 * vocês abrem no domingo?" e "Domingo abre que horas?" viram sacos de palavras
 * diferentes (`abrem` ≠ `abre`) e contam como duas perguntas distintas.
 *
 * Aqui se mede a escala real do cosseno **entre perguntas** — que não é a mesma
 * de pergunta contra trecho de conhecimento, e por isso o limiar do fundamento
 * não serve emprestado.
 *
 *   node --env-file=.env packages/db/scripts/calibrar-agrupamento.mjs
 */
const MODELO = 'text-embedding-3-small';

/**
 * Grupos de intenção. Dentro do grupo, é a mesma demanda dita de formas
 * diferentes — deve agrupar. Entre grupos, são assuntos diferentes — não deve.
 *
 * As perguntas marcadas com ← saíram dos sinais reais de produção.
 */
const GRUPOS = {
  horario_domingo: [
    'Que horas vocês abrem no domingo?', // ←
    'Domingo abre que horas?',
    'Qual o horário de domingo?',
    'Vocês ficam abertos domingo?',
    'Oiê, bom dia! Vocês funcionam no domingo?', // ←
  ],
  preco_arroz: [
    'Quanto está o arroz?',
    'Quanto custa o quilo do arroz?', // ←
    'O arroz tá quanto?',
    'Qual o valor do arroz hoje?',
  ],
  pagamento: [
    'Vocês aceitam cartão?', // ←
    'E aceita Pix?', // ←
    'Vocês passam cartão aí?', // ←
    'Dá pra pagar com vale-alimentação?',
  ],
  promocao: [
    'Tem promoção de carne?', // ←
    'Tem promoção essa semana?',
    'Tem oferta hoje?',
    'Vocês fazem desconto?',
  ],
  entrega: [
    'Vocês entregam no Centro?',
    'Fazem entrega em casa?',
    'Tem delivery?',
  ],
};

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
  return (await r.json()).data.map((d) => d.embedding);
}

const nomes = Object.keys(GRUPOS);
const todas = nomes.flatMap((g) => GRUPOS[g].map((p) => ({ grupo: g, texto: p })));
const vetores = await embutir(todas.map((t) => t.texto));

const mesmos = [];
const outros = [];
for (let i = 0; i < todas.length; i++) {
  for (let j = i + 1; j < todas.length; j++) {
    const s = cos(vetores[i], vetores[j]);
    const par = { s, a: todas[i].texto, b: todas[j].texto, ga: todas[i].grupo, gb: todas[j].grupo };
    (todas[i].grupo === todas[j].grupo ? mesmos : outros).push(par);
  }
}

mesmos.sort((x, y) => x.s - y.s);
outros.sort((x, y) => y.s - x.s);

console.log('\nMESMA INTENCAO — os 8 pares MAIS DIFICEIS (menor similaridade)');
for (const p of mesmos.slice(0, 8)) {
  console.log(`  ${p.s.toFixed(3)}  [${p.ga}]  "${p.a}"  ×  "${p.b}"`);
}

console.log('\nINTENCOES DIFERENTES — os 8 pares MAIS PERIGOSOS (maior similaridade)');
for (const p of outros.slice(0, 8)) {
  console.log(`  ${p.s.toFixed(3)}  [${p.ga} × ${p.gb}]  "${p.a}"  ×  "${p.b}"`);
}

const minMesmo = mesmos[0].s;
const maxOutro = outros[0].s;
console.log('\nSEPARACAO');
console.log(`  menor entre mesma intencao:   ${minMesmo.toFixed(3)}`);
console.log(`  maior entre intencoes difs:   ${maxOutro.toFixed(3)}`);
console.log(`  margem:                       ${(minMesmo - maxOutro).toFixed(3)}`);

// Varre limiares e mostra o custo de cada escolha. Agrupar demais funde
// assuntos e gera sugestão confusa; agrupar de menos nunca atinge o mínimo de
// ocorrencias e o aprendizado não sai do lugar — que e o estado de hoje.
console.log('\nLIMIAR      juntou certo    juntou errado');
for (const t of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) {
  const certos = mesmos.filter((p) => p.s >= t).length;
  const errados = outros.filter((p) => p.s >= t).length;
  console.log(
    `  ${t.toFixed(2)}       ${String(certos).padStart(3)}/${mesmos.length}         ${String(errados).padStart(3)}/${outros.length}`,
  );
}
