import { supabasePublic } from '@/lib/supabase/client'

// `lib/data/` est le SEUL point de contact Supabase (AD-11) : aucun composant/hook ne fait `.from(...)`.
// Lectures via la clé low-privilege (AD-7) ; les écritures passeront par `app/api/` (Story 1.4).

export type Participant = {
  id: string
  name: string
  active: boolean
  // Timestamps sérialisés en chaîne ISO par PostgREST — JAMAIS typés `Date`,
  // jamais convertis via new Date()/toISOString() (convention dates, AD-Consistency).
  created_at: string
  updated_at: string
}

export async function fetchParticipants(): Promise<Participant[]> {
  const { data, error } = await supabasePublic.from('participants').select('*')
  if (error) throw error
  return data ?? []
}
