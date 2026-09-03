import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Testes de isolamento falam com um banco real. Rodar em paralelo com o mesmo
    // schema produz interferência que parece bug do produto e não é.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
