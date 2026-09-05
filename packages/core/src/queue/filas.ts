import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

import { logger } from '@otto/shared';

/**
 * Filas.
 *
 * Só entra na fila o que **não pode** fazer o cliente esperar: enviar a mensagem
 * ao provedor, gerar embeddings, agregar aprendizado. A resposta do agente é
 * gerada no caminho síncrono — quem está do outro lado do WhatsApp está
 * esperando, e passar por uma fila só acrescenta latência.
 */

export const FILAS = {
  /** Interpreta um evento cru já gravado em `webhook_events`. */
  entrada: 'entrada',
  /** Entrega a mensagem ao provedor do canal. */
  envio: 'envio',
  /** Gera vetores dos trechos publicados. */
  embeddings: 'embeddings',
  /** Agrega sinais em sugestões de melhoria. */
  aprendizado: 'aprendizado',
} as const;

export type NomeFila = (typeof FILAS)[keyof typeof FILAS];

export interface JobEntrada {
  /** Id da linha em `webhook_events`. O payload já está gravado. */
  webhookEventId: string;
}

export interface JobEnvio {
  tenantId: string;
  messageId: string;
}

export interface JobEmbeddings {
  tenantId: string;
  /** Ausente: processa toda a fila pendente da empresa. */
  itemId?: string;
}

export interface JobAprendizado {
  tenantId: string;
}

let conexao: IORedis | null = null;
const filas = new Map<string, Queue>();

function obterConexao(): ConnectionOptions {
  if (!conexao) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL não está definida.');

    conexao = new IORedis(url, {
      // Exigência do BullMQ: com retry limitado, um bloqueio longo derrubaria o
      // worker em vez de esperar a fila.
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    conexao.on('error', (erro) => logger.error({ erro }, 'erro na conexão com o Redis'));
  }
  return conexao as unknown as ConnectionOptions;
}

/**
 * Política de nova tentativa.
 *
 * Cinco tentativas com recuo exponencial cobrem instabilidade de rede e limite
 * de taxa do provedor. Depois disso o job fica retido — e visível — em vez de
 * sumir: uma mensagem que não chegou ao cliente precisa aparecer para alguém.
 */
const PADRAO: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: false,
};

export function fila(nome: NomeFila): Queue {
  let f = filas.get(nome);
  if (!f) {
    f = new Queue(nome, { connection: obterConexao(), defaultJobOptions: PADRAO });
    filas.set(nome, f);
  }
  return f;
}

/**
 * Enfileira a interpretação de um evento de webhook.
 *
 * O `jobId` é o id do evento: se a mesma entrega for enfileirada duas vezes —
 * por corrida entre dois processos `web`, por exemplo — o BullMQ trata como
 * no-op. É a segunda linha de defesa; a primeira é o índice único
 * `(provider, external_id)` da tabela.
 */
export async function enfileirarEntrada(dados: JobEntrada): Promise<void> {
  await fila(FILAS.entrada).add('interpretar', dados, {
    jobId: `entrada-${dados.webhookEventId}`,
  });
}

/**
 * Enfileira o envio de uma mensagem.
 *
 * O `jobId` é o id da mensagem: enfileirar duas vezes a mesma mensagem é um
 * no-op no BullMQ, o que fecha mais um caminho de envio duplicado ao cliente.
 */
export async function enfileirarEnvio(dados: JobEnvio): Promise<void> {
  // O BullMQ recusa `:` no id do job — ele já usa dois-pontos como separador
  // nas próprias chaves do Redis.
  await fila(FILAS.envio).add('enviar', dados, { jobId: `envio-${dados.messageId}` });
}

export async function enfileirarEmbeddings(dados: JobEmbeddings): Promise<void> {
  await fila(FILAS.embeddings).add('gerar', dados, {
    // Trabalho de fundo: reprocessar é barato e não afeta o cliente.
    attempts: 3,
    jobId: dados.itemId ? `emb-${dados.itemId}` : undefined,
  });
}

export async function enfileirarAprendizado(dados: JobAprendizado): Promise<void> {
  await fila(FILAS.aprendizado).add('agregar', dados, { attempts: 2 });
}

export async function fecharFilas(): Promise<void> {
  await Promise.all([...filas.values()].map((f) => f.close()));
  filas.clear();
  await conexao?.quit();
  conexao = null;
}

export { obterConexao };
