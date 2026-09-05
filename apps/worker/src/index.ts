import { Worker, type Job } from 'bullmq';

import {
  closeDb,
  eq,
  getPlatformDb,
  isNull,
  knowledgeChunks,
  sql,
  tenants,
  webhookEvents,
  withTenant,
} from '@otto/db';
import { descreverErro, logger, parseWorkerEnv } from '@otto/shared';
import { enviarMensagem } from '@otto/core/channels';
import { agregarSinais } from '@otto/core/aprendizado';
import { rotaPara } from '@otto/core/ai';
import { interpretarEventoMeta, lerEventoWebhook } from '@otto/core/conversations';
import {
  FILAS,
  fecharFilas,
  obterConexao,
  type JobAprendizado,
  type JobEmbeddings,
  type JobEntrada,
  type JobEnvio,
} from '@otto/core/queue';

/**
 * Worker.
 *
 * Processa o que não pode fazer o remetente do HTTP esperar: interpretar o
 * evento que chegou da Meta, entregar a mensagem ao provedor, gerar embeddings
 * e agregar aprendizado.
 *
 * Sobre a resposta do agente: ela continua **fora** da fila no Simulador, onde
 * quem espera do outro lado do HTTP é a pessoa usando o console. No caminho da
 * Meta ela está aqui, porque lá quem espera é a Meta — que reenvia o que demora
 * e desativa o webhook de quem falha de forma repetida — e o cliente recebe a
 * resposta por um envio próprio, que a fila não atrasa.
 */

const env = parseWorkerEnv();
const log = logger.child({ processo: 'worker' });

const workers: Worker[] = [];

// ── Entrada (eventos da Meta) ─────────────────────────────────────────────────

/**
 * Interpreta um evento já gravado por `/api/webhooks/meta/whatsapp`.
 *
 * O payload vem do banco, não do job: o job carrega só o id. Assim um evento
 * continua reprocessável pelo Backoffice mesmo depois de o job ter sumido do
 * Redis, e o Redis não guarda cópia de conversa de cliente.
 */
workers.push(
  new Worker<JobEntrada>(
    FILAS.entrada,
    async (job: Job<JobEntrada>) => {
      const { webhookEventId } = job.data;

      const evento = await lerEventoWebhook(webhookEventId);
      if (!evento) {
        log.warn({ webhookEventId }, 'evento de webhook não encontrado');
        return;
      }

      await marcarEvento(webhookEventId, { status: 'processando', attempts: job.attemptsMade + 1 });

      try {
        const resultado = await interpretarEventoMeta(evento.payload);

        log.info(
          {
            webhookEventId,
            conversas: resultado.conversas.length,
            estados: resultado.estados,
            descarte: resultado.descarte,
          },
          'entrada interpretada',
        );

        await marcarEvento(webhookEventId, {
          status: resultado.descarte ? 'descartado' : 'processado',
          discardReason: resultado.descarte?.slice(0, 120) ?? null,
          processedAt: new Date(),
          tenantId: resultado.tenantId,
          channelId: resultado.channelId,
          lastError: null,
        });

        if (resultado.conversas.length) {
          log.info(
            { webhookEventId, conversas: resultado.conversas.length },
            'evento da Meta processado',
          );
        }
      } catch (erro) {
        // Deixa `falhou` gravado e relança: o BullMQ decide se ainda há
        // tentativa. Esgotadas, o job fica retido e o evento aparece no
        // Backoffice com o motivo — nada some em silêncio.
        await marcarEvento(webhookEventId, {
          status: 'falhou',
          lastError: erro instanceof Error ? erro.message.slice(0, 500) : 'erro desconhecido',
        });
        throw erro;
      }
    },
    { connection: obterConexao(), concurrency: env.WORKER_CONCURRENCY },
  ),
);

async function marcarEvento(
  id: string,
  campos: Partial<typeof webhookEvents.$inferInsert>,
): Promise<void> {
  try {
    await getPlatformDb().update(webhookEvents).set(campos).where(eq(webhookEvents.id, id));
  } catch (erro) {
    log.error({ erro: descreverErro(erro), id }, 'não foi possível atualizar o evento');
  }
}

// ── Envio ─────────────────────────────────────────────────────────────────────

workers.push(
  new Worker<JobEnvio>(
    FILAS.envio,
    async (job: Job<JobEnvio>) => {
      const { tenantId, messageId } = job.data;
      const resultado = await enviarMensagem(tenantId, messageId);

      // Falha não recuperável não deve consumir as tentativas restantes: o
      // estado já foi gravado na mensagem e a Inbox mostra o motivo.
      if (!resultado.ok && resultado.recuperavel) {
        throw new Error(resultado.erro ?? 'falha no envio');
      }
    },
    { connection: obterConexao(), concurrency: env.WORKER_CONCURRENCY },
  ),
);

