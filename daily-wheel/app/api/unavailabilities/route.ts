import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Proxy d'ÉCRITURE pour `unavailabilities` (AD-7, AD-14). SEUL endroit qui importe le client secret
// pour cette table. Contrat : POST { op: 'insert'|'delete', id?, data? } + header x-team-passphrase.
// PAS d'`update` : on ajoute et on supprime unitairement, jamais d'édition (epics.md#Story-2.3).
// La clé secrète contourne RLS (AD-9) ; la garde passphrase (AD-8) est l'unique verrou réel.
export const runtime = 'nodejs'

// Allowlist de colonnes écrivables pour `unavailabilities` (AD-14). id/updated_at = serveur.
const ALLOWED = ['participant_id', 'kind', 'date1', 'date2'] as const

type WriteBody = {
  op?: unknown
  id?: unknown
  data?: Record<string, unknown>
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status })
}

// Comparaison en temps constant (AD-8) : évite une fuite par timing sur la passphrase.
// timingSafeEqual exige des longueurs égales → court-circuit sinon (il jetterait).
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

// Mappe une erreur Supabase/Postgres vers la taxonomie HTTP (AD-17).
function mapDbError(error: { code?: string; message?: string }): Response {
  if (error.code === '23505') return json(409, { error: 'conflit : violation d’unicité' })
  if (error.code === 'PGRST116') return json(409, { error: 'introuvable (état périmé)' })
  return json(500, { error: error.message ?? 'erreur serveur transitoire' })
}

// Validation serveur DÉFENSIVE (AD-17:400) — dernière ligne : un caller direct ne doit pas
// insérer une plage inversée. La validation primaire est cliente/pure (AC1). Normalise `picked`
// in place (day → date2 forcé null). Retourne un message d'erreur, ou null si valide.
function validateInsert(picked: Record<string, unknown>): string | null {
  const kind = picked.kind
  if (kind !== 'day' && kind !== 'range') return "kind invalide (attendu: 'day' | 'range')"
  if (typeof picked.date1 !== 'string' || !picked.date1) return 'date1 requise (chaîne YMD)'
  if (kind === 'range') {
    if (typeof picked.date2 !== 'string' || !picked.date2) return 'date2 requise pour une plage'
    if (picked.date2 < picked.date1) return 'la date de fin doit être ≥ à la date de début'
  } else {
    // day : date2 est positionnée serveur à null (jamais une valeur cliente).
    picked.date2 = null
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

  const op = body?.op
  // PAS d'op `update` pour cette table → tout ce qui n'est ni insert ni delete = 400.
  if (op !== 'insert' && op !== 'delete') {
    return json(400, { error: "op invalide (attendu: 'insert' | 'delete')" })
  }

  const table = supabaseAdmin.from('unavailabilities')

  // --- DELETE : id requis ; 0 ligne touchée = état périmé (AD-17:409) ---
  if (op === 'delete') {
    if (typeof body.id !== 'string' || !body.id) return json(400, { error: 'id requis pour delete' })
    const { data: rows, error } = await table.delete().eq('id', body.id).select('id')
    if (error) return mapDbError(error)
    if (!rows || rows.length === 0) return json(409, { error: 'introuvable (état périmé)' })
    return json(200, { id: body.id })
  }

  // --- INSERT : allowlist appliquée AVANT écriture (AD-14) + validation défensive (AD-17:400) ---
  const picked = pickAllowed(body.data)
  if (Object.keys(picked).length === 0) {
    return json(400, {
      error: 'data vide après allowlist (colonnes autorisées : participant_id, kind, date1, date2)',
    })
  }
  if (typeof picked.participant_id !== 'string' || !picked.participant_id) {
    return json(400, { error: 'participant_id requis' })
  }
  const invalid = validateInsert(picked)
  if (invalid) return json(400, { error: invalid })

  // id/updated_at : générés/positionnés serveur (défauts SQL — AD-15).
  const { data: row, error } = await table.insert(picked).select().single()
  if (error) return mapDbError(error)
  return json(200, row)
}
