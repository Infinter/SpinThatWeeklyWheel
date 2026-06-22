import { describe, it, expect } from 'vitest'
import { fetchParticipants } from '@/lib/data/participants'

// Test d'intégration LIVE (réseau + Supabase réel), gardé par variables d'environnement.
// Se skippe proprement si les variables publiques sont absentes (CI sans credentials).
// Lancé par `npm run test:read` — PAS enrôlé dans un `npm test` global (réservé Story 1.5, AD-13).
const ready = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

describe.skipIf(!ready)('Lecture low-privilege via lib/data (AD-7, AD-11)', () => {
  it('fetchParticipants() renvoie un tableau sans erreur', async () => {
    const rows = await fetchParticipants()
    expect(Array.isArray(rows)).toBe(true)

    // AC4 : si des lignes existent, les champs date/timestamp restent des chaînes (jamais Date/UTC).
    if (rows.length > 0) {
      expect(typeof rows[0].created_at).toBe('string')
      expect(typeof rows[0].updated_at).toBe('string')
    }
  })
})
