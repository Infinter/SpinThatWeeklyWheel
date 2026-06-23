import { describe, it, expect } from 'vitest'
import { POST as postHoliday } from '@/app/api/holidays/route'
import { fetchHolidays } from '@/lib/data/holidays'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement la Route Handler `POST(Request)`. Lancé manuellement (hors CI sans secrets).
// `holidays` est autonome (pas de FK) → on insère un férié puis on le supprime. Date de test improbable
// pour éviter de heurter un vrai férié déjà saisi.
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const ENDPOINT = 'http://localhost/api/holidays'
const TEST_DATE = '2099-12-31'

function req(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture holidays — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postHoliday(req({ op: 'insert', data: { date: TEST_DATE, label: 'Test' } }))
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture holidays — contrat insert/delete + unicité (AD-14, AD-17)', () => {
  it('round-trip : insert férié → doublon 409 → validations 400 → delete + 409', async () => {
    // INSERT férié valide.
    const insRes = await postHoliday(req({ op: 'insert', data: { date: TEST_DATE, label: 'Test' } }, passphrase))
    expect(insRes.status).toBe(200)
    const holiday = await insRes.json()
    expect(holiday.date).toBe(TEST_DATE)
    expect(holiday.label).toBe('Test')
    expect(typeof holiday.updated_at).toBe('string')

    try {
      // Doublon de date → 409 (contrainte d'unicité holidays.date → 23505).
      const dup = await postHoliday(req({ op: 'insert', data: { date: TEST_DATE, label: 'Autre' } }, passphrase))
      expect(dup.status).toBe(409)

      // date vide → 400 (validation serveur défensive).
      const badDate = await postHoliday(req({ op: 'insert', data: { date: '', label: 'X' } }, passphrase))
      expect(badDate.status).toBe(400)

      // label vide → 400.
      const badLabel = await postHoliday(req({ op: 'insert', data: { date: '2099-12-30', label: '  ' } }, passphrase))
      expect(badLabel.status).toBe(400)

      // op update → 400 (table sans update).
      const updRes = await postHoliday(req({ op: 'update', id: holiday.id }, passphrase))
      expect(updRes.status).toBe(400)
    } finally {
      // DELETE du férié.
      const delRes = await postHoliday(req({ op: 'delete', id: holiday.id }, passphrase))
      expect(delRes.status).toBe(200)
    }

    // DELETE inexistant → 409 (état périmé).
    const delAgain = await postHoliday(req({ op: 'delete', id: holiday.id }, passphrase))
    expect(delAgain.status).toBe(409)

    // Vérifie que le férié ne subsiste pas.
    const rows = await fetchHolidays()
    expect(rows.some((r) => r.id === holiday.id)).toBe(false)
  })
})
