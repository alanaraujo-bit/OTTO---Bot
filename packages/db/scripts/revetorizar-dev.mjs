/**
 * Regera os embeddings dos trechos com o modelo real.
 *
 * Existe porque os vetores do banco de desenvolvimento foram gravados pelo
 * provedor determinístico (`ProvedorSimulado`), que produz vetores da dimensão
 * certa e conteúdo aleatório — bom para exercitar índice e gravação, inútil
 * para medir similaridade. O sintoma é inconfundível: cosseno entre trechos da
 * própria base perto de zero, e às vezes negativo.
 *
 * Só roda contra o banco apontado pelo `.env`. Não é para produção.
 */
import pg from 'pg';

const MODELO = 'text-embedding-3-small';
const c = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();

const { rows } = await c.query('select id, content from knowledge_chunks order by id');
console.log(`trechos: ${rows.length}`);

const r = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({ model: MODELO, input: rows.map((x) => x.content) }),
});
if (!r.ok) throw new Error(`embeddings ${r.status}: ${await r.text()}`);
const { data } = await r.json();

for (let i = 0; i < rows.length; i++) {
  await c.query('update knowledge_chunks set embedding = $1::vector where id = $2', [
    `[${data[i].embedding.join(',')}]`,
    rows[i].id,
  ]);
}
console.log('regravados com o modelo real');

const { rows: prova } = await c.query(`
  select round((1 - (ca.embedding <=> cb.embedding))::numeric, 3) as cos
    from knowledge_chunks ca, knowledge_chunks cb
   where ca.id <> cb.id limit 5`);
console.log('cossenos entre trechos agora:', prova.map((p) => p.cos).join(', '));
await c.end();
