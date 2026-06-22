import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Client Supabase SECRET (server-only). Écrit via la clé secrète, qui CONTOURNE RLS (AD-9) :
// c'est ce qui autorise les INSERT/UPDATE/DELETE alors qu'aucune policy d'écriture n'existe.
//
// Garde AD-10/NFR8 : `import 'server-only'` (ci-dessus) fait ÉCHOUER LE BUILD si ce module
// est importé dans un graphe client. Il ne doit être importé QUE par `app/api/` (Route Handlers).
// La clé secrète n'est JAMAIS préfixée NEXT_PUBLIC_ → jamais livrée au navigateur.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  throw new Error(
    'Supabase (écriture) : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis (voir .env.local / .env.example).',
  )
}

// Pas de session serveur (stateless) : on désactive persistSession/autoRefreshToken.
export const supabaseAdmin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
