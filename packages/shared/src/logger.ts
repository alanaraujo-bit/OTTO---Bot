import pino from 'pino';

/**
 * Log estruturado.
 *
 * Duas regras que valem mais que qualquer configuração:
 *  1. Nada de dado pessoal desnecessário no log (LGPD, §36 da missão). Telefone,
 *     nome e conteúdo de mensagem são redigidos por padrão.
 *  2. Todo log de uma operação carrega os mesmos identificadores de correlação,
 *     para que "por que essa mensagem não foi enviada?" seja uma consulta, não
 *     uma caçada.
 */

const CAMINHOS_SENSIVEIS = [
  'password',
  'senha',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'apiKey',
  'authorization',
  'cookie',
  'secret',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  'req.headers.authorization',
  'req.headers.cookie',
];

const nivel = process.env.LOG_LEVEL ?? 'info';
const bonito = process.env.APP_ENV !== 'production' && process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: nivel,
  redact: { paths: CAMINHOS_SENSIVEIS, censor: '[redigido]' },
  base: { env: process.env.APP_ENV ?? 'development' },
  ...(bonito
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,env' },
        },
      }
    : {}),
});

/** Identificadores que amarram um log a uma operação de negócio. */
export interface LogContext {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  conversationId?: string;
  messageId?: string;
  jobId?: string;
  channelId?: string;
}

export type Logger = pino.Logger;

export function childLogger(context: LogContext): Logger {
  return logger.child(context);
}
