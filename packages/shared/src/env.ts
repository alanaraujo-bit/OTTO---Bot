import { z } from 'zod';

/**
 * Configuração de ambiente.
 *
 * Falha no arranque, com mensagem clara, em vez de falhar em produção às três da
 * manhã porque uma variável estava vazia. Nenhum valor padrão silencioso para
 * segredo — se falta, o processo não sobe.
 */

const appEnv = z.enum(['development', 'staging', 'production']);

const baseSchema = z.object({
  APP_ENV: appEnv.default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatória'),
  /** Usada para assinar cookies de sessão. 32 bytes em base64url. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de pelo menos 32 caracteres'),
  /** Cifra segredos de canal em repouso. 32 bytes em base64. Perder isso invalida os tokens salvos. */
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY precisa de pelo menos 32 caracteres'),
  APP_URL: z.url('APP_URL precisa ser uma URL completa, com esquema'),
});

const webSchema = baseSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Segredos da Meta. Opcionais de propósito: o produto sobe e opera inteiro
   * pelo canal `simulador` sem app aprovado, e exigi-los no arranque quebraria
   * o desenvolvimento local por uma dependência que ainda está em análise.
   *
   * A ausência não é silenciosa: o webhook recusa a verificação (`503`) e
   * recusa evento sem assinatura (`401`), dizendo qual variável falta.
   */
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(16).optional(),
  META_APP_SECRET: z.string().min(16).optional(),
});

const workerSchema = baseSchema.extend({
  /** Quantos jobs um worker processa ao mesmo tempo. */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(100).default(8),
});

export type AppEnvironment = z.infer<typeof appEnv>;
export type BaseEnv = z.infer<typeof baseSchema>;
export type WebEnv = z.infer<typeof webSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;

function parse<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const problemas = result.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Configuração de ambiente inválida.\n${problemas}\n\n` +
      'Copie .env.example para .env e preencha os valores. Veja docs/AMBIENTES.md.',
  );
}

export const parseWebEnv = (source: NodeJS.ProcessEnv = process.env): WebEnv =>
  parse(webSchema, source);

export const parseWorkerEnv = (source: NodeJS.ProcessEnv = process.env): WorkerEnv =>
  parse(workerSchema, source);

export const isProduction = (env: { APP_ENV: AppEnvironment }) => env.APP_ENV === 'production';
