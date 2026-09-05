/**
 * Exercita `recuperar()` de ponta a ponta contra um banco real.
 *
 * Os testes de `fundamento.test.ts` são puros — congelam a decisão, não o SQL.
 * Este script cobre o que eles não cobrem: a CTE de cortesia, a coluna de
 * similaridade e a fusão, rodando contra Postgres com embedding de verdade.
 *
 *   node --env-file=.env --import tsx packages/db/scripts/verificar-recuperacao.ts
 */
import { recuperar, trechoQueSustenta } from '@otto/core/knowledge';
import { rotaPara } from '@otto/core/ai';
import { getPlatformDb } from '@otto/db/client';
import { tenants } from '@otto/db/schema';

const PERGUNTAS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'Que horas vocês abrem no domingo?',
      'Qual o horário de domingo?',
      'Oi, bom dia, vocês funcionam domingo?',
      'Domingo abre que horas?',
      'Vocês ficam abertos domingo?',
      'Quanto está o arroz?',
      'Tem promoção de arroz hoje?',
    ];

const db = getPlatformDb();
const [empresa] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).limit(1);
if (!empresa) throw new Error('nenhuma empresa no banco');
console.log(`empresa: ${empresa.slug}\n`);

const rota = rotaPara('embutir');

for (const pergunta of PERGUNTAS) {
  let embedding: number[] | null = null;
  try {
    const r = await rota.provedor.embutir({ modelo: rota.modelo, textos: [pergunta] });
    embedding = r.vetores[0] ?? null;
  } catch (erro) {
    console.log(`  (embedding indisponível: ${String(erro)})`);
  }

  const trechos = await recuperar(empresa.id, pergunta, { embedding, limite: 5 });
  const sustenta = trechoQueSustenta(trechos);

  console.log(`### ${pergunta}`);
  for (const t of trechos.slice(0, 3)) {
    const sim = t.similaridade == null ? ' null' : t.similaridade.toFixed(3);
    console.log(
      `   cob ${t.cobertura.toFixed(3)}  sim ${sim}  ${t.origem.padEnd(6)} ${t.titulo}`,
    );
  }
  console.log(
    sustenta
      ? `   => RESPONDE (${sustenta.motivo}) via "${sustenta.trecho.titulo}"\n`
      : '   => ENCAMINHA (sem fundamento)\n',
  );
}

process.exit(0);
