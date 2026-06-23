import { describe, it, expect } from 'vitest'
import { POST as postSetting } from '@/app/api/settings/route'
import { fetchSettings } from '@/lib/data/settings'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env.
// On appelle directement la Route Handler `POST(Request)`. Lancé manuellement (hors CI sans secrets).
// `settings` est une ligne unique 'singleton' (upsert) → on modifie puis on restaure des valeurs sûres.
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const ENDPOINT = 'http://localhost/api/settings'

function req(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

describe.skipIf(!ready)('Proxy écriture settings — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postSetting(req({ op: 'upsert', data: { skip_weekends: true } }))
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture settings — upsert singleton + validations (AD-14, AD-17)', () => {
  it('round-trip : upsert skip_weekends → upsert start_date → validations 400', async () => {
    // UPSERT skip_weekends=false.
    const r1 = await postSetting(req({ op: 'upsert', data: { skip_weekends: false } }, passphrase))
    expect(r1.status).toBe(200)
    const s1 = await r1.json()
    expect(s1.id).toBe('singleton')
    expect(s1.skip_weekends).toBe(false)
    expect(typeof s1.updated_at).toBe('string')

    // UPSERT start_date (patch partiel — skip_weekends conservé).
    const r2 = await postSetting(req({ op: 'upsert', data: { start_date: '2099-01-01' } }, passphrase))
    expect(r2.status).toBe(200)
    const s2 = await r2.json()
    expect(s2.start_date).toBe('2099-01-01')
    expect(s2.skip_weekends).toBe(false)
    expect(s2.updated_at > s1.updated_at).toBe(true) // updated_at avance sur l'UPDATE

    // op invalide → 400.
    const badOp = await postSetting(req({ op: 'insert', data: { skip_weekends: true } }, passphrase))
    expect(badOp.status).toBe(400)

    // start_date mal formé → 400.
    const badDate = await postSetting(req({ op: 'upsert', data: { start_date: '01/01/2099' } }, passphrase))
    expect(badDate.status).toBe(400)

    // data vide après allowlist → 400.
    const empty = await postSetting(req({ op: 'upsert', data: { foo: 'bar' } }, passphrase))
    expect(empty.status).toBe(400)

    // start_date: null est VALIDE.
    const nullDate = await postSetting(req({ op: 'upsert', data: { start_date: null } }, passphrase))
    expect(nullDate.status).toBe(200)

    // Restauration de valeurs neutres (skip_weekends=true par défaut métier).
    const restore = await postSetting(req({ op: 'upsert', data: { skip_weekends: true, start_date: null } }, passphrase))
    expect(restore.status).toBe(200)

    const row = await fetchSettings()
    expect(row?.skip_weekends).toBe(true)
    expect(row?.start_date).toBeNull()
  })
})
