import swc from 'unplugin-swc'
import tsConfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// E2E (*.e2e-spec.ts) com Supertest; o setup (schema Postgres isolado por
// execução) nasce na T-02 em test/setup-e2e.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    passWithNoTests: true,
  },
  plugins: [
    tsConfigPaths(),
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
})
