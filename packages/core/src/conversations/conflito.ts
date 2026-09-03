/**
 * Violação de unicidade do Postgres.
 *
 * Nos caminhos idempotentes — receber a mesma mensagem duas vezes, reprocessar
 * um evento — a colisão **é** o resultado esperado, e não um erro.
 *
 * Usamos isto em vez de `ON CONFLICT DO NOTHING` porque os índices envolvidos são
 * parciais (`where external_id is not null`), e o `onConflictDoNothing` do
 * Drizzle não expõe o predicado do índice: sem ele, o Postgres não reconhece qual
 * índice arbitra o conflito e recusa a instrução.
 *
 * Também é mais honesto: a corrida acontece, nós a detectamos e seguimos com o
 * registro que venceu, em vez de fingir que a segunda escrita não existiu.
 */

/** Código SQLSTATE de `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

export function ehViolacaoDeUnicidade(erro: unknown, indice?: string): boolean {
  let atual: unknown = erro;

  // O Drizzle embrulha o erro do driver; o código real está em `cause`.
  while (atual) {
    if (typeof atual === 'object' && atual !== null && 'code' in atual) {
      const codigo = (atual as { code?: unknown }).code;
      if (codigo === UNIQUE_VIOLATION) {
        if (!indice) return true;
        const restricao = (atual as { constraint?: unknown }).constraint;
        return typeof restricao === 'string' && restricao === indice;
      }
    }
    atual = atual instanceof Error ? atual.cause : undefined;
  }

  return false;
}
