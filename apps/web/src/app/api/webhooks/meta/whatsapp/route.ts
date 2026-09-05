import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { atenderAutomaticamente, receberMensagem } from '@otto/core/conversations';
import { and, channels, eq, getPlatformDb, webhookEvents } from '@otto/db';
import { childLogger, descreverErro, logger } from '@otto/shared';

/**
 * Webhook oficial da Meta — WhatsApp Cloud API.
 *
 * A Meta configura **uma** URL de callback por app, sem identificador de canal
 * no caminho. Por isso a rota é estática, e não `/meta/:channel` como o desenho
 * original supunha: quem revela o canal é o `phone_number_id` dentro do
 * payload. O `docs/ARCHITECTURE.md` foi corrigido junto.
 *
 * Duas responsabilidades, com regras opostas:
 *
 * - **GET** é o aperto de mão de verificação. A Meta manda um desafio e espera
 *   o mesmo texto de volta, cru, sem aspas de JSON. Não toca no banco, não
 *   enfileira nada: é a única requisição que a Meta usa para decidir se a URL
 *   presta, e qualquer dependência lenta aqui vira uma falha de verificação
 *   difícil de diagnosticar.
 *
 * - **POST** é a entrega de evento. A Meta reenvia, duplica e entrega fora de
 *   ordem, e **desativa o webhook** de quem responde erro repetidamente. Então
 *   tudo que faz sentido sintático responde `200`, mesmo quando o evento não
 *   nos interessa — o motivo do descarte fica gravado em `webhook_events`, não
 *   no código de status.
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
 * requisição. Registrá-lo no log é justamente o que torna a verificação
 * auditável depois do clique em "Verificar e salvar".
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
  // O corpo cru precisa ser lido **uma vez** e usado tanto para conferir a
  // assinatura quanto para interpretar o evento. Reserializar o objeto muda
  // espaços e ordem de chaves, e a assinatura deixa de bater.
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

  let payload: PayloadMeta;
  try {
    payload = JSON.parse(corpoCru) as PayloadMeta;
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 });
  }

  // A idempotência da entrega mora no banco: o hash do corpo cru é único por
  // entrega, e o índice `(provider, external_id)` faz o reenvio ser um no-op
  // barato. Conferir antes de inserir perderia a corrida entre duas entregas
  // simultâneas — a mesma escolha já feita em `receberMensagem`.
  const idEntrega = createHash('sha256').update(corpoCru).digest('hex');
  const primeiraEntrega = await registrarEntrega(idEntrega, payload);

  if (!primeiraEntrega) {
    logger.debug({ idEntrega }, 'entrega repetida da Meta, ignorada');
    return NextResponse.json({ ok: true, situacao: 'repetida' });
  }

  try {
    const resumo = await processar(payload);
    await concluirEntrega(idEntrega, resumo.descarte);
    return NextResponse.json({ ok: true, ...resumo.corpo });
  } catch (erro) {
    logger.error({ erro: descreverErro(erro), idEntrega }, 'processamento do evento da Meta falhou');
    await falharEntrega(idEntrega, erro);
    // Ainda assim `200`: o evento está gravado e é reprocessável pelo
    // Backoffice. Devolver erro faria a Meta reenviar e, na insistência,
    // desativar o webhook inteiro — derrubando os canais que funcionam.
    return NextResponse.json({ ok: true, situacao: 'retido' });
  }
}

// ── Processamento ────────────────────────────────────────────────────────────

interface MensagemMeta {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface PayloadMeta {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: MensagemMeta[];
        statuses?: unknown[];
      };
    }[];
  }[];
}

interface Resumo {
  corpo: Record<string, unknown>;
  /** Preenchido quando o evento é válido mas não gera atendimento. */
  descarte: string | null;
}

