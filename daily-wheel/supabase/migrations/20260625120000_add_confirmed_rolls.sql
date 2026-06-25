-- Daily Wheel — table `confirmed_rolls` (Story 5.10)
-- 8ᵉ table : JOURNAL D'AUDIT des rolls validés. À la VALIDATION d'un slot (révélation), on enregistre le
-- roll (qui anime quel jour) au moment où il a été acté. Contrairement à `rotation_state` (singleton,
-- mécanisme reproductible), ce journal est :
--   • MULTI-LIGNES, clé composite (seed, date) : re-révéler le même slot dans la MÊME génération est
--     idempotent (upsert) ; un re-roll (nouveau seed) crée de NOUVELLES lignes → l'historique des
--     décisions successives est préservé (décision Solo 2026-06-25, clé (seed,date)).
--   • PASSIF : il n'influence NI l'affichage NI le re-roll. Le planning reste recalculé depuis le seed
--     (5.6 AC-2, jamais figé) ; ce journal n'est qu'une archive (aucune lecture côté UI dans cette story).
--   • WRITE-ONLY côté client : AUCUN abonnement Realtime, AUCUN reducer/slice (≠ rotation_state).
-- `name` + `participant_id` sont des SNAPSHOTS dénormalisés (anti-drift) : AUCUNE foreign key vers
-- `participants` → renommer/supprimer un participant ne modifie NI n'efface la ligne historisée.
-- Conventions : snake_case, RLS lecture publique / écriture refusée (AD-9), updated/confirmed serveur.
-- Refs : ARCHITECTURE-SPINE.md #AD-7, #AD-8, #AD-9, #AD-14 ; échange Solo 2026-06-25.

-- =====================================================================
-- 1. TABLE
-- =====================================================================

create table public.confirmed_rolls (
  -- Graine de la rotation entière (uint32, 0..4294967295 → bigint, int4 trop court). Partagée par toutes
  -- les lignes d'une même génération ; composante de la clé qui distingue les re-rolls.
  seed           bigint      not null,
  -- Jour du standup au format YMD. `text` À DESSEIN (pas type `date`) : évite toute conversion UTC, cohérent
  -- avec ScheduleRow.date et lib/format/date-fr.ts (parsing LOCAL).
  date           text        not null,
  -- SNAPSHOTS dénormalisés (anti-drift) : figés à l'écriture, sans FK → survivent à la suppression du participant.
  participant_id text        not null,
  name           text        not null,
  confirmed_at   timestamptz not null default now(),
  -- Clé composite : 1 ligne par (rotation, jour). Idempotence intra-génération + append inter-re-rolls.
  primary key (seed, date)
);

-- =====================================================================
-- 2. RLS — lecture publique (anon), écriture refusée par défaut (AD-9)
--    Aucune policy insert/update/delete => seule la Route Handler serveur
--    (clé secrète, contourne RLS) écrit, gardée par la passphrase (AD-8).
-- =====================================================================

alter table public.confirmed_rolls enable row level security;

create policy "public read confirmed_rolls" on public.confirmed_rolls for select to anon using (true);

-- =====================================================================
-- 3. (PAS de Realtime) — journal write-only, aucun abonnement client.
--    Volontairement ABSENT : pas d'ajout à supabase_realtime, pas de
--    replica identity full (≠ rotation_state). Rien ne lit ce journal en live.
-- =====================================================================
