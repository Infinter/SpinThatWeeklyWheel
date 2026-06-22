import { config } from 'dotenv'

// Charge daily-wheel/.env.local dans process.env pour les tests d'intégration.
// (La CLI Vitest, contrairement à Next.js, ne lit pas .env.local automatiquement.)
config({ path: '.env.local' })

// ── Readiness des tests LIVE (Story 1.5, AD-13 — harnais `npm test` global) ──────────────
// Les clients Supabase (lib/supabase/{client,admin}.ts) JETTENT à l'import quand les env
// manquent. Sans précaution, `npm test` SANS secrets (ex. CI) ferait ÉCHOUER les fichiers
// de test live À L'IMPORT (avant que `describe.skipIf` n'agisse) — et casserait même les
// tests PURS qui importent lib/data/participants (→ client.ts).
//
// On capture donc la présence des VRAIS credentials AVANT toute substitution, puis on injecte
// des placeholders neutres pour que l'import ne jette pas. Les suites live gardent leur skip
// sur ce drapeau `SUPABASE_TEST_LIVE` (et NON sur la simple présence des variables) → elles se
// skippent proprement en CI, tout en tournant réellement en local (où .env.local fournit tout).
const hasLiveCreds = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SECRET_KEY,
)
process.env.SUPABASE_TEST_LIVE = hasLiveCreds ? '1' : ''

// Placeholders d'IMPORT uniquement (jamais utilisés pour un appel réseau : les suites live
// sont skippées dès que SUPABASE_TEST_LIVE !== '1'). `||=` préserve les vraies valeurs locales.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key-placeholder'
process.env.SUPABASE_SECRET_KEY ||= 'test-secret-key-placeholder'