async function processar(payload: PayloadMeta): Promise<Resumo> {
  if (payload.object !== 'whatsapp_business_account') {
    return { corpo: { situacao: 'ignorada' }, descarte: 'objeto não é whatsapp_business_account' };
  }

  const mudancas = (payload.entry ?? []).flatMap((entrada) => entrada.changes ?? []);
  const atendidas: string[] = [];
  let descarte: string | null = null;

  for (const mudanca of mudancas) {
    const valor = mudanca.value;
    if (!valor) continue;

    // Confirmações de entrega e leitura chegam pela mesma porta. Ainda não
    // atualizamos o estado da mensagem por elas — o adaptador de envio é B2/B3.
    if (!valor.messages?.length) {
      descarte ??= valor.statuses?.length ? 'evento de status, sem mensagem' : 'evento sem mensagem';
      continue;
    }

    const phoneNumberId = valor.metadata?.phone_number_id;
    const canal = phoneNumberId ? await encontrarCanal(phoneNumberId) : null;
    if (!canal) {
      // Um número que não é nosso não é erro do remetente: é um canal que
      // ainda não foi cadastrado, e o Backoffice precisa enxergar isso.
      descarte ??= `canal desconhecido (phone_number_id ${phoneNumberId ?? 'ausente'})`;
      continue;
    }

    const log = childLogger({ tenantId: canal.tenantId, channelId: canal.id });

    for (const mensagem of valor.messages) {
      const texto = mensagem.type === 'text' ? mensagem.text?.body?.trim() : null;
      if (!texto) {
        // Áudio, imagem e documento entram na conversa quando houver
        // transcrição e leitura de mídia; por ora o registro fica gravado.
        descarte ??= `tipo não suportado: ${mensagem.type ?? 'desconhecido'}`;
        continue;
      }

      const perfil = valor.contacts?.find((c) => c.wa_id === mensagem.from);

      const recebida = await receberMensagem({
        tenantId: canal.tenantId,
        channelId: canal.id,
        remetenteExterno: mensagem.from,
        nomePerfil: perfil?.profile?.name ?? null,
        telefone: /^\d{10,15}$/.test(mensagem.from) ? mensagem.from : null,
        mensagemExterna: mensagem.id,
        texto,
        enviadaEm: mensagem.timestamp ? new Date(Number(mensagem.timestamp) * 1000) : undefined,
      });

      if (!recebida.nova) {
        log.debug({ externalId: mensagem.id }, 'mensagem repetida da Meta');
        continue;
      }

      await atenderAutomaticamente(
        canal.tenantId,
        recebida.conversationId,
        recebida.messageId,
        texto,
      );
      atendidas.push(recebida.conversationId);
    }
  }

  if (atendidas.length === 0) {
    return { corpo: { situacao: 'ignorada' }, descarte: descarte ?? 'nada a processar' };
  }
  return { corpo: { situacao: 'processada', conversas: atendidas.length }, descarte: null };
}

/**
 * Resolve o canal pelo `phone_number_id`.
 *
 * Acontece **antes** de haver contexto de empresa — é o número que revela de
 * quem é a mensagem —, então usa o caminho de plataforma, nunca o do console.
 */
async function encontrarCanal(
  phoneNumberId: string,
): Promise<{ id: string; tenantId: string } | null> {
  const [canal] = await getPlatformDb()
    .select({ id: channels.id, tenantId: channels.tenantId })
    .from(channels)
    .where(and(eq(channels.externalId, phoneNumberId), eq(channels.kind, 'whatsapp')))
    .limit(1);

  return canal ?? null;
}

// ── Registro bruto ───────────────────────────────────────────────────────────

/** `false` quando a entrega já estava gravada. */
async function registrarEntrega(idEntrega: string, payload: PayloadMeta): Promise<boolean> {
  const inseridas = await getPlatformDb()
    .insert(webhookEvents)
    .values({ provider: PROVEDOR, externalId: idEntrega, payload })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
    .returning({ id: webhookEvents.id });

  return inseridas.length > 0;
}

async function concluirEntrega(idEntrega: string, descarte: string | null): Promise<void> {
  await getPlatformDb()
    .update(webhookEvents)
    .set({
      status: descarte ? 'descartado' : 'processado',
      discardReason: descarte?.slice(0, 120) ?? null,
      processedAt: new Date(),
    })
    .where(and(eq(webhookEvents.provider, PROVEDOR), eq(webhookEvents.externalId, idEntrega)));
}

async function falharEntrega(idEntrega: string, erro: unknown): Promise<void> {
  try {
    await getPlatformDb()
      .update(webhookEvents)
      .set({
        status: 'falhou',
        lastError: erro instanceof Error ? erro.message : 'erro desconhecido',
      })
      .where(and(eq(webhookEvents.provider, PROVEDOR), eq(webhookEvents.externalId, idEntrega)));
  } catch (falha) {
    logger.error({ erro: descreverErro(falha) }, 'não foi possível marcar a entrega como falha');
  }
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
