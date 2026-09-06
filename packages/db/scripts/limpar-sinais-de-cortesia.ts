/**
 * Neutraliza os sinais de cortesia que ficaram gravados antes da guarda.
 *
 * `registrarSinal` agora descarta cumprimento na entrada, mas o que já está no
 * banco continua lá — e continua agrupando. Em produção, "Boa noite" e "Boa
 * tarde" juntaram a 0,792; faltava um terceiro cumprimento para o produto
 * sugerir criar conhecimento sobre saudação.
 *
 * **Não apaga.** Marca `aggregated_at`, que é a coluna que já significa
 * "consumido, não reconsiderar" — `agregarSinais` só lê sinais com ela nula.
 * O registro do fato observado continua auditável, e desfazer é um UPDATE.
 *
 * Classifica pelo **texto original** (`data->>'textoOriginal'`), não por
 * `query_text`: a normalização de `sinais.ts` descarta palavras de até duas
 * letras e ordena o resto — "oi" viraria vazio e um cumprimento de duas
 * palavras pode sair fora de ordem, e aí `apenasCortesia` não reconheceria o
 * que reconhece no cru. Sinal sem texto original é listado à parte, nunca
 * marcado no palpite.
 *
 * Lista por padrão; só mexe com `--aplicar`.
 *
 *   node --env-file=.env --import tsx packages/db/scripts/limpar-sinais-de-cortesia.ts [slug] [--aplicar]
 */
import { ehCortesia } from '@otto/core/aprendizado';
import { getPlatformDb, knowledgeSignals, tenants, withTenant } from '@otto/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

const aplicar = process.argv.includes('--aplicar');
const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));

const db = getPlatformDb();
const [empresa] = await db
  .select({ id: tenants.id, slug: tenants.slug })
  .from(tenants)
  .where(slug ? eq(tenants.slug, slug) : sql`true`)
  .limit(1);
if (!empresa) throw new Error(slug ? `empresa ${slug} não encontrada` : 'nenhuma empresa');

const pendentes = await withTenant(empresa.id, (tx) =>
  tx
    .select({
      id: knowledgeSignals.id,
      tipo: knowledgeSignals.type,
      chave: knowledgeSignals.queryText,
      original: sql<string | null>`${knowledgeSignals.data} ->> 'textoOriginal'`,
      em: knowledgeSignals.createdAt,
    })
    .from(knowledgeSignals)
    .where(and(eq(knowledgeSignals.tenantId, empresa.id), isNull(knowledgeSignals.aggregatedAt)))
    .orderBy(knowledgeSignals.createdAt),
);

const cortesias = pendentes.filter((s) => ehCortesia(s.original?.trim() ?? ''));
const semOriginal = pendentes.filter((s) => !s.original?.trim());

console.log(`empresa ${empresa.slug}: ${pendentes.length} sinais pendentes\n`);

console.log(`cortesia (${cortesias.length}):`);
for (const s of cortesias) {
  console.log(`  ${s.em.toISOString().slice(0, 16)}  ${s.tipo.padEnd(20)} ${JSON.stringify(s.original)}`);
}

if (semOriginal.length) {
  // Sem o texto cru não dá para classificar com honestidade — quem decide é uma
  // pessoa olhando a chave normalizada.
  console.log(`\nsem texto original, não classificados (${semOriginal.length}):`);
  for (const s of semOriginal) {
    console.log(`  ${s.em.toISOString().slice(0, 16)}  ${s.tipo.padEnd(20)} chave=${JSON.stringify(s.chave)}`);
  }
}

if (!aplicar) {
  console.log(`\n(nada foi alterado — rode com --aplicar para marcar os ${cortesias.length} de cortesia)`);
  process.exit(0);
}

if (!cortesias.length) {
  console.log('\nnada a marcar');
  process.exit(0);
}

const marcados = await withTenant(empresa.id, (tx) =>
  tx
    .update(knowledgeSignals)
    .set({ aggregatedAt: new Date() })
    .where(
      and(
        eq(knowledgeSignals.tenantId, empresa.id),
        inArray(
          knowledgeSignals.id,
          cortesias.map((s) => s.id),
        ),
        isNull(knowledgeSignals.aggregatedAt),
      ),
    )
    .returning({ id: knowledgeSignals.id }),
);

console.log(`\n${marcados.length} sinais marcados como consumidos`);
process.exit(0);
