import { timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { isValidEveryN, refDateMatchesDayOfWeek } from '@/lib/domain/team-availability'

// Proxy d'ÉCRITURE pour `group_exclusions` (AD-7, AD-14). SEUL endroit qui importe le client secret
// pour cette table. Contrat : POST { op: 'insert'|'delete', id?, data? } + header x-team-passphrase.
// PAS d'`update` : on ajoute et on supprime des règles unitairement (epics.md#Story-3.1).
// La clé secrète contourne RLS (AD-9) ; la garde passphrase (AD-8) est l'unique verrou réel.
export const runtime = 'nodejs'

// Allowlist de colonnes écrivables pour `group_exclusions` (AD-14). id/updated_at = serveur.
const ALLOWED = ['day_of_week', 'every_n', 'ref_date'] as const

type WriteBody = {
  op?: unknown
  id?: unknown
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

// Mappe une erreur Supabase/Postgres vers la taxonomie HTTP (AD-17).
function mapDbError(error: { code?: string; message?: string }): Response {
  if (error.code === '23505') return json(409, { error: 'conflit : violation d’unicité' })
  if (error.code === 'PGRST116') return json(409, { error: 'introuvable (état périmé)' })
  return json(500, { error: error.message ?? 'erreur serveur transitoire' })
}

// Validation serveur DÉFENSIVE (AD-17:400) — dernière ligne : un caller direct ne doit pas insérer
// une règle invalide. La validation primaire est cliente/pure (AC1). Retourne un message, ou null.
function validateInsert(picked: Record<string, unknown>): string | null {
  const dow = picked.day_of_week
  if (typeof dow !== 'number' || !Number.isInteger(dow) || dow < 0 || dow > 6) {
    return 'day_of_week invalide (entier attendu : 0-6)'
  }
  const everyN = picked.every_n
  if (typeof everyN !== 'number' || !isValidEveryN(everyN)) {
    return 'every_n invalide (entier ≥ 1 attendu)'
  }
  const refDate = picked.ref_date
  if (typeof refDate !== 'string' || !refDate) {
    return 'ref_date requise (chaîne YMD)'
  }
  if (!refDateMatchesDayOfWeek(refDate, dow)) {
    return 'la date de référence doit tomber sur le jour de semaine choisi'
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

  const table = supabaseAdmin.from('group_exclusions')

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
      error: 'data vide après allowlist (colonnes autorisées : day_of_week, every_n, ref_date)',
    })
  }
  const invalid = validateInsert(picked)
  if (invalid) return json(400, { error: invalid })

  // id/updated_at : générés/positionnés serveur (défauts SQL — AD-15).
  const { data: row, error } = await table.insert(picked).select().single()
  if (error) return mapDbError(error)
  return json(200, row)
}
