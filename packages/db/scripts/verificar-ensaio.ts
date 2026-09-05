/**
 * Prova que marcar uma conversa como ensaio a tira de **todas** as métricas
 * comerciais, e que desmarcar devolve.
 *
 * Mede antes, marca, mede, desmarca, mede. Escolhe de propósito uma conversa
 * que tenha execução de IA registrada — sem isso, custo, handoff e assuntos
 * frequentes não teriam como mudar, e o teste passaria sem provar nada.
 *
 * Roda contra o banco apontado pelo `.env` — nunca produção.
 *
 *   node --env-file=.env --import tsx packages/db/scripts/verificar-ensaio.ts
 */
import { marcarConversaComoEnsaio } from '@otto/core/conversations';
import { assuntosFrequentes, resumo } from '@otto/core/metricas';
import { aiRuns, conversations, getPlatformDb, tenants, users } from '@otto/db';
import { and, desc, eq, sql } from 'drizzle-orm';

const db = getPlatformDb();
const [empresa] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).limit(1);
if (!empresa) throw new Error('nenhuma empresa');
const [autor] = await db.select({ id: users.id, nome: users.name }).from(users).limit(1);
if (!autor) throw new Error('nenhum usuário');

// Uma conversa com IA registrada, handoff e primeira resposta — só assim dá
// para observar cada métrica se mexendo.
const [alvo] = await db
  .select({
    id: conversations.id,
    handoffs: conversations.handoffCount,
    execucoes: sql<number>`(select count(*)::int from ${aiRuns} r where r.conversation_id = ${conversations.id})`,
  })
  .from(conversations)
  .where(
    and(
      eq(conversations.tenantId, empresa.id),
      sql`${conversations.handoffCount} > 0`,
      sql`${conversations.firstResponseAt} > ${conversations.firstInboundAt}`,
      sql`exists (select 1 from ${aiRuns} r where r.conversation_id = ${conversations.id} and r.cost_micro_usd > 0)`,
    ),
  )
  .orderBy(desc(conversations.createdAt))
  .limit(1);
if (!alvo) throw new Error('nenhuma conversa');

const medir = async () => {
  const [r, assuntos] = await Promise.all([
    resumo(empresa.id, '30dias', 'America/Belem'),
    assuntosFrequentes(empresa.id, '30dias', 'America/Belem'),
  ]);
  return {
    conversas: r.conversas,
    clientes: r.clientesUnicos,
    recebidas: r.mensagensRecebidas,
    enviadas: r.mensagensEnviadas,
    handoffs: r.handoffs,
    semFundamento: r.semFundamento,
    custo: r.custoMicroUsd,
    primeiraResposta: r.tempoPrimeiraResposta,
    assuntos: assuntos.reduce((s, a) => s + a.ocorrencias, 0),
  };
};

const linha = (rot: string, m: Awaited<ReturnType<typeof medir>>) =>
  `${rot.padEnd(11)} conversas=${String(m.conversas).padStart(4)} clientes=${String(m.clientes).padStart(3)} ` +
  `recebidas=${String(m.recebidas).padStart(4)} enviadas=${String(m.enviadas).padStart(4)} ` +
  `handoffs=${String(m.handoffs).padStart(3)} semFund=${String(m.semFundamento).padStart(3)} ` +
  `custo=${String(m.custo).padStart(7)} 1aResp=${String(m.primeiraResposta ?? '-').padStart(6)} ` +
  `assuntos=${String(m.assuntos).padStart(4)}`;

console.log(
  `empresa=${empresa.slug} conversa=${alvo.id.slice(0, 8)} ` +
    `(execucoes_ia=${alvo.execucoes} handoffs=${alvo.handoffs})\n`,
);

const antes = await medir();
console.log(linha('antes', antes));

await marcarConversaComoEnsaio(empresa.id, alvo.id, true, { id: autor.id, nome: autor.nome ?? 'teste' });
const marcada = await medir();
console.log(linha('marcada', marcada));

await marcarConversaComoEnsaio(empresa.id, alvo.id, false, { id: autor.id, nome: autor.nome ?? 'teste' });
const depois = await medir();
console.log(linha('desmarcada', depois));

const chaves = Object.keys(antes) as (keyof typeof antes)[];
console.log('\nDELTA AO MARCAR (esperado: negativo onde a conversa contribuía)');
for (const k of chaves) {
  const a = Number(antes[k] ?? 0);
  const m = Number(marcada[k] ?? 0);
  if (a !== m) console.log(`  ${String(k).padEnd(17)} ${a} -> ${m}  (${m - a})`);
}

const reverteu = chaves.every((k) => String(antes[k]) === String(depois[k]));
const mexeu = chaves.some((k) => String(antes[k]) !== String(marcada[k]));
console.log(`\nalguma metrica mudou ao marcar: ${mexeu ? 'SIM' : 'NAO'}`);
console.log(`tudo voltou ao desmarcar:      ${reverteu ? 'SIM' : 'NAO'}`);

process.exit(mexeu && reverteu ? 0 : 1);
