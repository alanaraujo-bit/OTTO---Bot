import { randomUUID, randomFillSync } from 'node:crypto';

/**
 * UUID v7 — ordenável por tempo.
 *
 * Chaves primárias aleatórias (v4) espalham escritas por toda a árvore do índice.
 * Em tabelas que crescem rápido e são sempre lidas em ordem cronológica — mensagens,
 * eventos, execuções de IA — isso custa caro. v7 mantém a localidade do índice.
 *
 * O Postgres 18 tem `uuidv7()` nativo, usado como default nas colunas. Esta função
 * existe para quando precisamos do id antes de escrever (idempotência, correlação
 * entre fila e banco).
 */
const bytes = new Uint8Array(16);

export function uuidv7(): string {
  randomFillSync(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 0x10000000000) & 0xff;
  bytes[1] = (ms / 0x100000000) & 0xff;
  bytes[2] = (ms / 0x1000000) & 0xff;
  bytes[3] = (ms / 0x10000) & 0xff;
  bytes[4] = (ms / 0x100) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // versão 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122

  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identificador opaco para correlacionar uma requisição nos logs. */
export function requestId(): string {
  return randomUUID();
}

const ALFABETO_SEM_AMBIGUIDADE = '346789ABCDEFGHJKLMNPQRTUVWXY';

/**
 * Código curto para humanos lerem e digitarem (convites, referência de caso).
 * Sem 0/O, 1/I/L, 2/Z, 5/S — os pares que as pessoas confundem ao ditar por telefone.
 */
export function codigoLegivel(tamanho = 8): string {
  const buf = new Uint8Array(tamanho);
  randomFillSync(buf);
  let out = '';
  for (let i = 0; i < tamanho; i++) {
    out += ALFABETO_SEM_AMBIGUIDADE[buf[i]! % ALFABETO_SEM_AMBIGUIDADE.length];
  }
  return out;
}
