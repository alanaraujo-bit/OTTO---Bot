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
 * Descreve um erro para o log, com a cadeia de causas.
 *
 * Existe porque o serializador padrão do logger só enxerga as propriedades
 * enumeráveis de `AppError` — e `message` e `cause` não são. O resultado era um
 * log que dizia `{"code":"interno","status":500}` e nada mais: tecnicamente um
 * registro de erro, praticamente inútil.
 *
 * A pergunta que o §33 da missão exige responder — "por que essa mensagem não
 * foi enviada?" — depende disto.
 */
export function descreverErro(error: unknown): Record<string, unknown> {
  const cadeia: string[] = [];
  let atual: unknown = error;
  let profundidade = 0;

  while (atual && profundidade < 5) {
    if (atual instanceof Error) {
      cadeia.push(`${atual.name}: ${atual.message}`);
      atual = atual.cause;
    } else if (typeof atual === 'object' && atual !== null && 'message' in atual) {
      cadeia.push(String((atual as { message: unknown }).message));
      atual = undefined;
    } else {
      if (atual !== undefined) cadeia.push(String(atual));
      atual = undefined;
    }
    profundidade++;
  }

  const app = isAppError(error) ? error : null;

  return {
    mensagem: cadeia[0] ?? 'erro desconhecido',
    ...(cadeia.length > 1 ? { causa: cadeia.slice(1) } : {}),
    ...(app ? { codigo: app.code, status: app.status, recuperavel: app.retryable } : {}),
    ...(app && Object.keys(app.context).length ? { contexto: app.context } : {}),
    ...(error instanceof Error && error.stack
      ? { pilha: error.stack.split('\n').slice(1, 4).map((l) => l.trim()) }
      : {}),
  };
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
