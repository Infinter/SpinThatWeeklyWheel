import { describe, it, expect } from 'vitest'
import { POST } from '@/app/api/participants/route'
import { fetchParticipants } from '@/lib/data/participants'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement la Route Handler `POST(Request)` — une fonction Web standard,
// pas besoin de serveur Next ni de port. Lancé par `npm run test:write`.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const passphrase = process.env.TEAM_PASSPHRASE
const ready = Boolean(url && anon && secret && passphrase)

const ENDPOINT = 'http://localhost/api/participants'
const TEST_NAME = '__test_1.4__'

function makeRequest(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture participants — garde passphrase (AD-8, AD-17)', () => {
  it('header absent → 401, aucune écriture', async () => {
    const res = await POST(makeRequest({ op: 'insert', data: { name: TEST_NAME } }))
    expect(res.status).toBe(401)
    const rows = await fetchParticipants()
    expect(rows.some((r) => r.name === TEST_NAME)).toBe(false)
  })

  it('mauvaise passphrase → 401, aucune écriture', async () => {
    const res = await POST(makeRequest({ op: 'insert', data: { name: TEST_NAME } }, 'mauvaise'))
    expect(res.status).toBe(401)
    const rows = await fetchParticipants()
    expect(rows.some((r) => r.name === TEST_NAME)).toBe(false)
  })
})

describe.skipIf(!ready)('Proxy écriture participants — contrat insert/update/delete (AD-14, AD-15)', () => {
  it('round-trip insert → update → delete, updated_at serveur + allowlist', async () => {
    // INSERT : `foo` n'est PAS dans l'allowlist {name, active} → doit être ignoré.
    const insRes = await POST(
      makeRequest({ op: 'insert', data: { name: TEST_NAME, active: true, foo: 'x' } }, passphrase),
    )
    expect(insRes.status).toBe(200)
    const created = await insRes.json()
    expect(created.id).toBeTruthy()
    expect(created.name).toBe(TEST_NAME)
    expect(created.active).toBe(true)
    expect('foo' in created).toBe(false) // allowlist appliquée
    expect(typeof created.updated_at).toBe('string') // dates = string (jamais Date)
    const id = created.id as string
    const updatedAt0 = created.updated_at as string

    try {
      // L'horloge serveur a une résolution µs ; petite attente pour garantir un updated_at distinct.
      await new Promise((r) => setTimeout(r, 50))

      // UPDATE : patch partiel.
      const updRes = await POST(makeRequest({ op: 'update', id, data: { active: false } }, passphrase))
      expect(updRes.status).toBe(200)
      const updated = await updRes.json()
      expect(updated.active).toBe(false)
      expect(updated.name).toBe(TEST_NAME) // patch partiel : name conservé
      expect(updated.updated_at).not.toBe(updatedAt0) // updated_at repositionné serveur (AD-15)
    } finally {
      // DELETE (toujours, même si une assertion échoue) — laisse la DB propre.
      const delRes = await POST(makeRequest({ op: 'delete', id }, passphrase))
      expect(delRes.status).toBe(200)
    }

    // Vérifie la suppression effective.
    const rows = await fetchParticipants()
    expect(rows.some((r) => r.id === id)).toBe(false)
  })

  it('op inconnue → 400', async () => {
    const res = await POST(makeRequest({ op: 'frobnicate', data: { name: TEST_NAME } }, passphrase))
    expect(res.status).toBe(400)
  })

  it('insert avec data vide après allowlist → 400', async () => {
    // `foo` hors allowlist → data filtrée vide → 400 (validation), aucune écriture.
    const res = await POST(makeRequest({ op: 'insert', data: { foo: 'x' } }, passphrase))
    expect(res.status).toBe(400)
  })

  it('update sans id → 400', async () => {
    const res = await POST(makeRequest({ op: 'update', data: { active: false } }, passphrase))
    expect(res.status).toBe(400)
  })
})
