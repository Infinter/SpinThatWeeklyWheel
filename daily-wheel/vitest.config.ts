import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Config Vitest minimale (Story 1.2). Le harnais complet + CI sont cadrés en Story 1.5 (AD-13).
// Tests d'intégration env-gated : Realtime (1.2) + lecture low-privilege (1.3).
export default defineConfig({
  // Résout l'alias `@/*` de tsconfig.json (Vitest ne lit pas les `paths` TS tout seul).
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` jette à l'import hors graphe React Server → stub neutre pour les tests
      // (la vraie garde reste active au `npm run build`). Story 1.4.
      'server-only': fileURLToPath(new URL('./tests/server-only.stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'], // charge .env.local dans process.env
    testTimeout: 20000, // l'aller-retour réseau Supabase peut prendre quelques secondes
  },
})
