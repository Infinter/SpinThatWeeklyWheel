import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Proxy d'ÉCRITURE pour `settings` (AD-7, AD-14). SEUL endroit qui importe le client secret pour cette
// table. Contrat SINGLETON : POST { op: 'upsert', data } + header x-team-passphrase. Op UNIQUE `upsert`
// (≠ insert/delete des tables-liste) : `id` est TOUJOURS forcé à 'singleton' côté serveur (jamais lu du
// client). La clé secrète contourne RLS (AD-9) ; la garde passphrase (AD-8) est l'unique verrou réel.
export const runtime = 'nodejs'

// Allowlist de colonnes écrivables pour `settings` (AD-14). id (forcé 'singleton') / updated_at = serveur.
const ALLOWED = ['skip_weekends', 'start_date'] as const

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
// settings invalide. La validation primaire est cliente. `start_date: null` est VALIDE (pas de date).
// Retourne un message, ou null.
function validateUpsert(picked: Record<string, unknown>): string | null {
  if ('skip_weekends' in picked && typeof picked.skip_weekends !== 'boolean') {
    return 'skip_weekends doit être un booléen'
  }
  if ('start_date' in picked) {
    const sd = picked.start_date
    if (sd !== null && (typeof sd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sd))) {
      return 'start_date doit être null ou une chaîne YMD'
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

  // Op UNIQUE `upsert` (settings = singleton) → tout le reste = 400.
  if (body?.op !== 'upsert') {
    return json(400, { error: "op invalide (attendu: 'upsert')" })
  }

  // --- UPSERT : allowlist appliquée AVANT écriture (AD-14) + validation défensive (AD-17:400) ---
  const picked = pickAllowed(body.data)
  if (Object.keys(picked).length === 0) {
    return json(400, { error: 'data vide après allowlist (colonnes autorisées : skip_weekends, start_date)' })
  }
  const invalid = validateUpsert(picked)
  if (invalid) return json(400, { error: invalid })

  // id forcé 'singleton' ; updated_at posé SERVEUR à chaque write (le `default now()` SQL ne s'applique
  // qu'à l'INSERT, pas à l'UPDATE d'un upsert → sans ça, la dédup/LWW Realtime serait cassée — AD-15/AD-16).
  const { data: row, error } = await supabaseAdmin
    .from('settings')
    .upsert({ id: 'singleton', ...picked, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  if (error) return mapDbError(error)
  return json(200, row)
}
