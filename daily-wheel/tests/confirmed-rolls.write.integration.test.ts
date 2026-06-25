import { describe, it, expect, afterAll } from 'vitest'
import { POST as postConfirmedRoll } from '@/app/api/confirmed_rolls/route'
import { fetchConfirmedRolls } from '@/lib/data/confirmed-rolls'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Test d'INTÉGRATION LIVE (réseau + Supabase réel + clé secrète), gardé par variables d'env. On appelle
// directement la Route Handler `POST(Request)`. Lancé manuellement (hors CI sans secrets). `confirmed_rolls`
// est un journal MULTI-LIGNES (clé composite seed,date) → on écrit avec des seeds de test réservés, puis on
// nettoie via la clé admin en fin de suite.
const passphrase = process.env.TEAM_PASSPHRASE
const ready = process.env.SUPABASE_TEST_LIVE === '1' && Boolean(passphrase)

const ENDPOINT = 'http://localhost/api/confirmed_rolls'

// Seeds de test réservés (collision avec un seed réel — random [0, 2^32) — astronomiquement improbable).
const SEED_A = 4294967295 // 2^32 - 1
const SEED_B = 4294967294
const DATE = '2099-12-31'

function req(body: unknown, pass?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (pass !== undefined) headers['x-team-passphrase'] = pass
  return new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
}

afterAll(async () => {
  if (!ready) return
  // Nettoyage : supprime les lignes de test (clé admin, contourne RLS).
  await supabaseAdmin.from('confirmed_rolls').delete().in('seed', [SEED_A, SEED_B])
})

describe.skipIf(!ready)('Proxy écriture confirmed_rolls — garde passphrase (AD-8)', () => {
  it('header absent → 401', async () => {
    const res = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: SEED_A, date: DATE, participant_id: 'p-1', name: 'Test' } }),
    )
    expect(res.status).toBe(401)
  })
})

describe.skipIf(!ready)('Proxy écriture confirmed_rolls — upsert (seed,date) + validations (AD-14, AD-17)', () => {
  it('round-trip : upsert → idempotence (seed,date) → re-roll append → validations 400', async () => {
    // UPSERT initial → 200.
    const r1 = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: SEED_A, date: DATE, participant_id: 'p-1', name: 'Alice' } }, passphrase),
    )
    expect(r1.status).toBe(200)
    const row1 = await r1.json()
    expect(row1.seed).toBe(SEED_A)
    expect(row1.date).toBe(DATE)
    expect(row1.participant_id).toBe('p-1')
    expect(row1.name).toBe('Alice')
    expect(typeof row1.confirmed_at).toBe('string')

    // IDEMPOTENCE : re-upsert le même (seed,date) avec un name différent → met à jour, ne duplique pas.
    const r2 = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: SEED_A, date: DATE, participant_id: 'p-2', name: 'Bob' } }, passphrase),
    )
    expect(r2.status).toBe(200)

    // RE-ROLL : autre seed, même date → ligne DISTINCTE (historique préservé).
    const r3 = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: SEED_B, date: DATE, participant_id: 'p-3', name: 'Carol' } }, passphrase),
    )
    expect(r3.status).toBe(200)

    // Vérif côté lecture : 1 ligne pour (SEED_A, DATE) — la dernière valeur — + 1 ligne pour (SEED_B, DATE).
    const rows = await fetchConfirmedRolls()
    const a = rows.filter((r) => r.seed === SEED_A && r.date === DATE)
    const b = rows.filter((r) => r.seed === SEED_B && r.date === DATE)
    expect(a).toHaveLength(1) // idempotence : pas de doublon
    expect(a[0].name).toBe('Bob') // dernière écriture gagne
    expect(b).toHaveLength(1) // re-roll : ligne distincte conservée

    // op invalide → 400.
    const badOp = await postConfirmedRoll(
      req({ op: 'insert', data: { seed: SEED_A, date: DATE, participant_id: 'p-1', name: 'X' } }, passphrase),
    )
    expect(badOp.status).toBe(400)

    // data vide après allowlist → 400.
    const empty = await postConfirmedRoll(req({ op: 'upsert', data: { foo: 'bar' } }, passphrase))
    expect(empty.status).toBe(400)

    // champ NOT NULL manquant (name) → 400 (validation défensive).
    const missing = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: SEED_A, date: DATE, participant_id: 'p-1' } }, passphrase),
    )
    expect(missing.status).toBe(400)

    // seed hors uint32 → 400.
    const badSeed = await postConfirmedRoll(
      req({ op: 'upsert', data: { seed: 0x100000000, date: DATE, participant_id: 'p-1', name: 'X' } }, passphrase),
    )
    expect(badSeed.status).toBe(400)
  })
})
