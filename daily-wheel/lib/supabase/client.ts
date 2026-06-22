import { createClient } from '@supabase/supabase-js'

// Client Supabase de LECTURE (low-privilege), client-direct via la clé publique (AD-7).
// N'utilise QUE des variables NEXT_PUBLIC_* → aucun secret n'atteint le bundle navigateur (AD-10, NFR8).
// Pas d'auth/login dans ce produit (mono-équipe ; garde par passphrase côté écriture uniquement, Story 1.4) :
// `createClient` simple suffit, pas besoin de `@supabase/ssr`.
//
// ⚠️ Cette story (1.3) ne crée QUE le client de lecture. Le client secret/admin (service_role),
// importé uniquement par `app/api/`, est la Story 1.4 — ne rien anticiper ici.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase (lecture) : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis (voir .env.local / .env.example).',
  )
}

// Singleton module-level : sûr côté navigateur ET côté Server Component (n'utilise que des NEXT_PUBLIC_*).
export const supabasePublic = createClient(url, anonKey)
