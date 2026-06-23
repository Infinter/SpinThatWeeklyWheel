import { describe, it, expect } from 'vitest'
import { POST as postTeamOffDay } from '@/app/api/team-off-days/route'
import { fetchTeamOffDays } from '@/lib/data/team-off-days'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement la Route Handler `POST(Request)`. Lancé manuellement (hors CI sans secrets).
// `team_off_days` est autonome (pas de FK) et SANS contrainte d'unicité → un même jour peut être inséré
// deux fois. Le libellé est OPTIONNEL (colonne nullable). Dates de test improbables.
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const ENDPOINT = 'http://localhost/api/team-off-days'

function req(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture team-off-days — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postTeamOffDay(req({ op: 'insert', data: { kind: 'day', date1: '2099-12-31', date2: null, label: null } }))
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture team-off-days — contrat insert/delete jour & plage (AD-14, AD-17)', () => {
  it('round-trip : insert jour (libellé vide accepté) → insert plage → plage inversée 400 → update 400 → delete + 409', async () => {
    // INSERT jour SANS libellé (label vide → null, accepté car colonne nullable).
    const dayRes = await postTeamOffDay(
      req({ op: 'insert', data: { kind: 'day', date1: '2099-12-24', date2: null, label: '   ' } }, passphrase),
    )
    expect(dayRes.status).toBe(200)
    const day = await dayRes.json()
    expect(day.kind).toBe('day')
    expect(day.date1).toBe('2099-12-24')
    expect(day.date2).toBeNull()
    expect(day.label).toBeNull()
    expect(typeof day.updated_at).toBe('string')

    // INSERT plage AVEC libellé.
    const rangeRes = await postTeamOffDay(
      req({ op: 'insert', data: { kind: 'range', date1: '2099-12-26', date2: '2099-12-31', label: 'Fermeture fin d’année' } }, passphrase),
    )
    expect(rangeRes.status).toBe(200)
    const range = await rangeRes.json()
    expect(range.kind).toBe('range')
    expect(range.date2).toBe('2099-12-31')
    expect(range.label).toBe('Fermeture fin d’année')

    try {
      // Plage inversée (fin < début) → 400 (validation serveur défensive).
      const inverted = await postTeamOffDay(
        req({ op: 'insert', data: { kind: 'range', date1: '2099-12-31', date2: '2099-12-26', label: null } }, passphrase),
      )
      expect(inverted.status).toBe(400)

      // date1 vide → 400.
      const badDate = await postTeamOffDay(
        req({ op: 'insert', data: { kind: 'day', date1: '', date2: null, label: null } }, passphrase),
      )
      expect(badDate.status).toBe(400)

      // op update → 400 (table sans update).
      const updRes = await postTeamOffDay(req({ op: 'update', id: day.id }, passphrase))
      expect(updRes.status).toBe(400)
    } finally {
      // DELETE des deux lignes.
      const delDay = await postTeamOffDay(req({ op: 'delete', id: day.id }, passphrase))
      expect(delDay.status).toBe(200)
      const delRange = await postTeamOffDay(req({ op: 'delete', id: range.id }, passphrase))
      expect(delRange.status).toBe(200)
    }

    // DELETE inexistant → 409 (état périmé).
    const delAgain = await postTeamOffDay(req({ op: 'delete', id: day.id }, passphrase))
    expect(delAgain.status).toBe(409)

    // Vérifie que les lignes ne subsistent pas.
    const rows = await fetchTeamOffDays()
    expect(rows.some((r) => r.id === day.id || r.id === range.id)).toBe(false)
  })
})
