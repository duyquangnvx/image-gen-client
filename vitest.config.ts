import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/integration/**/*.integration.test.ts'],
    exclude: ['src/integration/live/**', 'node_modules', 'dist'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/integration/**', 'src/index.ts', 'src/utils/index.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 75,
        functions: 80,
      },
    },
  },
});
