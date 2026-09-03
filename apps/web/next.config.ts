import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

/**
 * O `.env` vive na raiz do monorepo, não dentro desta aplicação: as mesmas
 * credenciais servem ao console, ao worker, às migrações e aos testes, e manter
 * uma cópia por pacote é como as cópias divergem.
 *
 * O Next só procura `.env` na pasta da própria aplicação, então carregamos a
 * raiz aqui. Valores já presentes no ambiente têm precedência — em produção
 * quem manda é o Railway, e este arquivo nem existe lá.
 */
function carregarEnvDaRaiz(): void {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const arquivo = resolve(raiz, '.env');
  if (!existsSync(arquivo)) return;

  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;

    const separador = limpa.indexOf('=');
    if (separador < 1) continue;

    const chave = limpa.slice(0, separador).trim();
    if (process.env[chave] !== undefined) continue;

    let valor = limpa.slice(separador + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[chave] = valor;
  }
}

carregarEnvDaRaiz();

const config: NextConfig = {
  reactStrictMode: true,
  // O selo de desenvolvimento cobre o rodapé da barra lateral e polui inspeção
  // visual; não muda nada em produção, onde ele já não existe.
  devIndicators: false,
  // Os pacotes do monorepo são TypeScript puro, sem build próprio.
  transpilePackages: ['@otto/ui', '@otto/core', '@otto/db', '@otto/shared'],
  // Empacota só o que o servidor usa para a imagem Docker do Railway. O
  // adaptador do Vercel já cuida do empacotamento próprio e não aceita o
  // manifesto standalone do Next.
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  poweredByHeader: false,
  serverExternalPackages: ['pg', '@node-rs/argon2', 'pino', 'pino-pretty'],
};

export default config;
