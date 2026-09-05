import { NextResponse } from 'next/server';

import { pingRedis } from '@otto/core/queue';
import { getDb, sql } from '@otto/db';

/**
 * Verificação de saúde.
 *
 * O Railway usa isto para decidir se a versão nova pode receber tráfego. Por
 * isso ela **testa o banco**: um processo que subiu mas não alcança o Postgres
 * não está saudável, e promovê-lo derrubaria o produto de forma silenciosa.
 *
 * O Redis é reportado mas **não** derruba a verificação, e a assimetria é
 * deliberada: sem banco não há console; sem Redis o console continua servindo e
 * só a fila para. O que não pode acontecer é a falha ser invisível — o webhook
 * da Meta enfileira, e uma `REDIS_URL` quebrada faria o produto recusar
 * mensagem de cliente sem nada aparecer aqui. É um risco concreto neste
 * projeto: o Sync do Railway sobrescreve as variáveis do ambiente de destino, e
 * os nomes dos serviços de banco mudam entre ambientes.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const inicio = Date.now();

  const [banco, redis] = await Promise.all([conferirBanco(), pingRedis()]);

  if (!banco.ok) {
    return NextResponse.json(
      { ok: false, banco: banco.detalhe, redis, latenciaMs: Date.now() - inicio },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    banco: 'ok',
    redis,
    latenciaMs: Date.now() - inicio,
  });
}

async function conferirBanco(): Promise<{ ok: boolean; detalhe: string }> {
  try {
    await getDb().execute(sql`select 1`);
    return { ok: true, detalhe: 'ok' };
  } catch (erro) {
    return { ok: false, detalhe: erro instanceof Error ? erro.message : 'indisponível' };
  }
}
