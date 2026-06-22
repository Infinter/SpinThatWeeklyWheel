---
baseline_commit: 72c3bbdefa7f6d3d2a5e7908333d096f5bfabfc5
---

# Story 1.2: Provisionner Supabase — schéma, RLS et Realtime

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur,
I want un projet Supabase avec les 6 tables du modèle de données, les politiques RLS et la publication Realtime, le tout versionné en migration SQL,
so that les données puissent être persistées, partagées et gardées en écriture.

## Acceptance Criteria

1. **Migration SQL versionnée appliquée.** Une migration SQL versionnée existe dans `daily-wheel/supabase/migrations/` (nom `<timestamp>_<nom>.sql`) et s'applique sans erreur via la Supabase CLI (`supabase db push`) sur le projet Supabase lié. [Source: epics.md#Story-1.2 ; ARCHITECTURE-SPINE.md#AD-13]
2. **6 tables conformes au modèle.** Les tables `participants`, `unavailabilities`, `group_exclusions`, `holidays`, `team_off_days`, `settings` sont créées **exactement** selon le modèle de données (ERD spine + §4 PRD), `id` uuid `default gen_random_uuid()` **sauf** `settings.id` text constante `'singleton'`, et `updated_at` (`timestamptz`) sur **toute table écrivable** (les 6). [Source: ARCHITECTURE-SPINE.md#Structural-Seed (ERD) ; #AD-15]
3. **Contraintes d'intégrité.** `ON DELETE CASCADE` sur `unavailabilities.participant_id` → `participants.id` ; `holidays.date` porte une contrainte **UNIQUE**. [Source: ARCHITECTURE-SPINE.md#Consistency-Conventions (Suppression) ; ERD ; epics.md#Story-1.2]
4. **RLS : lecture publique, écriture refusée.** RLS est **activé** sur les 6 tables ; **une seule** policy par table : `SELECT` accordé au rôle `anon` (`using (true)`). Aucune policy `INSERT`/`UPDATE`/`DELETE` n'est créée → les écritures via la clé publique sont refusées par défaut. [Source: ARCHITECTURE-SPINE.md#AD-9 ; epics.md#Story-1.2]
5. **Realtime activé.** Les 6 tables sont ajoutées à la publication `supabase_realtime` et chacune passe en `REPLICA IDENTITY FULL`. [Source: ARCHITECTURE-SPINE.md#AD-6 ; epics.md#Story-1.2]
6. **Preuve Realtime par test.** Un test d'intégration prouve qu'un événement Realtime (`postgres_changes`) est **bien reçu** par un client abonné avec la clé low-privilege lors d'une modification de ligne (INSERT déclenché via la clé secrète, qui contourne RLS). Le test est **gardé par variables d'environnement** : il se *skippe* proprement quand les secrets sont absents (CI sans credentials), sans faire échouer la suite. [Source: ARCHITECTURE-SPINE.md#AD-6 ; epics.md#Story-1.2 (dernier AC)]

## Tasks / Subtasks

- [x] **Tâche 1 — Prérequis opérationnels Supabase + CLI** (AC: 1) — env fourni par Solo, **aucun login interactif**
  - [x] Projet Supabase fourni par Solo (credentials dans `daily-wheel/.env.local`, non commité). Auth par chaîne de connexion — pas de `supabase login`.
  - [x] `.env.local` vérifié : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` (4/4 renseignés, sans placeholder).
  - [x] Node v26.3.1 / npm 11.16 / Supabase CLI 2.107.0 (via npx) confirmés.
- [x] **Tâche 2 — Écrire la migration SQL des 6 tables** (AC: 2, 3, 4, 5)
  - [x] `supabase init` (config.toml créé — requis par `db push`) + `supabase migration new init_schema` → `20260622121017_init_schema.sql`.
  - [x] 6 tables conformes à l'ERD : types, defaults, `not null`, CHECK (`kind`, `day_of_week`, `every_n`), `active default true`, FK cascade, `holidays.date unique`.
  - [x] `updated_at ... default now()` sur les 6 ; `participants.created_at ... default now()`.
  - [x] Par table : `enable row level security` + une policy `for select to anon using (true)`. Aucune policy d'écriture.
  - [x] Par table : `alter publication supabase_realtime add table` + `replica identity full`.
  - [x] `.gitkeep` retiré (la migration fige le dossier).
- [x] **Tâche 3 — Outillage de test minimal** (AC: 6)
  - [x] `@supabase/supabase-js@^2.108.2` en dependency ; `vitest@^4.1.9` + `dotenv@^17.4.2` en devDependency.
  - [x] `daily-wheel/vitest.config.ts` (env `node`, `setupFiles`, `testTimeout: 20000`).
  - [x] `daily-wheel/tests/setup.ts` (charge `.env.local` via dotenv).
  - [x] `daily-wheel/.env.example` + correction `.gitignore` (`!.env.example`) — finding différé 1.1 corrigé, vérifié via `git check-ignore`.
  - [x] Script `"test:realtime"` ajouté (npm test global réservé à 1.5).
- [x] **Tâche 4 — Écrire le test d'intégration Realtime (rouge)** (AC: 6)
  - [x] `daily-wheel/tests/realtime.integration.test.ts` : clients supabase-js jetables depuis `process.env` (pas d'import `lib/supabase/`).
  - [x] Client anon s'abonne (`postgres_changes` INSERT sur `participants`), attend `SUBSCRIBED`.
  - [x] Client secret insère (contourne RLS) → callback anon reçoit l'event ; nom de probe unique.
  - [x] Teardown : `removeChannel` + delete de la ligne probe.
  - [x] Garde `describe.skipIf(!ready)`. **Rouge confirmé** avant migration (« Could not find the table 'public.participants' »).
- [x] **Tâche 5 — Appliquer + prouver vert** (AC: 1, 6)
  - [x] Migration appliquée via `db push --db-url` (pooler IPv4). ⚠️ Connexion directe IPv6 KO sur ce réseau → **bascule sur le Session pooler IPv4** ; région détectée par sweep = **`aws-0-eu-west-1`** (le `cf-ray: …-CDG` reflétait ma position, pas la région du projet). Warning pgdelta non bloquant (« failed to cache migrations catalog ») — migration bien appliquée.
  - [x] `npm run test:realtime` → **vert** (event reçu).
- [x] **Tâche 6 — Vérification & documentation**
  - [x] `psql` absent → vérification fonctionnelle faisant autorité via supabase-js : 6 tables lisibles (anon), **écritures anon refusées sur les 6 (`42501`)**, `holidays.date` unique (doublon `23505`), `ON DELETE CASCADE` confirmé. Lint + build verts (non-régression).
  - [x] Dev Agent Record renseigné (File List, Completion Notes, gotchas).

## Dev Notes

### Contexte & périmètre
- 2ᵉ story d'Epic 1 (fondations). Précédente : **Story 1.1 done** (scaffold Next.js dans `daily-wheel/`). Cette story pose **la base de données** : schéma + RLS + Realtime, en **SQL versionné**. Aucune logique applicative, aucun client `lib/supabase/` (→ Story 1.3), aucune Route Handler (→ Story 1.4), aucun store/UI (→ Story 1.5).
- **Ne pas anticiper** : se limiter aux 6 AC. Le seul code TS de cette story est le **test d'intégration Realtime** (et son outillage minimal), volontairement découplé de `lib/`.

### ⚠️ Variance structurelle héritée de la Story 1.1 (CRITIQUE)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Donc : migrations dans `daily-wheel/supabase/migrations/`, toutes les commandes (`supabase`, `npm`) s'exécutent **depuis `daily-wheel/`**, et `supabase link` doit être fait depuis ce dossier. [Source: 1-1-*.md#Project-Structure-Notes]
- État actuel : `daily-wheel/supabase/migrations/.gitkeep` seul ; `@supabase/supabase-js`, `vitest`, `dotenv` **non installés** ; deps épinglées `next@16.2.9`, `react@19.2.4`.

### Tension test ↔ harnais CI (à respecter)
- AD-13 / notes 1.1 : le **harnais Vitest + CI** (tests du domaine) est cadré en **Story 1.5**. Le test de cette story est un **test d'intégration live** (réseau + secrets), **distinct** des tests unitaires de domaine. On introduit donc Vitest **minimalement** ici, on **n'enrôle pas** ce test dans un `npm test` global (script dédié `test:realtime`), et le test est **env-gated/skippable** pour ne pas casser une CI sans credentials. Story 1.5 étendra le harnais et la CI. [Source: ARCHITECTURE-SPINE.md#AD-13 ; 1-1-*.md#Testing-standards]

### DDL de référence (conforme ERD spine + AD-15) — à porter dans la migration
> Source : ARCHITECTURE-SPINE.md#Structural-Seed (ERD) + #Consistency-Conventions. `snake_case` en base. Les CHECK/defaults marqués *(anticipe Epic N)* sécurisent les données pour les stories aval — intentionnels, **pas** du scope creep.

```sql
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,            -- défaut true (anticipe Story 2.1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unavailabilities (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,  -- AC3
  kind text not null check (kind in ('day','range')),   -- (anticipe Story 2.3)
  date1 date not null,
  date2 date,                                      -- nullable (plage)
  updated_at timestamptz not null default now()
);

create table public.group_exclusions (
  id uuid primary key default gen_random_uuid(),
  day_of_week int not null check (day_of_week between 0 and 6),  -- (anticipe Story 3.1)
  every_n int not null check (every_n >= 1),
  ref_date date not null,
  updated_at timestamptz not null default now()
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,                       -- AC3 : unicité
  label text not null,
  updated_at timestamptz not null default now()
);

create table public.team_off_days (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('day','range')),  -- (anticipe Story 3.3)
  date1 date not null,
  date2 date,                                      -- nullable (plage)
  label text,                                      -- nullable
  updated_at timestamptz not null default now()
);

create table public.settings (
  id text primary key default 'singleton',         -- constante littérale, upsert côté app
  skip_weekends boolean not null default true,
  start_date date,                                 -- nullable (défaut = aujourd'hui côté app)
  updated_at timestamptz not null default now()
);
```

RLS + Realtime, **pour chacune des 6 tables** (exemple `participants`, répliquer) :
```sql
alter table public.participants enable row level security;
create policy "public read participants" on public.participants
  for select to anon using (true);
-- AUCUNE policy insert/update/delete → écritures anon refusées (AC4)

alter publication supabase_realtime add table public.participants;  -- AC5
alter table public.participants replica identity full;              -- AC5
```

### Points techniques vérifiés (recherche Supabase, janv. 2026)
- **CLI** : `supabase login` → `supabase link --project-ref <ref>` (prérequis) → `supabase migration new <nom>` (fichier `<timestamp 14 chiffres>_<nom>.sql`) → `supabase db push` (applique les migrations non encore jouées, dans l'ordre du timestamp). [Source: supabase.com/docs/guides/deployment/database-migrations]
- **Publication `supabase_realtime`** : elle **existe déjà par défaut** dans un projet Supabase → utiliser directement `alter publication ... add table`. Ne **pas** faire `create publication supabase_realtime` (erreur « already exists »). Si idempotence souhaitée, garder via `pg_publication`. [Source: supabase.com/docs/guides/realtime/postgres-changes]
- **CRUX RLS ↔ Realtime** : un client **anon** ne reçoit les events `postgres_changes` que si le rôle `anon` a une **policy SELECT** correspondant à la ligne. La policy SELECT de l'AC4 **est exactement** ce qui rend le test de l'AC6 possible — un seul mécanisme sert les deux. Aucune « Realtime Authorization » / canal privé n'est requise pour `postgres_changes` (ça ne concerne que Broadcast/Presence). [Source: supabase.com/docs/guides/realtime/postgres-changes]
- **Caveat DELETE** : les events DELETE ne sont **pas** filtrés par RLS (ligne déjà supprimée). Tester sur **INSERT** (non concerné, plus simple/robuste).
- **Caveat `replica identity full` + RLS** : sur UPDATE/DELETE, le `old` ne contient que la PK. Sans impact sur le test INSERT.
- **API supabase-js 2.108.x** : `supabase.channel('name').on('postgres_changes', { event:'*', schema:'public', table:'participants' }, (payload)=>{...}).subscribe((status, err)=>{...})`. Statuts : `SUBSCRIBED` | `CHANNEL_ERROR` | `TIMED_OUT` | `CLOSED`. Nettoyage : `await supabase.removeChannel(channel)`. [Source: supabase.com/docs/reference/javascript/subscribe]
- **`gen_random_uuid()`** : built-in Postgres (≥13), dispo par défaut sur Supabase, **aucune extension** requise.
- **Grants** : sur Supabase, `anon`/`authenticated` ont des grants de table par défaut ; **RLS est la garde**. Une policy SELECT seule suffit. (Optionnel : `grant select` explicite — belt-and-suspenders ; ne **pas** grant insert/update/delete.)

### Squelette du test d'intégration (référence, à adapter)
```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const secret = process.env.SUPABASE_SECRET_KEY
const ready = Boolean(url && anon && secret)

describe.skipIf(!ready)('Realtime publication (AD-6)', () => {
  it('émet un postgres_changes INSERT reçu par la clé low-privilege', async () => {
    const reader = createClient(url!, anon!)
    const writer = createClient(url!, secret!, { auth: { persistSession: false } })
    const received = new Promise<any>((resolve, reject) => {
      const ch = reader.channel('test-rt')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' },
            (p) => resolve(p))
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? status)
          if (status === 'SUBSCRIBED') {
            writer.from('participants').insert({ name: '__rt_probe__', active: true })
              .then(({ error }) => { if (error) reject(error) })
          }
        })
      // sécuriser via un timeout côté test (ex. vitest timeout 15000)
    })
    const payload = await received
    expect(payload.new.name).toBe('__rt_probe__')
    // teardown : removeChannel + delete de la ligne probe via writer
  })
})
```
> Adapter : timeout Vitest (≥15 s), cleanup `removeChannel` + `delete` de la ligne probe, et idéalement un nom de probe unique pour éviter les collisions.

### Project Structure Notes
- Arborescence touchée (sous `daily-wheel/`) :
  ```
  daily-wheel/
    supabase/migrations/<timestamp>_init_schema.sql   # NEW (cœur de la story)
    tests/realtime.integration.test.ts                # NEW
    tests/setup.ts                                     # NEW (charge .env.local)
    vitest.config.ts                                  # NEW
    .env.example                                       # NEW
    .env.local                                         # NEW (NON commité)
    .gitignore                                         # UPDATE (!.env.example)
    package.json / package-lock.json                   # UPDATE (deps + script test:realtime)
  ```
- Aucune écriture dans `lib/` (réservé 1.3+). `app/` inchangé.
- **Répercussion CI/Vercel** (rappel 1.1) : déploiement Vercel et CI pointeront « Root Directory » sur `daily-wheel/` (cadré en 1.5).

### Testing standards (pour cette story)
- Le seul test = l'**intégration Realtime** (AC6), live, env-gated, lancé par `npm run test:realtime` depuis `daily-wheel/`. Pas de test unitaire de domaine (aucun `lib/domain/` ici). Le harnais domaine + CI arrive en Story 1.5 (AD-13).
- Critère « vert » : migration appliquée sans erreur + test Realtime passe (ou skip documenté si aucun projet Supabase dispo lors du dev — handoff Tâche 1).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 ; #Story-1.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#Structural-Seed (ERD) ; #Consistency-Conventions ; #AD-6 ; #AD-9 ; #AD-10 ; #AD-13 ; #AD-15]
- [Source: _bmad-output/implementation-artifacts/1-1-initialiser-application-nextjs-charte-existante.md#Project-Structure-Notes ; #Testing-standards ; #Review-Findings (finding `.env*` différé)]
- [Source: docs/prd.md §4 (modèle de données)]
- [Source: supabase.com/docs — database-migrations, realtime/postgres-changes, reference/javascript/subscribe, database/postgres/row-level-security]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- Rouge (avant migration) : `npx vitest run` → 1 failed, « Could not find the table 'public.participants' in the schema cache ».
- `supabase db push --db-url` (connexion directe IPv6) → `dial tcp [2a05:...]:5432 no route to host` ; le CLI recommande le pooler IPv4.
- Sweep régions via le pooler (`tenant/user ... not found` = mauvaise région) → région du projet = **`aws-0-eu-west-1`** (Session pooler 5432). `Finished supabase db push` (warning pgdelta « failed to cache migrations catalog » non bloquant).
- Vert (après migration) : `npx vitest run` → 1 passed (event Realtime reçu).
- Vérif schéma (supabase-js) : 6× anon SELECT OK ; 6× anon INSERT refusé `42501` ; `holidays.date` doublon `23505` ; cascade unavailabilities OK.
- `npm run lint` → 0 erreur ; `npm run build` → ✓ (route `/` prérendue).

### Completion Notes List

- Story implémentée intégralement ; les 6 AC satisfaits et **prouvés sur le projet Supabase réel** (migration appliquée, RLS, Realtime).
- **Auth par clé (décision Solo)** : aucun `supabase login`/`link` interactif. Migration appliquée par `supabase db push --db-url "<pooler IPv4>"`.
- **Gotcha réseau (majeur)** : la connexion directe `db.<ref>.supabase.co:5432` est **IPv6-only** et inaccessible sur ce réseau → **utiliser le Session pooler IPv4** `aws-0-eu-west-1.pooler.supabase.com:5432`, user `postgres.<ref>`. ⚠️ `SUPABASE_DB_URL` dans `.env.local` pointe encore sur la connexion directe (laissée telle quelle, fournie par Solo) ; la valeur pooler qui fonctionne a été utilisée à la volée. **À répercuter en Story 1.5** (Vercel/CI) : utiliser le pooler.
- **Gotcha CLI** : `supabase db push` exige `supabase init` (config.toml) au préalable, même avec `--db-url` (pas de `link`).
- **AC5 (Realtime 6 tables)** : la table `participants` est prouvée de bout en bout par le test. Les 5 autres tables sont ajoutées à la publication par le **même** fichier de migration, appliqué atomiquement (toutes les tables/policies existent → le bloc `alter publication` a abouti). `replica identity full` idem (déclaratif, même migration).
- **AC6** : la livraison de l'event à la clé anon **dépend** de la policy `SELECT to anon` (AC4) — un seul mécanisme couvre les deux ACs.
- `.env.local` créé mais **non commité** (ignoré) ; `.env.example` committable (finding `.env*` de 1.1 corrigé).
- Pas touché à `lib/` (réservé 1.3+) ni à `app/`.

### File List

**Nouveaux :**
- `daily-wheel/supabase/migrations/20260622121017_init_schema.sql` (cœur — 6 tables + RLS + Realtime)
- `daily-wheel/supabase/config.toml` (généré par `supabase init`)
- `daily-wheel/supabase/.gitignore` (généré par `supabase init` — ignore `.temp`/`.branches`/`.env*.local`)
- `daily-wheel/vitest.config.ts`
- `daily-wheel/tests/setup.ts`
- `daily-wheel/tests/realtime.integration.test.ts`
- `daily-wheel/.env.example`
- `daily-wheel/.env.local` (**NON commité** — ignoré par git ; contient les secrets fournis par Solo)

**Modifiés :**
- `daily-wheel/package.json` (deps `@supabase/supabase-js`, `vitest`, `dotenv` + script `test:realtime`)
- `daily-wheel/package-lock.json`
- `daily-wheel/.gitignore` (ajout `!.env.example`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 1.2)

**Supprimés :**
- `daily-wheel/supabase/migrations/.gitkeep` (remplacé par la migration)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-22 | 0.2.0 | Implémentation Story 1.2 : migration SQL `init_schema` (6 tables + contraintes + RLS lecture-publique/écriture-refusée + Realtime sur les 6 tables), appliquée au projet Supabase réel via `db push --db-url` (pooler IPv4 eu-west-1). Test d'intégration Realtime (env-gated) vert. Vérif fonctionnelle : RLS écritures refusées (42501), unicité holidays.date, cascade. Outillage Vitest minimal introduit. Lint + build verts. |
