import { describe, it, expect } from 'vitest'
import { fetchParticipants } from '@/lib/data/participants'

// Test d'intégration LIVE (réseau + Supabase réel), gardé par credentials réels.
// Skip propre sans secrets via le sentinel `SUPABASE_TEST_LIVE` posé par tests/setup.ts
// (les env sont remplies de placeholders d'import en CI → on ne peut PAS gater sur leur présence).
// Enrôlé dans `npm test` global (Story 1.5, AD-13) et lançable seul via `npm run test:read`.
const ready = process.env.SUPABASE_TEST_LIVE === '1'

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
