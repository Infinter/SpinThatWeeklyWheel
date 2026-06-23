import { describe, it, expect } from 'vitest'
import { POST as postUnavailability } from '@/app/api/unavailabilities/route'
import { POST as postParticipant } from '@/app/api/participants/route'
import { fetchUnavailabilities } from '@/lib/data/unavailabilities'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement les Route Handlers `POST(Request)`. Lancé manuellement (hors CI sans secrets).
// La table `unavailabilities` a une FK vers `participants` (ON DELETE CASCADE) → on crée un
// participant jetable, on lui attache des indispos, puis on supprime le participant (cascade).
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const P_ENDPOINT = 'http://localhost/api/participants'
const U_ENDPOINT = 'http://localhost/api/unavailabilities'
const TEST_NAME = '__test_2.3__'

function req(endpoint: string, body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture unavailabilities — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postUnavailability(
      req(U_ENDPOINT, { op: 'insert', data: { participant_id: 'x', kind: 'day', date1: '2026-06-23' } }),
    )
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture unavailabilities — contrat insert/delete (AD-14, AD-17)', () => {
  it('round-trip : participant → indispo jour + plage → validation → delete + cascade', async () => {
    // Crée un participant jetable pour satisfaire la FK.
    const pRes = await postParticipant(req(P_ENDPOINT, { op: 'insert', data: { name: TEST_NAME } }, passphrase))
    expect(pRes.status).toBe(200)
    const participant = await pRes.json()
    const participantId = participant.id as string

    try {
      // INSERT jour : date2 doit être forcé à null serveur.
      const dayRes = await postUnavailability(
        req(U_ENDPOINT, { op: 'insert', data: { participant_id: participantId, kind: 'day', date1: '2026-06-23', date2: '2026-12-31' } }, passphrase),
      )
      expect(dayRes.status).toBe(200)
      const day = await dayRes.json()
      expect(day.kind).toBe('day')
      expect(day.date2).toBeNull() // day → date2 forcé null par le serveur
      expect(typeof day.updated_at).toBe('string')

      // INSERT plage valide.
      const rangeRes = await postUnavailability(
        req(U_ENDPOINT, { op: 'insert', data: { participant_id: participantId, kind: 'range', date1: '2026-07-01', date2: '2026-07-05' } }, passphrase),
      )
      expect(rangeRes.status).toBe(200)
      const range = await rangeRes.json()
      expect(range.date2).toBe('2026-07-05')

      // INSERT plage INVERSÉE → 400 (validation serveur défensive).
      const badRes = await postUnavailability(
        req(U_ENDPOINT, { op: 'insert', data: { participant_id: participantId, kind: 'range', date1: '2026-07-05', date2: '2026-07-01' } }, passphrase),
      )
      expect(badRes.status).toBe(400)

      // op update → 400 (table sans update).
      const updRes = await postUnavailability(req(U_ENDPOINT, { op: 'update', id: day.id }, passphrase))
      expect(updRes.status).toBe(400)

      // DELETE de l'indispo jour.
      const delRes = await postUnavailability(req(U_ENDPOINT, { op: 'delete', id: day.id }, passphrase))
      expect(delRes.status).toBe(200)

      // DELETE inexistant → 409 (état périmé).
      const delAgain = await postUnavailability(req(U_ENDPOINT, { op: 'delete', id: day.id }, passphrase))
      expect(delAgain.status).toBe(409)
    } finally {
      // Supprime le participant → cascade DB sur ses indispos restantes.
      const cleanup = await postParticipant(req(P_ENDPOINT, { op: 'delete', id: participantId }, passphrase))
      expect(cleanup.status).toBe(200)
    }

    // Vérifie qu'aucune indispo du participant ne subsiste (cascade).
    const rows = await fetchUnavailabilities()
    expect(rows.some((r) => r.participant_id === participantId)).toBe(false)
  })
})
