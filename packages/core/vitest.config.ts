import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Falam com um banco real: em paralelo, um teste vê a empresa do outro.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
