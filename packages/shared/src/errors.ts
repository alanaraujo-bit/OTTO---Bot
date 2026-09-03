/**
 * Erros da aplicação.
 *
 * Regra: todo erro que o usuário pode ver carrega uma mensagem em português que
 * explica o que aconteceu. Detalhe técnico vai em `cause` e `context`, que nunca
 * chegam ao navegador — só ao log.
 */

export type ErrorCode =
  | 'nao_autenticado'
  | 'sem_permissao'
  | 'nao_encontrado'
  | 'conflito'
  | 'entrada_invalida'
  | 'limite_excedido'
  | 'dependencia_externa'
  | 'tenant_ausente'
  | 'interno';

/** Como o cliente HTTP deve reagir a cada código. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  nao_encontrado: 404,
  conflito: 409,
  entrada_invalida: 422,
  limite_excedido: 429,
  dependencia_externa: 502,
  tenant_ausente: 500,
  interno: 500,
};

export interface AppErrorOptions {
  /** Detalhe técnico para o log. Nunca exibido ao usuário. */
  context?: Record<string, unknown>;
  cause?: unknown;
  /** Se a operação pode dar certo em uma nova tentativa. Orienta filas e UI. */
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly context: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.context = options.context ?? {};
    this.retryable = options.retryable ?? (code === 'dependencia_externa' || code === 'limite_excedido');
  }
}

export const naoAutenticado = (message = 'Sua sessão expirou. Entre novamente.') =>
  new AppError('nao_autenticado', message);

export const semPermissao = (message = 'Você não tem permissão para fazer isso.') =>
  new AppError('sem_permissao', message);

export const naoEncontrado = (o: string) => new AppError('nao_encontrado', `${o} não foi encontrado.`);

export const entradaInvalida = (message: string, context?: Record<string, unknown>) =>
  new AppError('entrada_invalida', message, context ? { context } : {});

export const conflito = (message: string, context?: Record<string, unknown>) =>
  new AppError('conflito', message, context ? { context } : {});

export const dependenciaExterna = (servico: string, options: AppErrorOptions = {}) =>
  new AppError('dependencia_externa', `${servico} não respondeu. Tente novamente em instantes.`, {
    ...options,
    retryable: options.retryable ?? true,
  });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Converte qualquer coisa lançada em algo com forma previsível.
 * Um `throw 'string'` em uma dependência não pode derrubar o tratamento de erro.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError('interno', 'Algo deu errado do nosso lado.', { cause: error });
  }
  return new AppError('interno', 'Algo deu errado do nosso lado.', {
    context: { thrown: String(error) },
  });
}
