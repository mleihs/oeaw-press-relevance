import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['{app,components,lib}/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Measurement only (no enforced threshold yet) so `npm run test:coverage`
      // surfaces the gaps the audit flagged without red-ing the build on day one.
      reporter: ['text-summary', 'html'],
      include: ['app/**', 'components/**', 'lib/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'lib/server/db/**'],
    },
  },
});
