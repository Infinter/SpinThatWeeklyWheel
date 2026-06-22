import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js'

// Test d'intégration LIVE (Story 1.2, AC6) : prouve qu'un event Realtime postgres_changes
// est reçu par un client abonné avec la clé low-privilege (anon) lorsqu'une ligne est modifiée.
// L'INSERT est déclenché via la clé secrète (contourne RLS, car anon n'a aucun droit d'écriture).
//
// Gardé par variables d'environnement : se skippe proprement si les secrets sont absents
// (ex. CI sans credentials) — la suite ne casse pas. Lancé via `npm run test:realtime`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY
const ready = Boolean(url && anonKey && secretKey)

// Clients jetables créés directement depuis process.env (PAS via lib/supabase/ — périmètre Story 1.3).
let writer: SupabaseClient | undefined
let probeId: string | undefined
let channel: RealtimeChannel | undefined

afterAll(async () => {
  if (channel && writer) await writer.removeChannel(channel)
  if (writer && probeId) await writer.from('participants').delete().eq('id', probeId)
})

describe.skipIf(!ready)('Realtime — publication supabase_realtime (AD-6)', () => {
  it("reçoit un event INSERT sur participants via la clé low-privilege", async () => {
    const reader = createClient(url!, anonKey!)
    writer = createClient(url!, secretKey!, { auth: { persistSession: false } })

    const probeName = `__rt_probe__${Date.now()}_${Math.floor(Math.random() * 1e6)}`

    // 1) Abonnement (clé anon) — la promesse se résout quand l'event INSERT arrive.
    const eventReceived = new Promise<{ name: string; id: string }>((resolve, reject) => {
      channel = reader
        .channel(`rt-test-${probeName}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'participants' },
          (payload) => {
            const row = payload.new as { name?: string; id?: string }
            if (row?.name === probeName) resolve({ name: row.name, id: row.id! })
          },
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Abonnement Realtime échoué: ${status} ${err ?? ''}`))
          }
          if (status === 'SUBSCRIBED') {
            // 2) Une fois abonné, on déclenche l'écriture via la clé secrète (contourne RLS).
            writer!
              .from('participants')
              .insert({ name: probeName, active: true })
              .select('id')
              .single()
              .then(({ data, error }) => {
                if (error) reject(error)
                else probeId = data?.id
              })
          }
        })
    })

    // 3) L'event doit arriver (testTimeout vitest = 20s couvre l'attente).
    const received = await eventReceived
    expect(received.name).toBe(probeName)
    expect(received.id).toBeTruthy()
  })
})
