import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { enfileirarEntrada } from '@otto/core/queue';
import { getPlatformDb, webhookEvents } from '@otto/db';
import { descreverErro, logger } from '@otto/shared';

/**
 * Webhook oficial da Meta — WhatsApp Cloud API.
 *
 * A Meta configura **uma** URL de callback por app, sem identificador de canal
 * no caminho. Por isso a rota é estática: quem revela o canal é o
 * `phone_number_id` dentro do payload, resolvido no worker.
 *
 * Duas responsabilidades, com regras opostas:
 *
 * - **GET** é o aperto de mão de verificação. A Meta manda um desafio e espera
 *   o mesmo texto de volta, cru, sem aspas de JSON. Não toca no banco: é a
 *   única requisição que a Meta usa para decidir se a URL presta, e qualquer
 *   dependência lenta aqui vira uma falha de verificação difícil de diagnosticar.
 *
 * - **POST** é a entrega de evento, e o requisito é **velocidade**. Confere a
 *   assinatura, grava o payload cru, enfileira e responde. Nada de resolver
 *   canal, nada de chamar a IA: a Meta reenvia o que demora e desativa o
 *   webhook de quem falha de forma repetida. Medido neste projeto: 14,2 s com a
 *   IA no caminho síncrono contra 0,15 s gravando e enfileirando.
 *
 * O corolário é que responder `200` significa "recebi e guardei", não
 * "processei" — que é exatamente o contrato que a Meta espera.
 */

export const dynamic = 'force-dynamic';

const PROVEDOR = 'meta_whatsapp';

// ── Verificação (GET) ────────────────────────────────────────────────────────

/**
 * Aperto de mão da Meta.
 *
 * `GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`
 *
 * O desafio volta como texto puro. `NextResponse.json('123')` devolveria
 * `"123"` — com aspas — e a Meta recusaria uma rota que parece correta.
 *
 * O desafio **não** é segredo: é um nonce público que a Meta gera para essa
 * requisição. Registrá-lo no log é o que torna a verificação auditável depois
 * do clique em "Verificar e salvar".
 */
export function GET(requisicao: Request) {
  const parametros = new URL(requisicao.url).searchParams;
  const modo = parametros.get('hub.mode');
  const token = parametros.get('hub.verify_token');
  const desafio = parametros.get('hub.challenge');

  const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!esperado) {
    logger.error('META_WEBHOOK_VERIFY_TOKEN não está configurada; verificação recusada');
    return new NextResponse('verificação indisponível', { status: 503 });
  }

  if (modo !== 'subscribe' || !token || !desafio || !comparaSegura(token, esperado)) {
    logger.warn({ modo, temToken: Boolean(token) }, 'verificação da Meta recusada');
    return new NextResponse('token de verificação inválido', { status: 403 });
  }

  logger.info({ desafio }, 'verificação da Meta aceita — devolvendo hub.challenge');
  return new NextResponse(desafio, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

// ── Eventos (POST) ───────────────────────────────────────────────────────────

export async function POST(requisicao: Request) {
  const inicio = Date.now();

  // O corpo cru precisa ser lido **uma vez** e usado tanto para conferir a
  // assinatura quanto para gravar. Reserializar o objeto muda espaços e ordem
  // de chaves, e a assinatura deixa de bater.
  const corpoCru = await requisicao.text();

  const segredo = process.env.META_APP_SECRET;
  if (!segredo) {
    // Falhar explicitamente: aceitar evento sem poder provar que veio da Meta
    // seria abrir a ingestão para qualquer um que descubra a URL.
    logger.error('META_APP_SECRET não está configurada; evento da Meta recusado');
    return NextResponse.json({ erro: 'canal não configurado' }, { status: 401 });
  }

  const assinatura = requisicao.headers.get('x-hub-signature-256');
  if (!assinatura || !assinaturaConfere(corpoCru, assinatura, segredo)) {
    logger.warn({ temAssinatura: Boolean(assinatura) }, 'assinatura da Meta inválida');
    return NextResponse.json({ erro: 'assinatura inválida' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpoCru);
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 });
  }

  // A idempotência da entrega mora no banco: o hash do corpo cru é único por
  // entrega, e o índice `(provider, external_id)` faz o reenvio ser um no-op
  // barato. Conferir antes de inserir perderia a corrida entre duas entregas
  // simultâneas — a mesma escolha já feita em `receberMensagem`.
  const idEntrega = createHash('sha256').update(corpoCru).digest('hex');

  try {
    const gravado = await registrarEntrega(idEntrega, payload);

    if (!gravado) {
      logger.debug({ idEntrega }, 'entrega repetida da Meta, ignorada');
      return NextResponse.json({ ok: true, situacao: 'repetida' });
    }

    await enfileirarEntrada({ webhookEventId: gravado });

    logger.info(
      { idEntrega, eventoId: gravado, ms: Date.now() - inicio },
      'evento da Meta recebido e enfileirado',
    );
    return NextResponse.json({ ok: true, situacao: 'recebida' });
  } catch (erro) {
    logger.error({ erro: descreverErro(erro), idEntrega }, 'falha ao receber evento da Meta');

    // `503` de propósito, e só aqui: o evento **não** ficou guardado, então
    // queremos que a Meta reenvie. Este é o único caso em que o reenvio é o
    // comportamento desejado — banco ou Redis fora do ar é transitório.
    return NextResponse.json({ erro: 'indisponível' }, { status: 503 });
  }
}

/**
 * Devolve o id do evento gravado, ou `null` quando a entrega já existia.
 *
 * O `null` do conflito não reenfileira nada de propósito: o job da primeira
 * entrega já existe ou já rodou, e o `jobId` do BullMQ fecharia o caminho de
 * qualquer forma.
 */
async function registrarEntrega(idEntrega: string, payload: unknown): Promise<string | null> {
  const [inserida] = await getPlatformDb()
    .insert(webhookEvents)
    .values({ provider: PROVEDOR, externalId: idEntrega, payload })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  return inserida?.id ?? null;
}

// ── Comparações ──────────────────────────────────────────────────────────────

/**
 * Comparação em tempo constante.
 *
 * Os valores passam por SHA-256 antes porque `timingSafeEqual` lança exceção
 * quando os buffers têm tamanhos diferentes — e o próprio tamanho vazaria.
 */
function comparaSegura(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function assinaturaConfere(corpoCru: string, cabecalho: string, segredo: string): boolean {
  const esperada = `sha256=${createHmac('sha256', segredo).update(corpoCru).digest('hex')}`;
  return comparaSegura(cabecalho, esperada);
}
