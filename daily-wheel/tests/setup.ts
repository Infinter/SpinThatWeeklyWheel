import { config } from 'dotenv'

// Charge daily-wheel/.env.local dans process.env pour les tests d'intégration.
// (La CLI Vitest, contrairement à Next.js, ne lit pas .env.local automatiquement.)
config({ path: '.env.local' })
