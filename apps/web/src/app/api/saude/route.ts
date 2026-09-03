import { NextResponse } from 'next/server';

import { getDb, sql } from '@otto/db';

/**
 * Verificação de saúde.
 *
 * O Railway usa isto para decidir se a versão nova pode receber tráfego. Por
 * isso ela **testa o banco**: um processo que subiu mas não alcança o Postgres
 * não está saudável, e promovê-lo derrubaria o produto de forma silenciosa.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const inicio = Date.now();

  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      banco: 'ok',
      latenciaMs: Date.now() - inicio,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        ok: false,
        banco: 'indisponível',
        detalhe: erro instanceof Error ? erro.message : 'erro desconhecido',
      },
      { status: 503 },
    );
  }
}
