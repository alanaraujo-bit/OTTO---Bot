import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // O worker e o console compartilham pacotes do monorepo em TypeScript puro.
  transpilePackages: ['@otto/ui', '@otto/core', '@otto/db', '@otto/shared'],
  // Necessário para o deploy no Railway: empacota só o que o servidor usa.
  output: 'standalone',
  poweredByHeader: false,
};

export default config;
