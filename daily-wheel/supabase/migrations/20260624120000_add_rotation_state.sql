-- Daily Wheel — table `rotation_state` (Story 5.6, flag archi #2)
-- 7ᵉ table : persistance de la ROTATION en mode « Jour le jour » (FR18). Patron SINGLETON identique à
-- `settings` (id = 'singleton', upsert). On persiste un MÉCANISME REPRODUCTIBLE (graine + curseur),
-- JAMAIS le planning figé : `generateSchedule(input, createRng(seed))` est déterministe (NFR7/AD-2),
-- donc (graine + curseur) suffisent à reprendre la rotation à l'identique au rechargement / depuis un
-- autre poste. Décision tracée : persistance SERVEUR (AD-4 source canonique ; un état local ne franchit
-- pas le navigateur, ce qu'exige l'AC-1). Conventions : snake_case, RLS lecture publique / écriture
-- refusée (AD-9), Realtime + REPLICA IDENTITY FULL (AD-6/AD-15), updated_at serveur (AD-15/AD-16).
-- Refs : ARCHITECTURE-SPINE.md #AD-4, #AD-6, #AD-9, #AD-14, #AD-15 ; epics.md #Story-5.6.

-- =====================================================================
-- 1. TABLE
-- =====================================================================

create table public.rotation_state (
  id         text        primary key default 'singleton',
  -- NULLABLE à dessein : `null` = aucune rotation tirée (le mode peut être persisté seul, avant tout
  -- tirage, sans violer une contrainte). Sinon entier uint32 (0..4294967295) → bigint (int4 trop court).
  -- Sert aussi de marqueur de reprise : on ne recalcule un planning QUE si seed n'est pas null.
  seed       bigint,
  cursor     integer     not null default 0 check (cursor >= 0),  -- = revealedCount (jours révélés)
  mode       text        not null default 'rotation-complete'
               check (mode in ('rotation-complete', 'jour-le-jour')),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 2. RLS — lecture publique (anon), écriture refusée par défaut (AD-9)
--    Aucune policy insert/update/delete => seule la Route Handler serveur
--    (clé secrète, contourne RLS) écrit. La policy SELECT to anon autorise
--    aussi la livraison des events Realtime à la clé low-privilege (AD-6).
-- =====================================================================

alter table public.rotation_state enable row level security;

create policy "public read rotation_state" on public.rotation_state for select to anon using (true);

-- =====================================================================
-- 3. REALTIME — ajout à la publication + REPLICA IDENTITY FULL (AD-6/AD-15)
-- =====================================================================

alter publication supabase_realtime add table public.rotation_state;

alter table public.rotation_state replica identity full;