// ── Embeddings ────────────────────────────────────────────────────────────────

workers.push(
  new Worker<JobEmbeddings>(
    FILAS.embeddings,
    async (job: Job<JobEmbeddings>) => {
      const { tenantId } = job.data;
      const rota = rotaPara('embutir');

      // Lotes pequenos: um lote grande que falha desperdiça o trabalho inteiro,
      // e o custo de recomeçar é maior que o de uma chamada a mais.
      const LOTE = 20;

      const pendentes = await withTenant(tenantId, (tx) =>
        tx
          .select({ id: knowledgeChunks.id, conteudo: knowledgeChunks.content })
          .from(knowledgeChunks)
          .where(isNull(knowledgeChunks.embeddingModel))
          .limit(LOTE),
      );

      if (pendentes.length === 0) return;

      const resposta = await rota.provedor.embutir({
        modelo: rota.modelo,
        textos: pendentes.map((p) => p.conteudo),
      });

      await withTenant(tenantId, async (tx) => {
        for (const [i, trecho] of pendentes.entries()) {
          const vetor = resposta.vetores[i];
          if (!vetor) continue;

          await tx
            .update(knowledgeChunks)
            .set({
              embedding: vetor,
              embeddingModel: rota.modelo,
              embeddedAt: new Date(),
            })
            .where(eq(knowledgeChunks.id, trecho.id));
        }
      });

      log.info({ tenantId, trechos: pendentes.length }, 'embeddings gerados');

      // Ainda há pendentes: continua em outro job, para não segurar um worker.
      if (pendentes.length === LOTE) {
        const { enfileirarEmbeddings } = await import('@otto/core/queue');
        await enfileirarEmbeddings({ tenantId });
      }
    },
    { connection: obterConexao(), concurrency: 2 },
  ),
);

// ── Aprendizado ───────────────────────────────────────────────────────────────

workers.push(
  new Worker<JobAprendizado>(
    FILAS.aprendizado,
    async (job: Job<JobAprendizado>) => {
      const geradas = await agregarSinais(job.data.tenantId);
      if (geradas.length) {
        log.info({ tenantId: job.data.tenantId, sugestoes: geradas.length }, 'aprendizado agregado');
      }
    },
    { connection: obterConexao(), concurrency: 1 },
  ),
);

for (const worker of workers) {
  worker.on('failed', (job, erro) => {
    log.error(
      { fila: worker.name, jobId: job?.id, tentativa: job?.attemptsMade, erro: erro.message },
      'job falhou',
    );
  });
}

// ── Rotinas periódicas ────────────────────────────────────────────────────────

/**
 * Agrega o aprendizado de todas as empresas de hora em hora.
 *
 * Não é urgente — uma sugestão que aparece uma hora depois serve igual — e
 * espalhar as execuções evita um pico de trabalho a cada mensagem sem resposta.
 */
const UMA_HORA = 60 * 60 * 1000;

async function rodarPeriodicas(): Promise<void> {
  try {
    const empresas = await getPlatformDb()
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, 'ativo'));

    const { enfileirarAprendizado, enfileirarEmbeddings } = await import('@otto/core/queue');

    for (const empresa of empresas) {
      await enfileirarAprendizado({ tenantId: empresa.id });
      await enfileirarEmbeddings({ tenantId: empresa.id });
    }

    log.debug({ empresas: empresas.length }, 'rotinas periódicas enfileiradas');
  } catch (erro) {
    log.error({ erro }, 'falha ao enfileirar rotinas periódicas');
  }
}

const periodicas = setInterval(() => void rodarPeriodicas(), UMA_HORA);
// Primeira execução logo após o arranque, sem esperar a hora cheia.
setTimeout(() => void rodarPeriodicas(), 30_000);

log.info({ ambiente: env.APP_ENV, concorrencia: env.WORKER_CONCURRENCY }, 'worker no ar');

// ── Desligamento gracioso ─────────────────────────────────────────────────────

/**
 * O Railway manda SIGTERM e espera antes de matar. Fechar os workers deixa o job
 * em andamento terminar — sem isso, uma mensagem poderia ficar em `enviando`
 * para sempre.
 */
async function desligar(sinal: string): Promise<void> {
  log.info({ sinal }, 'desligando');
  clearInterval(periodicas);

  await Promise.all(workers.map((w) => w.close()));
  await fecharFilas();
  await closeDb();

  log.info('worker encerrado');
  process.exit(0);
}

process.on('SIGTERM', () => void desligar('SIGTERM'));
process.on('SIGINT', () => void desligar('SIGINT'));
