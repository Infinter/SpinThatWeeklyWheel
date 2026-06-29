-- Daily Wheel — Story 5.17 (BUG FIX) : ancrage de la date de départ d'une rotation persistée.
-- Le bug : `rotation_state` (Story 5.6) persistait seed + cursor + mode mais PAS la date de départ.
-- Au replay, `buildScheduleInput` résolvait `startDate = settings.start_date ?? todayYMD()` → faute
-- d'ancre, le planning se ré-ancrait sur le JOUR COURANT à chaque rechargement (les jours « glissaient » :
-- un roll tiré vendredi 26/06 réaffichait lundi 29/06 les mêmes personnes décalées d'un jour ouvré).
-- Correctif : persister la date d'ancrage RÉSOLUE au tirage et la rejouer (generateSchedule reste pur).
-- Conventions : `start_date` en text YMD (anti-UTC, comme `confirmed_rolls.date`), NULLABLE (null =
-- aucune ancre → fallback comportement 5.6, dégradation gracieuse). Aucune RLS/Realtime à changer
-- (colonne portée par la ligne singleton déjà publiée). Refs : ARCHITECTURE-SPINE.md ; story 5.6 / 5.17.

-- =====================================================================
-- 1. COLONNE — date d'ancrage du tirage (nullable)
-- =====================================================================

alter table public.rotation_state
  add column if not exists start_date text;

-- =====================================================================
-- 2. BACKFILL — ré-ancrer le roll EN COURS à AUJOURD'HUI (décision Solo 2026-06-29)
--    Le roll déjà tiré (seed non null) n'a pas d'ancre → on fige l'état AFFICHÉ aujourd'hui (1er slot =
--    lundi 29/06) comme ancrage permanent : aucun saut visible, le glissement s'arrête. Date LITTÉRALE
--    (pas `current_date`) → déterministe quel que soit le moment d'application (anti-décalage TZ/minuit).
--    NON retenu : ré-ancrer rétroactivement à vendredi depuis confirmed_rolls.
-- =====================================================================

update public.rotation_state
  set start_date = '2026-06-29'
  where id = 'singleton'
    and seed is not null
    and start_date is null;
