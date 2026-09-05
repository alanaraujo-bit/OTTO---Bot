/**
 * Prova que marcar uma conversa como ensaio a tira das métricas comerciais.
 *
 * Mede antes, marca, mede de novo, desmarca e confere que voltou. Roda contra o
 * banco apontado pelo `.env` — nunca produção.
 *
 *   node --env-file=.env --import tsx packages/db/scripts/verificar-ensaio.ts
 */
import { marcarConversaComoEnsaio } from '@otto/core/conversations';
import { resumo } from '@otto/core/metricas';
import { conversations, getPlatformDb, tenants, users } from '@otto/db';
import { desc, eq } from 'drizzle-orm';

const db = getPlatformDb();
const [empresa] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).limit(1);
if (!empresa) throw new Error('nenhuma empresa');
const [autor] = await db.select({ id: users.id, nome: users.name }).from(users).limit(1);
if (!autor) throw new Error('nenhum usuário');

const [alvo] = await db
  .select({ id: conversations.id })
  .from(conversations)
  .where(eq(conversations.tenantId, empresa.id))
  .orderBy(desc(conversations.createdAt))
  .limit(1);
if (!alvo) throw new Error('nenhuma conversa');

const medir = async (rotulo: string) => {
  const r = await resumo(empresa.id, '30dias', 'America/Belem');
  console.log(
    `${rotulo.padEnd(12)} conversas=${r.conversas} clientes=${r.clientesUnicos} ` +
      `recebidas=${r.mensagensRecebidas} enviadas=${r.mensagensEnviadas} ` +
      `handoffs=${r.handoffs} semFundamento=${r.semFundamento}`,
  );
  return r;
};

console.log(`empresa=${empresa.slug} conversa=${alvo.id.slice(0, 8)}\n`);
const antes = await medir('antes');
await marcarConversaComoEnsaio(empresa.id, alvo.id, true, {
  id: autor.id,
  nome: autor.nome ?? 'teste',
});
const durante = await medir('marcada');
await marcarConversaComoEnsaio(empresa.id, alvo.id, false, {
  id: autor.id,
  nome: autor.nome ?? 'teste',
});
const depois = await medir('desmarcada');

const caiu = durante.conversas === antes.conversas - 1;
const voltou = depois.conversas === antes.conversas;
console.log(
  `\nconversa saiu da metrica ao marcar: ${caiu ? 'SIM' : 'NAO'}` +
    `\nvoltou ao desmarcar:                ${voltou ? 'SIM' : 'NAO'}` +
    `\nmensagens excluidas junto:          ${antes.mensagensRecebidas - durante.mensagensRecebidas} recebidas, ` +
    `${antes.mensagensEnviadas - durante.mensagensEnviadas} enviadas`,
);

process.exit(caiu && voltou ? 0 : 1);
