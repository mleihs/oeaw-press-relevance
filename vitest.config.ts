import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` is a bare specifier Next resolves at build time; under
      // vitest's plain-Node run there is no bundler to resolve it, so map it to
      // an empty module (the server-side no-op). Lets server-guarded read
      // modules (lib/server/**/{list,fetch}.ts) be unit-tested.
      'server-only': path.resolve(__dirname, 'test/server-only-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    // App/lib tests are .ts(x); the node-run helper scripts under scripts/lib
    // (cf. scripts/lib/doi-extract.mjs) are .mjs and carry co-located .test.mjs.
    include: [
      '{app,components,lib}/**/*.test.{ts,tsx}',
      'scripts/**/*.test.mjs',
    ],
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
