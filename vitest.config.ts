import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'src/**/*.test.ts', 'server.test.js'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
