import { describe, it, expect } from 'vitest'
import { POST as postGroupExclusion } from '@/app/api/group-exclusions/route'
import { fetchGroupExclusions } from '@/lib/data/group-exclusions'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement la Route Handler `POST(Request)`. Lancé manuellement (hors CI sans secrets).
// `group_exclusions` est autonome (pas de FK) → on insère une règle puis on la supprime.
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const ENDPOINT = 'http://localhost/api/group-exclusions'

function req(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture group_exclusions — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postGroupExclusion(
      req({ op: 'insert', data: { day_of_week: 2, every_n: 2, ref_date: '2026-06-23' } }),
    )
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture group_exclusions — contrat insert/delete (AD-14, AD-17)', () => {
  it('round-trip : insert règle → validations 400 → delete + 409', async () => {
    // INSERT règle valide (2026-06-23 est un mardi = day_of_week 2).
    const insRes = await postGroupExclusion(
      req({ op: 'insert', data: { day_of_week: 2, every_n: 2, ref_date: '2026-06-23' } }, passphrase),
    )
    expect(insRes.status).toBe(200)
    const rule = await insRes.json()
    expect(rule.day_of_week).toBe(2)
    expect(rule.every_n).toBe(2)
    expect(typeof rule.updated_at).toBe('string')

    try {
      // every_n = 0 → 400 (validation serveur défensive).
      const badN = await postGroupExclusion(
        req({ op: 'insert', data: { day_of_week: 2, every_n: 0, ref_date: '2026-06-23' } }, passphrase),
      )
      expect(badN.status).toBe(400)

      // ref_date ne tombe PAS sur le jour choisi (2026-06-23 est mardi, pas lundi=1) → 400.
      const badRef = await postGroupExclusion(
        req({ op: 'insert', data: { day_of_week: 1, every_n: 2, ref_date: '2026-06-23' } }, passphrase),
      )
      expect(badRef.status).toBe(400)

      // op update → 400 (table sans update).
      const updRes = await postGroupExclusion(req({ op: 'update', id: rule.id }, passphrase))
      expect(updRes.status).toBe(400)
    } finally {
      // DELETE de la règle.
      const delRes = await postGroupExclusion(req({ op: 'delete', id: rule.id }, passphrase))
      expect(delRes.status).toBe(200)
    }

    // DELETE inexistant → 409 (état périmé).
    const delAgain = await postGroupExclusion(req({ op: 'delete', id: rule.id }, passphrase))
    expect(delAgain.status).toBe(409)

    // Vérifie que la règle ne subsiste pas.
    const rows = await fetchGroupExclusions()
    expect(rows.some((r) => r.id === rule.id)).toBe(false)
  })
})
