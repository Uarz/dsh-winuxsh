/**
 * Vitest entry for the standalone dsh-niubash mirror. The suites exercise the
 * PUBLISHED artifacts (`lib/*.js`) through the `@cmx666/*` package names —
 * npm workspaces link those to the in-repo packages, so a lib/ that drifts
 * from src/ fails here instead of at install time on a user machine.
 *
 * Suites that need a real niu executable self-skip (`describe.skipIf`) when
 * `resolveNiubashPath()` cannot resolve and run one; the pure blocks
 * (resolution, config validation, argv construction, classification
 * helpers) always run.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/shell/*/tests/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
})
