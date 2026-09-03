import { Worker, type Job } from 'bullmq';

import { closeDb, eq, getPlatformDb, isNull, knowledgeChunks, sql, tenants, withTenant } from '@otto/db';
import { logger, parseWorkerEnv } from '@otto/shared';
import { enviarMensagem } from '@otto/core/channels';
import { agregarSinais } from '@otto/core/aprendizado';
import { rotaPara } from '@otto/core/ai';
import {
  FILAS,
  fecharFilas,
  obterConexao,
  type JobAprendizado,
  type JobEmbeddings,
  type JobEnvio,
} from '@otto/core/queue';

/**
 * Worker.
 *
 * Processa o que não pode fazer o cliente esperar: entregar a mensagem ao
 * provedor, gerar embeddings e agregar aprendizado.
 *
 * O que **não** está aqui, de propósito: a geração da resposta do agente. Quem
 * está do outro lado do WhatsApp está esperando, e passar por uma fila só
 * acrescentaria latência a um caminho que precisa ser rápido.
 */

const env = parseWorkerEnv();
const log = logger.child({ processo: 'worker' });

const workers: Worker[] = [];

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
