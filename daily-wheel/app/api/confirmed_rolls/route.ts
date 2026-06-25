import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { validateConfirmedRoll } from '@/lib/ui/confirmed-roll'

// Proxy d'ÉCRITURE pour le journal d'audit `confirmed_rolls` (AD-7, AD-14). SEUL endroit qui importe le
// client secret pour cette table. Calqué sur `app/api/rotation_state/route.ts` : POST { op: 'upsert', data }
// + header x-team-passphrase. DIFFÉRENCE : table MULTI-LIGNES, clé composite (seed, date) → onConflict
// 'seed,date' (≠ singleton 'id'). La clé secrète contourne RLS (AD-9) ; la garde passphrase (AD-8) est
// l'unique verrou réel. Story 5.10 : journal PASSIF (qui anime quel jour, snapshot figé à la validation).
export const runtime = 'nodejs'

// Allowlist de colonnes écrivables (AD-14). confirmed_at = serveur (jamais lu du client).
const ALLOWED = ['seed', 'date', 'participant_id', 'name'] as const

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

// Mappe une erreur Supabase/Postgres vers la taxonomie HTTP (AD-17). L'upsert résout le conflit de PK
// composite (seed,date) → pas de 23505 attendu en fonctionnement normal.
function mapDbError(error: { code?: string; message?: string }): Response {
  if (error.code === 'PGRST116') return json(409, { error: 'introuvable (état périmé)' })
  return json(500, { error: error.message ?? 'erreur serveur transitoire' })
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

  // Op UNIQUE `upsert` (idempotence par clé composite) → tout le reste = 400.
  if (body?.op !== 'upsert') {
    return json(400, { error: "op invalide (attendu: 'upsert')" })
  }

  // --- UPSERT : allowlist appliquée AVANT écriture (AD-14) + validation défensive (AD-17:400) ---
  const picked = pickAllowed(body.data)
  if (Object.keys(picked).length === 0) {
    return json(400, {
      error: 'data vide après allowlist (colonnes autorisées : seed, date, participant_id, name)',
    })
  }
  // Une ligne complète est requise (≠ patch partiel du singleton) : seed+date forment la PK, name +
  // participant_id sont NOT NULL. La validation pure (lib/ui/confirmed-roll) refuse tout champ manquant.
  const invalid = validateConfirmedRoll(picked)
  if (invalid) return json(400, { error: invalid })

  // confirmed_at posé SERVEUR à chaque write. onConflict 'seed,date' : re-valider le même slot d'une même
  // génération met à jour la ligne (idempotent) ; un nouveau seed insère une ligne distincte (historique).
  const { data: row, error } = await supabaseAdmin
    .from('confirmed_rolls')
    .upsert({ ...picked, confirmed_at: new Date().toISOString() }, { onConflict: 'seed,date' })
    .select()
    .single()
  if (error) return mapDbError(error)
  return json(200, row)
}
