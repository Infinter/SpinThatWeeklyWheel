---
baseline_commit: b9608690015089eb17bbd776e7b25cc3aef829ee
---

# Story 1.4: Proxy d'écriture serveur gardé par passphrase

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur,
I want une Route Handler serveur d'écriture pour la table `participants`, gardée par la passphrase d'équipe et écrivant via la clé secrète, avec sa taxonomie d'erreurs et son entrée `lib/data/`,
so that les écritures soient réellement verrouillées et le **contrat d'écriture** (AD-14) soit établi une fois pour toutes les tables suivantes (Epics 2-4).

## Acceptance Criteria

1. **Client secret server-only `lib/supabase/admin.ts`.** Un module `daily-wheel/lib/supabase/admin.ts` initialise **un seul** client `@supabase/supabase-js` à partir de `process.env.NEXT_PUBLIC_SUPABASE_URL` et `process.env.SUPABASE_SECRET_KEY`, avec `{ auth: { persistSession: false, autoRefreshToken: false } }`. Il importe `server-only` en première ligne et lève une erreur explicite si l'une des deux variables est absente. La clé secrète **n'est jamais** préfixée `NEXT_PUBLIC_` ni atteignable depuis le navigateur. Preuve falsifiable : après `npm run build`, un grep des chunks client (`.next/static/`) sur la valeur de `SUPABASE_SECRET_KEY`, sur le nom `SUPABASE_SECRET_KEY` et sur `service_role` ne renvoie **aucune** occurrence. [Source: ARCHITECTURE-SPINE.md#AD-10 ; #AD-7 ; epics.md#Story-1.4 ; PRD NFR8]

2. **Route Handler unique `app/api/participants/route.ts` (POST, runtime Node).** Une Route Handler expose `export async function POST(request: Request)` avec `export const runtime = 'nodejs'`. Elle accepte le corps JSON **unique** `{ op: 'insert' | 'update' | 'delete', id?, data? }` et lit la passphrase dans le header `x-team-passphrase` (AD-14). C'est le **seul** endroit qui importe `admin.ts`. [Source: ARCHITECTURE-SPINE.md#AD-14 ; #AD-7 ; #Structural-Seed ; epics.md#Story-1.4]

3. **Garde passphrase côté serveur (AD-8).** La passphrase reçue est comparée en **temps constant** (`node:crypto` `timingSafeEqual`) à `process.env.TEAM_PASSPHRASE`. Une passphrase **absente ou erronée** renvoie `401` et **aucune écriture n'est effectuée** (retour avant tout appel Supabase). La passphrase est une variable d'env **serveur uniquement** (jamais `NEXT_PUBLIC_`). [Source: ARCHITECTURE-SPINE.md#AD-8 ; #AD-10 ; #AD-17 ; epics.md#Story-1.4]

4. **Sémantique d'écriture + allowlist de colonnes (AD-14).** Sur passphrase valide, le serveur écrit via la clé secrète :
   - `insert` : crée une ligne ; `update` : **patch partiel** ciblé par `id` ; `delete` : supprime par `id`.
   - Une **allowlist** `{ name, active }` est appliquée à `data` **avant** écriture (toute clé hors allowlist est ignorée). Si après filtrage `data` est vide pour un `insert`/`update`, renvoyer `400`.
   - `id` est requis pour `update` et `delete` (sinon `400`) ; `id` envoyé sur un `insert` est ignoré (l'id est généré côté serveur, AD-15). [Source: ARCHITECTURE-SPINE.md#AD-14 ; #AD-15 ; epics.md#Story-1.4]

5. **`updated_at` serveur + retour de la ligne écrite (AD-15).** Chaque write positionne `updated_at` **côté serveur** : `insert` s'appuie sur le `default now()` de la colonne ; `update` fixe explicitement `updated_at = new Date().toISOString()` dans le patch (le default ne s'applique qu'à l'insert). Les réponses `insert`/`update` renvoient la **ligne écrite** (`.select().single()`) pour la future réconciliation optimiste (AD-5, hors-scope ici) ; `delete` renvoie `{ id }`. [Source: ARCHITECTURE-SPINE.md#AD-15 ; #AD-5 ; epics.md#Story-1.4]

6. **Taxonomie d'erreurs typée (AD-17).** La Route Handler mappe les issues vers des classes HTTP : `401` passphrase invalide → pas de retry, pas de rollback silencieux ; `400` validation (op inconnue, `data` vide, `id` manquant, JSON illisible) → rollback ; `409` conflit (ex. `unique_violation` Postgres `23505`, ou `update`/`delete` touchant **0 ligne** → état périmé, re-hydrater) ; `5xx` erreur Supabase transitoire. [Source: ARCHITECTURE-SPINE.md#AD-17 ; #AD-16 ; epics.md#Story-1.4]

7. **`lib/data/` route les écritures (AD-7, AD-11).** `daily-wheel/lib/data/participants.ts` est étendu d'une fonction d'écriture (ex. `writeParticipant(op, payload, passphrase)`) qui `POST` vers `/api/participants` avec le header `x-team-passphrase`, et **jamais** d'écriture client-direct vers Supabase. Le mapping `status HTTP → WriteError` typé (classe d'erreur `auth | validation | conflict | transient`) est extrait en **fonction pure** réutilisable et **testée unitairement** sans réseau. [Source: ARCHITECTURE-SPINE.md#AD-7 ; #AD-11 ; #AD-17 ; epics.md#Story-1.4]

8. **Preuves de test (rouge → vert).**
   - **(a) Intégration Route Handler (live, env-gated)** : importe `POST` et l'appelle avec des `Request` fabriqués. Round-trip `insert → update → delete` sur le projet réel : prouve que `updated_at` **change** entre insert et update, que l'allowlist filtre une colonne interdite, et que la ligne est bien supprimée à la fin (DB laissée propre).
   - **(b) Garde passphrase** : `POST` sans header / avec mauvaise passphrase → `401` **et** une lecture `fetchParticipants()` confirme qu'aucune ligne fantôme n'a été créée.
   - **(c) Unitaire pur** : le mapping `status → WriteError` (AC7) couvre 401/400/409/5xx, sans réseau ni env.
   Lancé par un script dédié `test:write` ; **non** enrôlé dans un `npm test` global (réservé Story 1.5, AD-13). [Source: ARCHITECTURE-SPINE.md#AD-13 ; 1-3-*.md#Testing-standards]

## Tasks / Subtasks

- [x] **Tâche 1 — Dépendance `server-only` + variable d'env passphrase** (AC: 1, 3)
  - [x] `cd daily-wheel && npm install server-only` (dep de prod, garde de build Next contre l'import côté client). Vérifier que `package-lock.json` est mis à jour.
  - [x] Ajouter `TEAM_PASSPHRASE=<passphrase d'équipe>` à la section **SERVEUR uniquement** de `daily-wheel/.env.example` (valeur factice) ; renseigner la vraie valeur dans `.env.local` (non commité) pour pouvoir exécuter les tests live.
  - [x] **Interdit** : préfixer la passphrase ou la clé secrète par `NEXT_PUBLIC_`.

- [x] **Tâche 2 — Client secret server-only `lib/supabase/admin.ts`** (AC: 1)
  - [x] Créer `daily-wheel/lib/supabase/admin.ts` : `import 'server-only'` en **première ligne**, puis lire `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`, lever une erreur explicite si manquantes, puis `createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })`.
  - [x] Exporter un **singleton** module-level (ex. `export const supabaseAdmin`). Ne **jamais** importer ce module depuis `app/`, `components/`, `lib/store/`, `lib/data/` (chemin de lecture) — uniquement depuis `app/api/`.

- [x] **Tâche 3 — Route Handler `app/api/participants/route.ts`** (AC: 2, 3, 4, 5, 6)
  - [x] Créer `daily-wheel/app/api/participants/route.ts` : `export const runtime = 'nodejs'` + `export async function POST(request: Request)`.
  - [x] **Garde passphrase (AC3)** : lire `request.headers.get('x-team-passphrase')` ; comparer en temps constant à `process.env.TEAM_PASSPHRASE` via un helper `safeEqual(a, b)` (`node:crypto` `timingSafeEqual`, court-circuit si longueurs différentes). Mismatch/absence → `401` **avant** tout accès Supabase.
  - [x] **Parsing/validation (AC4, AC6)** : `await request.json()` dans un `try/catch` (JSON illisible → `400`) ; valider `op ∈ {insert,update,delete}` (sinon `400`) ; `id` requis pour update/delete (sinon `400`).
  - [x] **Allowlist (AC4)** : `const ALLOWED = ['name', 'active'] as const` ; ne retenir de `data` que ces clés ; `data` filtrée vide pour insert/update → `400`.
  - [x] **Écritures (AC4, AC5)** via `supabaseAdmin.from('participants')` :
    - `insert` → `.insert(picked).select().single()` (id + created_at + updated_at par défaut serveur).
    - `update` → `.update({ ...picked, updated_at: new Date().toISOString() }).eq('id', id).select().single()`.
    - `delete` → `.delete().eq('id', id).select('id')`.
  - [x] **Mapping erreurs (AC6)** : `unique_violation` (`error.code === '23505'`) → `409` ; `update`/`delete` renvoyant 0 ligne (`PGRST116`/tableau vide) → `409` (état périmé) ; autre erreur Supabase → `5xx`. Succès → `200` avec la ligne (`{ id }` pour delete). Utiliser `Response.json(body, { status })`.

- [x] **Tâche 4 — Repository d'écriture `lib/data/participants.ts` + WriteError** (AC: 7)
  - [x] Étendre `daily-wheel/lib/data/participants.ts` (ne pas casser `fetchParticipants`/`type Participant`) :
    - Type `WriteError` (champ `kind: 'auth' | 'validation' | 'conflict' | 'transient'`, `status`, `message`).
    - **Fonction pure exportée** `writeErrorFromStatus(status: number): WriteError['kind']` : `401→auth`, `400→validation`, `409→conflict`, `>=500→transient` (et `else→transient` par défaut prudent).
    - `export async function writeParticipant(op, payload, passphrase)` : `fetch('/api/participants', { method: 'POST', headers: { 'content-type': 'application/json', 'x-team-passphrase': passphrase }, body: JSON.stringify({ op, ...payload }) })` ; si `!res.ok` → `throw` un `WriteError` construit via `writeErrorFromStatus` ; sinon `return res.json()`.
  - [x] **Aucune** écriture client-direct vers Supabase (`supabasePublic`/`supabaseAdmin`) dans `lib/data/` ni ailleurs côté client — uniquement le `fetch` vers `/api/participants` (AD-7).

- [x] **Tâche 5 — Tests rouge → vert** (AC: 8)
  - [x] **(c) Unitaire pur** `daily-wheel/tests/write-error.unit.test.ts` : assertions sur `writeErrorFromStatus(401|400|409|503)` → kinds attendus. Tourne **sans** env (rouge d'abord : fonction absente).
  - [x] **(a)+(b) Intégration** `daily-wheel/tests/write.integration.test.ts` : `const ready = Boolean(url && anon && secret && passphrase)` ; `describe.skipIf(!ready)`. Importer `{ POST }` depuis `@/app/api/participants/route`.
    - 401 : `POST(req sans header)` et `POST(req mauvaise passphrase)` → `res.status === 401` ; puis `fetchParticipants()` ne contient pas la ligne de test.
    - Round-trip : `insert {name:'__test_1.4__', active:true, foo:'x'}` → 200, `foo` absent (allowlist), capter `id` + `updated_at`(t0). `update {active:false}` → 200, `updated_at` ≠ t0, `active===false`. `delete {id}` → 200. Vérifier suppression effective.
  - [x] Confirmer **rouge** avant câblage (modules/exports absents) puis **vert**.
  - [x] Ajouter scripts `package.json` : `"test:write": "vitest run tests/write.integration.test.ts"` et `"test:unit": "vitest run tests/write-error.unit.test.ts"` (ou regrouper) ; **ne pas** créer de `npm test` global (Story 1.5).

- [x] **Tâche 6 — Preuve « aucun secret côté client » + non-régression** (AC: 1)
  - [x] `npm run build` (depuis `daily-wheel/`), puis grep `.next/static` : valeur de `SUPABASE_SECRET_KEY` → 0, nom `SUPABASE_SECRET_KEY` → 0, `service_role` → 0, valeur de `TEAM_PASSPHRASE` → 0. Consigner dans Debug Log.
  - [x] `npm run lint` (0 erreur) + `npm run build` verts ; relancer `npm run test:read` / `npm run test:realtime` pour confirmer la non-régression (lancer les tests live **séparément** — contention parallèle connue, voir Dev Notes).
  - [x] Renseigner Dev Agent Record (File List, Completion Notes, gotchas) + Change Log.

## Dev Notes

### Contexte & périmètre
- **4ᵉ et avant-dernière story d'Epic 1.** Précédentes : **1.1 done** (scaffold Next.js dans `daily-wheel/`), **1.2 review** (migration SQL : 6 tables + RLS + Realtime, appliquée au projet réel), **1.3 review** (client low-privilege + `lib/data/` lecture). Cette story pose le **chemin d'écriture** : client secret + Route Handler gardée + entrée `lib/data/` + taxonomie d'erreurs. [Source: epics.md#Story-1.4 ; 1-3-*.md]
- **Strictement borné aux 8 AC.** Hors-scope explicite (ne **rien** anticiper) :
  - Store, hooks, **affichage optimiste + réconciliation**, abonnement **Realtime** → **Story 1.5**.
  - **UI** (formulaire d'ajout, saisie de la passphrase, prompt 401) → **Story 1.5 / Epic 2**.
  - **CI**, `npm test` global, **déploiement Vercel**, headers de sécurité `next.config.ts` → **Story 1.5**.
  - Route Handlers des **autres tables** (`unavailabilities`, `holidays`, …) → Epics 2-4. Cette story établit **le patron** ; ne pas le dupliquer en avance.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1/1.2/1.3)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tous les chemins ci-dessous sont **sous `daily-wheel/`** ; toutes les commandes (`npm`, grep `.next/`) s'exécutent **depuis `daily-wheel/`**. [Source: 1-3-*.md#Variance-structurelle]
- État actuel pertinent (sous `daily-wheel/`) :
  - `lib/supabase/client.ts` (low-privilege, **ne pas modifier**) ; `lib/data/participants.ts` (lecture `fetchParticipants` + `type Participant`, **à étendre**, ne pas casser).
  - `lib/domain/` et `lib/store/` = `.gitkeep` (hors-scope).
  - `app/` = layout + page + globals (pas encore de `app/api/`).
  - `@supabase/supabase-js@^2.108.2`, `vitest@^4.1.9`, `dotenv@^17.4.2` **déjà installés** ; `vitest.config.ts` (alias `@` → racine via `fileURLToPath`) + `tests/setup.ts` (charge `.env.local`) **en place**.
  - `.env.local` (non commité) contient déjà `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`. **Manque `TEAM_PASSPHRASE`** → l'ajouter (Tâche 1).
  [Source: inspection repo ; 1-3-*.md#File-List]

### Décisions d'architecture qui cadrent cette story
- **AD-7 (chemins asymétriques)** : les **écritures** ne partent **jamais** client-direct ; elles passent par `POST app/api/<table>` qui valide la passphrase puis écrit via la clé secrète. Les lectures (1.3) restent client-direct low-privilege — **ne pas y toucher**.
- **AD-8 (passphrase qui verrouille vraiment)** : garde **côté serveur** dans la Route Handler. Une garde UI seule serait contournable via l'endpoint. Header `x-team-passphrase`.
- **AD-9 (RLS)** : la clé **secrète contourne RLS** (c'est voulu) ; la clé publique n'a aucune policy insert/update/delete → une écriture `anon` échouerait de toute façon. La migration 1.2 est déjà en place, **aucune migration SQL n'est requise** ici.
- **AD-10 (secrets server-only)** : `SUPABASE_SECRET_KEY` + `TEAM_PASSPHRASE` = env **serveur uniquement**. Garde **double** : (1) `import 'server-only'` dans `admin.ts` (échec build si importé côté client), (2) grep `.next/static` (preuve falsifiable, pattern hérité de 1.3 AC3).
- **AD-14 (contrat d'écriture)** : **une** Route Handler par table, **enveloppe unique** `{ op, id?, data? }`, `update` = patch partiel, **allowlist** de colonnes côté serveur. Ce contrat, posé ici pour `participants`, sera **répliqué tel quel** aux autres tables (Epics 2-4) — le soigner.
- **AD-15 (ids serveur + `updated_at`)** : ids uuid générés serveur (`gen_random_uuid()` défaut) ; `updated_at` posé serveur **à chaque** write. ⚠️ Le `default now()` de la colonne ne se déclenche **qu'à l'insert** → pour `update`, écrire `updated_at` **explicitement** dans le patch, sinon il ne bouge pas et la dédup/LWW (1.5) casserait.
- **AD-17 (taxonomie d'erreurs)** : 401 auth / 400 validation / 409 conflit / 5xx transitoire. Posée des deux côtés : statut HTTP côté serveur, mapping `WriteError` côté `lib/data/`. La **consommation** (re-prompt, rollback, retry) est en 1.5 — ici on ne fait qu'**exposer** les classes correctement.
- **Convention dates** : table `participants` n'a **pas** de colonne `date` métier ; seuls des `timestamptz` (`created_at`/`updated_at`) → typés `string`, `new Date().toISOString()` est acceptable **pour `updated_at`** (timestamp, pas une date métier YMD). La règle « jamais UTC » vise les dates **métier** `YYYY-MM-DD` (unavailabilities, holidays… — Epics 2-3), pas les timestamps techniques.

### Schéma `participants` (rappel migration 1.2 — source de l'allowlist)
```sql
create table public.participants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
→ **Allowlist d'écriture = `{ name, active }`** uniquement. `id`/`created_at`/`updated_at` sont gérés serveur (jamais dans l'allowlist). [Source: daily-wheel/supabase/migrations/20260622121017_init_schema.sql]

### Points techniques (recherche Next.js 16 / Supabase, janv. 2026)
- **Route Handler Next 16 (App Router)** : `app/api/participants/route.ts` exporte des fonctions nommées par méthode HTTP (`export async function POST(request: Request)`). Signature **Web standard** : `request.headers.get(...)`, `await request.json()`, retour `Response.json(body, { status })` (pas besoin d'importer `NextResponse`). Les POST ne sont jamais mis en cache. Forcer `export const runtime = 'nodejs'` (le SDK Supabase + clé secrète ne doivent pas tourner en edge). [Source: nextjs.org/docs — app/building-your-application/routing/route-handlers]
- **`server-only`** : paquet officiel de l'écosystème Next ; `import 'server-only'` fait **échouer le build** si le module est importé dans un graphe client. Garde idiomatique pour `admin.ts` (complète, ne remplace pas, le grep). [Source: nextjs.org/docs — getting-started/server-and-client-components (poisoning)]
- **Client secret Supabase** : `createClient(url, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`. La clé secrète/`service_role` **contourne RLS** → les writes passent malgré l'absence de policy insert/update/delete (AD-9). Pas de session (server stateless). [Source: supabase.com/docs — reference/javascript/initializing ; guides/api/api-keys]
- **Codes d'erreur PostgREST/Postgres** utiles au mapping AC6 : violation d'unicité Postgres = `code '23505'` (→ 409, ex. futur `holidays.date`). Un `.update()/.delete()` qui ne matche aucune ligne avec `.select().single()` renvoie l'erreur PostgREST `PGRST116` (0 rows) → traiter en **409** (état périmé, re-hydrater en 1.5). [Source: postgrest.org/en/stable/references/errors.html ; postgresql.org/docs/current/errcodes-appendix.html]
- **Comparaison temps constant** : `import { timingSafeEqual } from 'node:crypto'` ; `timingSafeEqual` **exige des Buffers de même longueur** → court-circuiter (`return false`) si longueurs différentes avant l'appel, sinon il jette. Convertir via `Buffer.from(str)`.

### Tester une Route Handler sans serveur Next
- Une Route Handler est une **fonction pure de `Request → Response`**. Le test l'**importe** (`import { POST } from '@/app/api/participants/route'`) et l'appelle avec un `new Request('http://localhost/api/participants', { method:'POST', headers, body })`. Pas besoin de `next dev` ni de port. L'appel `admin.ts` à l'intérieur tape le **vrai** Supabase (live, env-gated) — même philosophie que les tests d'intégration 1.2/1.3.
- Le chemin **401** retourne **avant** tout accès Supabase → la sous-partie « header absent » pourrait tourner sans secret, mais on garde tout le fichier sous `skipIf(!ready)` pour rester simple ; le **mapping** d'erreurs est couvert séparément par le test **unitaire pur** (sans réseau), qui est le vrai filet AD-17.
- ⚠️ `import 'server-only'` dans `admin.ts` : sous Vitest (environnement `node`, non-client), l'import est **inerte** (il ne jette qu'en graphe **client**). Le test d'intégration qui importe `route.ts` → `admin.ts` fonctionne donc normalement. [Vérifié : `server-only` n'exporte rien et ne jette qu'au build client.]

### Previous Story Intelligence (1.3 / 1.2)
- **Pattern test env-gated** : `const ready = Boolean(...vars)` + `describe.skipIf(!ready)` ; secrets lus de `process.env` (chargés par `tests/setup.ts`). Script **dédié**, hors `npm test` global. Reproduire pour `test:write`. [Source: 1-3-*.md#Testing-standards]
- **Gotcha contention parallèle (1.3)** : les tests d'intégration **live** entrent en contention en exécution **parallèle** (plusieurs connexions Supabase → timeouts). Lancer chaque test live via son script dédié ; le cadrage du harnais global (`--no-file-parallelism` ou isolation domaine/live) est **Story 1.5**. Ne pas créer de `npm test` global ici. [Source: 1-3-*.md#Completion-Notes ; #gotcha-1.5]
- **Alias `@` Vitest** déjà configuré (`vitest.config.ts`) → l'import `@/app/api/participants/route` et `@/lib/data/participants` fonctionne. Ne pas retoucher la config. [Source: 1-3-*.md#File-List]
- **Findings différés ouverts** (ne pas régresser, ne pas corriger ici sauf si touché) : script `"lint": "eslint"` sans cible ; reset lien global `a { … }` ; headers de sécurité `next.config.ts` absents (→ 1.5) ; pas de style `button:disabled` (→ Epic 2). [Source: deferred-work.md]
- **`.gitignore`** : `!.env.example` déjà rétabli (1.2) → l'ajout de `TEAM_PASSPHRASE` à `.env.example` sera bien commité ; `.env.local` reste ignoré. Ne pas retoucher `.gitignore`.

### Project Structure Notes
- Arborescence touchée (sous `daily-wheel/`) :
  ```
  daily-wheel/
    lib/supabase/admin.ts            # NEW (client secret server-only — cœur AC1)
    app/api/participants/route.ts    # NEW (Route Handler d'écriture gardée — cœur AC2-6)
    lib/data/participants.ts         # UPDATE (ajout writeParticipant + WriteError + writeErrorFromStatus — ne pas casser fetchParticipants/type Participant)
    tests/write.integration.test.ts  # NEW (intégration live env-gated — AC8a/b)
    tests/write-error.unit.test.ts   # NEW (unitaire pur mapping — AC8c)
    .env.example                     # UPDATE (ajout TEAM_PASSPHRASE factice, section serveur)
    package.json / package-lock.json # UPDATE (dep server-only ; scripts test:write/test:unit)
  ```
- `lib/supabase/client.ts` **inchangé** (lecture). `lib/domain/` et `lib/store/` restent vides. Pas d'UI (`app/page.tsx` inchangé). Pas de migration SQL (schéma 1.2 suffit).
- **Répercussion 1.5** : la tranche verticale branchera `writeParticipant` dans le store optimiste + Realtime + UI, et cadrera CI / `npm test` global / Vercel (la passphrase deviendra une variable d'env Vercel serveur).

### Testing standards (pour cette story)
- **3 tests** : 1 unitaire pur (mapping `WriteError`, sans réseau — vrai filet AD-17) + 1 intégration live env-gated (round-trip CRUD + garde 401, AC8a/b). Lancés via scripts dédiés (`test:unit`, `test:write`) depuis `daily-wheel/`.
- Critère « vert » : tests verts + `npm run lint` + `npm run build` verts + grep `.next/static` sans secret **ni passphrase** (AC1/Tâche 6). Si projet Supabase indisponible → l'intégration se skippe proprement ; mais le projet **est** disponible (1.2/1.3), donc viser le vert réel non-skippé.
- TDD : écrire d'abord le test unitaire (rouge : fonction absente), puis l'intégration (rouge : `POST`/exports absents), puis câbler jusqu'au vert.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 ; #Story-1.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-7 ; #AD-8 ; #AD-9 ; #AD-10 ; #AD-14 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions ; #Structural-Seed]
- [Source: _bmad-output/implementation-artifacts/1-3-connecter-app-supabase-lecture-cle-low-privilege.md#Testing-standards ; #Completion-Notes ; #Variance-structurelle ; #File-List]
- [Source: _bmad-output/implementation-artifacts/1-2-provisionner-supabase-schema-rls-realtime.md (schéma, RLS, Realtime)]
- [Source: daily-wheel/supabase/migrations/20260622121017_init_schema.sql (schéma participants → allowlist)]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- [Source: docs/prd.md NFR3, NFR8]
- [Source: nextjs.org/docs — route-handlers ; server-and-client-components ; supabase.com/docs — initializing, api-keys ; postgrest.org — errors]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- **Rouge** (avant câblage) : `npx vitest run tests/write-error.unit.test.ts tests/write.integration.test.ts` → unit `writeErrorFromStatus is not a function` (5 failed) + intégration `Failed to import @/app/api/participants/route` ⇒ RED confirmé.
- **Vert unitaire** : `npm run test:unit` → 5 passed (mapping 401/400/409/5xx + défaut).
- **Gotcha `server-only` sous Vitest** : import initial de `route.ts` → `Error: This module cannot be imported from a Client Component module` (le paquet `server-only` jette hors graphe React Server, faute de condition d'export `react-server` sous Vitest). Corrigé par un **alias Vitest** `server-only` → `tests/server-only.stub.ts` (config test uniquement ; le `npm run build` réel garde la vraie garde).
- **Vert intégration** : `npm run test:write` → 6 passed (1.14s, live sur Supabase réel) : garde 401 (header absent + mauvaise passphrase, aucune ligne créée) ; round-trip insert→update→delete avec `updated_at` distinct entre insert et update et `foo` filtré par l'allowlist ; op invalide → 400 ; data vide post-allowlist → 400 ; update sans id → 400.
- **Build** : `npm run build` → ✓ Compiled + TypeScript OK ; `/api/participants` listé en `ƒ (Dynamic) server-rendered on demand` (Route Handler serveur, non bundlé client).
- **Lint** : `npm run lint` → 0 erreur.
- **AC1 — grep `.next/static`** (depuis `daily-wheel/`) : `service_role` → 0 ; nom `SUPABASE_SECRET_KEY` → 0 ; valeur `SUPABASE_SECRET_KEY` (41 car.) → 0 ; nom `TEAM_PASSPHRASE` → 0 ; valeur `TEAM_PASSPHRASE` (23 car.) → 0.
- **Non-régression** : `npm run test:read` → 1 passed ; `npm run test:realtime` → timeout 20s au 1er run puis **1 passed** (965ms) au 2e ⇒ flake de handshake Realtime transitoire déjà documenté en 1.3, **pas** une régression (aucun changement sur le chemin Realtime/lecture).

### Completion Notes List

- **8 AC satisfaits et prouvés sur le projet Supabase réel.** Contrat d'écriture AD-14 établi pour `participants` : Route Handler unique `POST app/api/participants` avec enveloppe `{ op, id?, data? }` + header `x-team-passphrase`.
- **Garde passphrase (AD-8)** : comparaison temps constant (`timingSafeEqual`, court-circuit sur longueurs ≠), retour `401` **avant** tout accès Supabase. Passphrase + clé secrète = env serveur uniquement (AD-10), prouvé par grep `.next/static` (0 fuite).
- **Allowlist (AD-14)** `{ name, active }` appliquée avant écriture ; clés hors allowlist ignorées (`foo` filtré, testé) ; data vide après filtrage → `400`.
- **`updated_at` serveur (AD-15)** : insert via défaut SQL ; **update le fixe explicitement** (`new Date().toISOString()`) car le `default now()` ne se déclenche qu'à l'insert — vérifié par l'assertion `updated_at` distinct.
- **Taxonomie d'erreurs (AD-17)** posée des deux côtés : statuts HTTP serveur (401/400/409/5xx ; `23505`→409, `PGRST116`/0-ligne→409) + mapping pur `writeErrorFromStatus` + classe `WriteError` typée côté `lib/data/`. La **consommation** (re-prompt/rollback/retry/ré-hydratation) reste pour la Story 1.5.
- **`lib/data/` route les écritures (AD-7, AD-11)** : `writeParticipant(op, payload, passphrase)` fait `POST /api/participants` ; aucune écriture client-direct vers Supabase. `fetchParticipants`/`type Participant` (1.3) intacts.
- **Garde `server-only` (AD-10)** : `import 'server-only'` en tête de `admin.ts` → échec build si import client. Sous Vitest, neutralisée par alias vers un stub (la garde reste active au build prod) — voir Debug Log.
- **Périmètre tenu** : aucun store/optimiste/Realtime/UI, aucune CI/`npm test` global/Vercel, aucune Route Handler d'autre table (réservés 1.5 / Epics 2-4). Aucune migration SQL (schéma 1.2 suffit). `lib/domain/` et `lib/store/` restent vides.
- **Gotcha pour 1.5 (CI)** : les tests live (`test:read`, `test:realtime`, `test:write`) entrent en contention en exécution **parallèle** → garder des scripts dédiés ou `--no-file-parallelism` lors du cadrage du harnais global.
- **Convention dates** : `participants` n'a pas de colonne `date` métier ; `new Date().toISOString()` n'est utilisé que pour le timestamp technique `updated_at` (la règle « jamais UTC » vise les dates métier `YYYY-MM-DD` des Epics 2-3).

### File List

**Nouveaux :**
- `daily-wheel/lib/supabase/admin.ts` (client secret server-only — AC1)
- `daily-wheel/app/api/participants/route.ts` (Route Handler d'écriture gardée — AC2-6)
- `daily-wheel/tests/write.integration.test.ts` (intégration live env-gated — AC8a/b)
- `daily-wheel/tests/write-error.unit.test.ts` (unitaire pur mapping — AC8c)
- `daily-wheel/tests/server-only.stub.ts` (stub Vitest pour `server-only`)

**Modifiés :**
- `daily-wheel/lib/data/participants.ts` (ajout `writeParticipant`, `WriteError`, `writeErrorFromStatus` — AC7 ; lecture 1.3 intacte)
- `daily-wheel/vitest.config.ts` (alias `server-only` → stub)
- `daily-wheel/package.json` (dep `server-only` ; scripts `test:write`, `test:unit`)
- `daily-wheel/package-lock.json` (dep `server-only`)
- `daily-wheel/.env.example` (ajout `TEAM_PASSPHRASE` factice, section serveur)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 1.4)

**Non commités (locaux) :** `daily-wheel/.env.local` (ajout `TEAM_PASSPHRASE` réelle pour les tests live).

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-22 | 0.4.0 | Création du contexte de la Story 1.4 (proxy d'écriture serveur gardé par passphrase). Client secret server-only, Route Handler `app/api/participants` avec contrat d'écriture AD-14, allowlist, `updated_at` serveur AD-15, taxonomie d'erreurs AD-17, entrée `lib/data/` + tests (unitaire mapping + intégration live). Statut ready-for-dev. |
| 2026-06-22 | 0.4.1 | Implémentation Story 1.4 : client secret server-only (`lib/supabase/admin.ts`), Route Handler d'écriture gardée par passphrase (`app/api/participants/route.ts`) — contrat `{op,id?,data?}`, garde temps constant 401, allowlist `{name,active}`, `updated_at` serveur, taxonomie 401/400/409/5xx ; `lib/data/participants.ts` étendu (`writeParticipant` + `WriteError` + mapping pur). Tests : unitaire mapping (5✓) + intégration live round-trip CRUD & garde 401 (6✓). Lint + build verts ; `/api/participants` server-only ; grep `.next/static` = 0 secret. Statut → review. |
