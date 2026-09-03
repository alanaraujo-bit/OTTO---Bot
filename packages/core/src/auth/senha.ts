import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

/**
 * Senhas.
 *
 * Argon2id com parâmetros acima do mínimo recomendado pela OWASP: 19 MiB de
 * memória, 2 iterações, paralelismo 1. O custo de memória é o que torna ataque
 * por GPU caro, e é por isso que ele não deve ser reduzido para "ficar mais
 * rápido" — a lentidão é a funcionalidade.
 */

const OPCOES = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function gerarHashSenha(senha: string): Promise<string> {
  return hash(senha, OPCOES);
}

export async function conferirSenha(hashArmazenado: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, OPCOES);
  } catch {
    // Hash corrompido ou em formato desconhecido não é motivo para vazar exceção
    // no fluxo de login — é apenas uma senha que não confere.
    return false;
  }
}

/**
 * Regra de senha.
 *
 * Comprimento acima de tudo. Exigir maiúscula, número e símbolo produz
 * `Senha@123` — previsível e curta — enquanto uma frase longa é mais forte e
 * mais fácil de lembrar. O mínimo de 10 é deliberado, e o texto de ajuda na
 * interface pede uma frase.
 */
export const esquemaSenha = z
  .string()
  .min(10, 'A senha precisa de pelo menos 10 caracteres.')
  .max(200, 'A senha pode ter no máximo 200 caracteres.')
  .refine((s) => s.trim().length >= 10, 'A senha não pode ser só espaços.');

/** Senhas óbvias que aparecem em qualquer lista de ataque. */
const PROIBIDAS = new Set([
  'senha123456',
  '1234567890',
  'password123',
  'qwertyuiop',
  'admin123456',
]);

export function senhaObvia(senha: string): boolean {
  return PROIBIDAS.has(senha.toLowerCase().trim());
}
