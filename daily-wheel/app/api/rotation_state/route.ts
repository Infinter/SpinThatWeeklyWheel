import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Proxy d'ÉCRITURE pour `rotation_state` (AD-7, AD-14). SEUL endroit qui importe le client secret pour
// cette table. Contrat SINGLETON calqué sur `settings` : POST { op: 'upsert', data } + header
// x-team-passphrase. Op UNIQUE `upsert` : `id` est TOUJOURS forcé à 'singleton' côté serveur (jamais lu
// du client). La clé secrète contourne RLS (AD-9) ; la garde passphrase (AD-8) est l'unique verrou réel.
// Story 5.6 : persistance de la rotation (graine + curseur + mode), reproductible (NFR7), jamais figée.
export const runtime = 'nodejs'

// Allowlist de colonnes écrivables (AD-14). id (forcé 'singleton') / updated_at = serveur.
const ALLOWED = ['seed', 'cursor', 'mode', 'start_date'] as const
const MODES = ['rotation-complete', 'jour-le-jour'] as const
const UINT32_MAX = 0xffffffff
const YMD = /^\d{4}-\d{2}-\d{2}$/

type WriteBody = {
  op?: unknown
  data?: Record<string, unknown>
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status })
}

// Comparaison en temps constant (AD-8) : évite une fuite par timing sur la passphrase.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// N'extrait de `data` que les colonnes autorisées (AD-14) ; tout le reste est ignoré.
function pickAllowed(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data && typeof data === 'object') {
    for (const key of ALLOWED) {
      if (key in data) out[key] = data[key]
    }
  }
  return out
}

// Mappe une erreur Supabase/Postgres vers la taxonomie HTTP (AD-17). Générique : pas de contrainte
// d'unicité au-delà du PK `id` (l'upsert résout le conflit de PK).
function mapDbError(error: { code?: string; message?: string }): Response {
  if (error.code === 'PGRST116') return json(409, { error: 'introuvable (état périmé)' })
  return json(500, { error: error.message ?? 'erreur serveur transitoire' })
}

// Validation serveur DÉFENSIVE (AD-17:400) — dernière ligne : un caller direct ne doit pas écrire un
// rotation_state invalide. `seed` = entier uint32 ; `cursor` = entier ≥ 0 ; `mode` ∈ enum.
function validateUpsert(picked: Record<string, unknown>): string | null {
  if ('seed' in picked) {
    const s = picked.seed
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > UINT32_MAX) {
      return 'seed doit être un entier dans [0, 2^32-1]'
    }
  }
  if ('cursor' in picked) {
    const c = picked.cursor
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0) {
      return 'cursor doit être un entier ≥ 0'
    }
  }
  if ('mode' in picked) {
    if (typeof picked.mode !== 'string' || !MODES.includes(picked.mode as (typeof MODES)[number])) {
      return "mode doit être 'rotation-complete' ou 'jour-le-jour'"
    }
  }
  if ('start_date' in picked) {
    // Date d'ancrage (Story 5.17) : chaîne YMD (anti-UTC), même motif que confirmed_rolls.date.
    if (typeof picked.start_date !== 'string' || !YMD.test(picked.start_date)) {
      return 'start_date doit être une chaîne au format YMD (YYYY-MM-DD)'
    }
  }
  return null
}

export async function POST(request: Request): Promise<Response> {
  // --- Garde passphrase (AD-8) : retour AVANT tout accès Supabase ---
  const expected = process.env.TEAM_PASSPHRASE
  if (!expected) return json(500, { error: 'TEAM_PASSPHRASE non configurée côté serveur' })

  const provided = request.headers.get('x-team-passphrase')
  if (!provided || !safeEqual(provided, expected)) {
    return json(401, { error: 'passphrase invalide' })
  }

  // --- Parsing & validation du contrat (AD-14, AD-17:400) ---
  let body: WriteBody
  try {
    body = (await request.json()) as WriteBody
  } catch {
    return json(400, { error: 'corps JSON illisible' })
  }

  // Op UNIQUE `upsert` (rotation_state = singleton) → tout le reste = 400.
  if (body?.op !== 'upsert') {
    return json(400, { error: "op invalide (attendu: 'upsert')" })
  }

  // --- UPSERT : allowlist appliquée AVANT écriture (AD-14) + validation défensive (AD-17:400) ---
  const picked = pickAllowed(body.data)
  if (Object.keys(picked).length === 0) {
    return json(400, {
      error: 'data vide après allowlist (colonnes autorisées : seed, cursor, mode, start_date)',
    })
  }
  const invalid = validateUpsert(picked)
  if (invalid) return json(400, { error: invalid })

  // id forcé 'singleton' ; updated_at posé SERVEUR à chaque write (le `default now()` SQL ne s'applique
  // qu'à l'INSERT, pas à l'UPDATE d'un upsert → sans ça, la dédup/LWW Realtime serait cassée — AD-15/AD-16).
  const { data: row, error } = await supabaseAdmin
    .from('rotation_state')
    .upsert({ id: 'singleton', ...picked, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return mapDbError(error)
  return json(200, row)
}
