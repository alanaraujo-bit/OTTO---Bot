/**
 * Reenfileira mensagens presas em "pendente".
 *
 * Ferramenta de operação, não parte do produto. Existe porque uma mensagem que
 * não chegou ao cliente precisa ter um caminho de recuperação — e porque o
 * backoffice mostra o número de envios travados justamente para alguém agir.
 *
 *   node --env-file=.env packages/db/src/reenfileirar.mts
 */
import { getPlatformDb, messages, sql, closeDb } from './index.ts';
import { enfileirarEnvio } from '@otto/core/queue';

const presas = await getPlatformDb()
  .select({ id: messages.id, tenantId: messages.tenantId })
  .from(messages)
  .where(sql`${messages.status} = 'pendente' and ${messages.direction} = 'saida'`)
  .limit(500);

console.log(`${presas.length} mensagens pendentes de envio`);

for (const m of presas) {
  await enfileirarEnvio({ tenantId: m.tenantId, messageId: m.id });
}

console.log('reenfileiradas.');
await closeDb();
process.exit(0);
