-- Daily Wheel — schéma initial (Story 1.2)
-- 6 tables + contraintes d'intégrité + RLS (lecture publique, écriture refusée) + Realtime.
-- Conventions : snake_case, dates métier en `date` (YYYY-MM-DD local), updated_at sur toute table écrivable.
-- Refs : ARCHITECTURE-SPINE.md #Structural-Seed (ERD), #AD-6, #AD-9, #AD-15 ; epics.md #Story-1.2.

-- =====================================================================
-- 1. TABLES
-- =====================================================================

create table public.participants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unavailabilities (
  id             uuid        primary key default gen_random_uuid(),
  participant_id uuid        not null references public.participants (id) on delete cascade,
  kind           text        not null check (kind in ('day', 'range')),
  date1          date        not null,
  date2          date,
  updated_at     timestamptz not null default now()
);

create table public.group_exclusions (
  id          uuid        primary key default gen_random_uuid(),
  day_of_week int         not null check (day_of_week between 0 and 6),
  every_n     int         not null check (every_n >= 1),
  ref_date    date        not null,
  updated_at  timestamptz not null default now()
);

create table public.holidays (
  id         uuid        primary key default gen_random_uuid(),
  date       date        not null unique,
  label      text        not null,
  updated_at timestamptz not null default now()
);

create table public.team_off_days (
  id         uuid        primary key default gen_random_uuid(),
  kind       text        not null check (kind in ('day', 'range')),
  date1      date        not null,
  date2      date,
  label      text,
  updated_at timestamptz not null default now()
);

create table public.settings (
  id            text        primary key default 'singleton',
  skip_weekends boolean     not null default true,
  start_date    date,
  updated_at    timestamptz not null default now()
);

-- =====================================================================
-- 2. RLS — lecture publique (anon), écriture refusée par défaut (AD-9)
--    Aucune policy insert/update/delete => seules les Route Handlers
--    serveur (clé secrète, contourne RLS) écrivent (Story 1.4).
--    La policy SELECT to anon est aussi ce qui autorise la livraison
--    des events Realtime postgres_changes à la clé low-privilege (AD-6).
-- =====================================================================

alter table public.participants     enable row level security;
alter table public.unavailabilities enable row level security;
alter table public.group_exclusions enable row level security;
alter table public.holidays         enable row level security;
alter table public.team_off_days    enable row level security;
alter table public.settings         enable row level security;

create policy "public read participants"     on public.participants     for select to anon using (true);
create policy "public read unavailabilities" on public.unavailabilities for select to anon using (true);
create policy "public read group_exclusions" on public.group_exclusions for select to anon using (true);
create policy "public read holidays"         on public.holidays         for select to anon using (true);
create policy "public read team_off_days"    on public.team_off_days    for select to anon using (true);
create policy "public read settings"         on public.settings         for select to anon using (true);

-- =====================================================================
-- 3. REALTIME — ajout des 6 tables à la publication + REPLICA IDENTITY FULL (AD-6)
--    La publication `supabase_realtime` existe déjà par défaut sur Supabase.
-- =====================================================================

alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.unavailabilities;
alter publication supabase_realtime add table public.group_exclusions;
alter publication supabase_realtime add table public.holidays;
alter publication supabase_realtime add table public.team_off_days;
alter publication supabase_realtime add table public.settings;

alter table public.participants     replica identity full;
alter table public.unavailabilities replica identity full;
alter table public.group_exclusions replica identity full;
alter table public.holidays         replica identity full;
alter table public.team_off_days    replica identity full;
alter table public.settings         replica identity full;
