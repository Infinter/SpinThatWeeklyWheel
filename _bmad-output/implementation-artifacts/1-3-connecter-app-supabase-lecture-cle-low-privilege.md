---
baseline_commit: 72c3bbdefa7f6d3d2a5e7908333d096f5bfabfc5
---

# Story 1.3: Connecter l'app à Supabase en lecture (clé low-privilege)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur,
I want le client Supabase de lecture initialisé dans `lib/supabase/` via variables d'environnement **publiques**, et une première lecture exposée par `lib/data/`,
so that l'app lise la base sans exposer de secret sensible, en respectant le chemin de données asymétrique.

## Acceptance Criteria

1. **Client de lecture low-privilege dans `lib/supabase/`.** Un module `daily-wheel/lib/supabase/client.ts` initialise **un seul** client `@supabase/supabase-js` à partir de `process.env.NEXT_PUBLIC_SUPABASE_URL` et `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. Il échoue avec un message clair si l'une des deux variables est absente. Aucun client « secret » n'est créé dans cette story (réservé à 1.4). [Source: ARCHITECTURE-SPINE.md#AD-7 ; #AD-10 ; epics.md#Story-1.3]
2. **Lecture de test via `lib/data/` (seul point de contact Supabase).** Une fonction de lecture vit dans `daily-wheel/lib/data/` (p. ex. `fetchParticipants()`) ; elle est le **seul** endroit appelant `supabase.from(...)`. Un test d'intégration **env-gated** prouve qu'une lecture sur une table réelle renvoie un résultat **sans erreur** (tableau, éventuellement vide). Aucun composant/hook n'appelle Supabase directement. [Source: ARCHITECTURE-SPINE.md#AD-11 ; epics.md#Story-1.3]
3. **Aucun secret côté client.** Le code client ne référence **que** des variables `NEXT_PUBLIC_*` ; ni `SUPABASE_SECRET_KEY`/`service_role` ni aucune clé secrète n'est importée par un module atteignable depuis le navigateur, ni préfixée `NEXT_PUBLIC_`. Preuve falsifiable : après `npm run build`, un grep des chunks client (`.next/static/`) sur la valeur de la clé secrète et sur `service_role` ne renvoie **aucune** occurrence. [Source: ARCHITECTURE-SPINE.md#AD-10 ; epics.md#Story-1.3 ; PRD NFR8]
4. **Convention de dates respectée en lecture.** Les colonnes Postgres `date` sont traitées comme chaînes `YYYY-MM-DD` **locales** : `lib/data/` les renvoie telles quelles (typées `string`), **jamais** converties via `new Date()`/`toISOString()`/UTC. Les types de retour des fonctions de lecture typent les champs `date` en `string`. [Source: ARCHITECTURE-SPINE.md#Consistency-Conventions (Dates) ; epics.md#Story-1.3]

## Tasks / Subtasks

- [x] **Tâche 1 — Client de lecture low-privilege `lib/supabase/client.ts`** (AC: 1, 3)
  - [x] Créer `daily-wheel/lib/supabase/client.ts` : lire `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` depuis `process.env`, lever une erreur explicite si manquantes, puis `createClient(url, anonKey)`.
  - [x] Exporter un **singleton** module-level (`export const supabasePublic`). Pas de session/auth (mono-équipe, pas de login) → `createClient` simple, **pas** `@supabase/ssr`.
  - [x] Retirer `daily-wheel/lib/supabase/.gitkeep` (le module fige le dossier).
  - [x] **Interdit dans cette story** : créer un client secret/admin (`service_role`) → c'est la Story 1.4. Aucune variable serveur référencée ici. ✅ respecté.
- [x] **Tâche 2 — Repository de lecture `lib/data/`** (AC: 2, 4)
  - [x] Créer `daily-wheel/lib/data/participants.ts` : `export async function fetchParticipants()` appelant `supabasePublic.from('participants').select('*')`, propageant l'erreur Supabase (`if (error) throw error`), renvoyant `data ?? []`.
  - [x] Définir le type de ligne `Participant` (`id: string; name: string; active: boolean; created_at: string; updated_at: string`) — `created_at`/`updated_at` typés `string` (sérialisés ISO côté PostgREST), **pas** `Date`.
  - [x] `lib/data/` est le **seul** module faisant `.from(...)` : aucun appel Supabase ailleurs (AD-11).
  - [x] Retirer `daily-wheel/lib/data/.gitkeep`.
- [x] **Tâche 3 — Test d'intégration lecture (rouge → vert)** (AC: 2, 4)
  - [x] Ajouter l'alias `@` à `daily-wheel/vitest.config.ts` (`resolve.alias` `'@'` → racine projet, via `fileURLToPath`) pour que le test importe `@/lib/data/participants`.
  - [x] Écrire `daily-wheel/tests/read.integration.test.ts` : `describe.skipIf(!ready)` où `ready = Boolean(url && anon)`. Appel `fetchParticipants()` → **aucune erreur** + `Array.isArray(...)`.
  - [x] Si ≥ 1 ligne renvoyée, assertion que `created_at`/`updated_at` restent `string` (preuve AC4).
  - [x] **Rouge** confirmé avant câblage (« Cannot find package '@/lib/data/participants' »), puis **vert** une fois client + repository en place (lecture réelle réussie, non skippée).
  - [x] Script `"test:read": "vitest run tests/read.integration.test.ts"` ajouté ; **non** enrôlé dans un `npm test` global (réservé Story 1.5 — AD-13).
- [x] **Tâche 4 — Preuve « aucun secret côté client »** (AC: 3)
  - [x] `npm run build` (vert), puis grep `.next/static` : `service_role` → 0, valeur de `SUPABASE_SECRET_KEY` → 0, nom `SUPABASE_SECRET_KEY` → 0. Résultats dans Debug Log.
- [x] **Tâche 5 — Vérification & documentation**
  - [x] `npm run lint` (0 erreur) et `npm run build` verts (non-régression vs 1.1/1.2).
  - [x] Dev Agent Record (File List, Completion Notes, gotchas) et Change Log renseignés.

## Dev Notes

### Contexte & périmètre
- 3ᵉ story d'Epic 1 (fondations). Précédentes : **1.1 done** (scaffold Next.js dans `daily-wheel/`), **1.2 review** (migration SQL : 6 tables + RLS lecture-publique/écriture-refusée + Realtime, appliquée au projet Supabase réel). Cette story **branche l'app en lecture** : un client low-privilege + une première fonction `lib/data/`. [Source: 1-2-*.md ; epics.md#Story-1.3]
- **Strictement borné aux 4 AC.** Hors-scope explicite : client secret/admin et Route Handlers d'écriture (→ **1.4**) ; store, abonnement Realtime, réconciliation, UI/optimiste (→ **1.5**) ; CI + `npm test` global + déploiement Vercel (→ **1.5**). Ne **rien** anticiper de tout cela.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1/1.2)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Tous les chemins ci-dessous sont **sous `daily-wheel/`** ; toutes les commandes (`npm`, grep `.next/`) s'exécutent **depuis `daily-wheel/`**. [Source: 1-1-*.md#Project-Structure-Notes ; 1-2-*.md]
- État actuel pertinent : `lib/{domain,data,supabase,store}/` ne contiennent qu'un `.gitkeep` ; `@supabase/supabase-js@^2.108.2`, `vitest@^4.1.9`, `dotenv@^17.4.2` **déjà installés** (par 1.2) ; `vitest.config.ts` + `tests/setup.ts` (charge `.env.local`) **déjà en place** ; `.env.local` (non commité) contient `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` ; `.env.example` (commité, valeurs factices) à jour. [Source: inspection repo ; 1-2-*.md#File-List]

### Décisions d'architecture qui cadrent cette story
- **AD-7 (chemins asymétriques)** : les **lectures** sortent client-direct via la clé **low-privilege**. C'est exactement ce que pose cette story. Les écritures (→ proxy serveur) sont hors-scope (1.4).
- **AD-10 (secrets server-only)** : seules `NEXT_PUBLIC_SUPABASE_URL` + clé low-privilege sont exposées au client. La clé secrète **n'apparaît jamais** dans un module client ni en `NEXT_PUBLIC_`. `lib/supabase/` exposera *à terme* deux clients (low-privilege + secret) ; **cette story ne crée que le low-privilege**. Le client secret (`lib/supabase/admin.ts` ou équivalent, importé **uniquement** par `app/api/`) est la Story 1.4.
- **AD-11 (`lib/data/` seul point de contact)** : aucun composant/hook ne fait `supabase.from(...)`. La lecture de test **doit** passer par `lib/data/`, pas par un client jetable (différence avec le test Realtime de 1.2, qui instanciait des clients jetables hors `lib/` précisément parce que `lib/` n'existait pas encore).
- **Convention dates** : dates métier = chaînes `YYYY-MM-DD` **locales**, jamais `toISOString()`/UTC (évite le décalage d'un jour). PostgREST renvoie déjà les colonnes `date` en `'YYYY-MM-DD'` ; le risque est de les **transformer** côté code → ne pas le faire, typer en `string`. [Source: ARCHITECTURE-SPINE.md#Consistency-Conventions]

### Points techniques (recherche Supabase / Next 16, janv. 2026)
- **`createClient` suffit** : pas d'auth/login dans ce produit (mono-équipe, garde par passphrase côté écriture uniquement). Inutile d'introduire `@supabase/ssr`/cookies. Un singleton module-level `createClient(url, anon)` est sûr côté navigateur **et** côté Server Component (il n'utilise que des `NEXT_PUBLIC_*`, disponibles des deux côtés). [Source: supabase.com/docs/reference/javascript/initializing]
- **Connexion lecture = HTTPS (PostgREST/Realtime)**, pas le wire Postgres. Le **gotcha IPv6/pooler** rencontré en 1.2 (`db push`) ne concerne **que** la CLI de migration : il **n'affecte pas** les lectures de cette story (endpoint `https://<ref>.supabase.co`). [Source: 1-2-*.md#Completion-Notes]
- **RLS déjà en place (1.2)** : la policy `SELECT to anon using (true)` sur `participants` autorise la lecture par la clé low-privilege → `fetchParticipants()` doit renvoyer sans erreur (table éventuellement vide ⇒ `[]`, ce qui satisfait l'AC). [Source: 1-2-*.md#AC4]
- **Alias `@` sous Vitest** : `tsconfig.json` définit `paths: { "@/*": ["./*"] }`, mais Vitest ne lit pas ces paths automatiquement. Ajouter `resolve: { alias: { '@': <racine> } }` dans `vitest.config.ts` (ou utiliser un import relatif dans le test). Le test Realtime de 1.2 n'avait pas ce besoin (il importait `@supabase/supabase-js` directement). [Source: inspection vitest.config.ts ; tsconfig.json]
- **Env en test** : `tests/setup.ts` charge déjà `.env.local` via dotenv → `process.env.NEXT_PUBLIC_*` disponibles. Le singleton de `lib/supabase/client.ts` lit l'env **à l'import** ; comme `setupFiles` s'exécute avant l'import des tests, l'ordre est correct. [Source: vitest.config.ts ; tests/setup.ts]

### Squelette de référence (à adapter)
`lib/supabase/client.ts` :
```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  throw new Error(
    'Supabase (lecture) : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY requis.'
  )
}
// Client low-privilege (lecture client-direct, AD-7). Pas de session (pas de login).
export const supabasePublic = createClient(url, anonKey)
```
`lib/data/participants.ts` :
```ts
import { supabasePublic } from '@/lib/supabase/client'

export type Participant = {
  id: string
  name: string
  active: boolean
  created_at: string   // ISO string, JAMAIS Date (convention dates)
  updated_at: string
}

export async function fetchParticipants(): Promise<Participant[]> {
  const { data, error } = await supabasePublic.from('participants').select('*')
  if (error) throw error
  return data ?? []
}
```
`tests/read.integration.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
import { fetchParticipants } from '@/lib/data/participants'

const ready = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

describe.skipIf(!ready)('Lecture low-privilege via lib/data (AD-7, AD-11)', () => {
  it('fetchParticipants() renvoie un tableau sans erreur', async () => {
    const rows = await fetchParticipants()
    expect(Array.isArray(rows)).toBe(true)
    if (rows.length) {
      expect(typeof rows[0].created_at).toBe('string') // AC4 : dates = string, jamais Date
    }
  })
})
```

### Previous Story Intelligence (1.2)
- **Pattern test env-gated** : `describe.skipIf(!ready)` + secrets lus de `process.env` ; script dédié, **hors** `npm test` global (réservé 1.5). Reproduire ce pattern pour `test:read`. [Source: 1-2-*.md#Testing-standards]
- **Projet Supabase réel disponible** : migration appliquée, RLS/Realtime prouvés. Donc le test de lecture peut être exécuté **vert** localement (pas seulement skippé). [Source: 1-2-*.md#Completion-Notes]
- **Findings différés ouverts** (ne pas régresser, ne pas corriger ici sauf si touché) : script `"lint": "eslint"` sans cible ; reset lien global `a { … }` trop large ; absence de headers de sécurité `next.config.ts` (→ 1.5). [Source: deferred-work.md]
- `.gitignore` : `!.env.example` déjà rétabli en 1.2 (finding 1.1 corrigé) → ne pas retoucher. [Source: 1-2-*.md#Tâche-3]

### Project Structure Notes
- Arborescence touchée (sous `daily-wheel/`) :
  ```
  daily-wheel/
    lib/supabase/client.ts        # NEW (client low-privilege — cœur de la story)
    lib/data/participants.ts      # NEW (1ère lecture, seul point de contact Supabase)
    tests/read.integration.test.ts # NEW (intégration, env-gated)
    vitest.config.ts              # UPDATE (alias @ → racine)
    package.json / package-lock.json # UPDATE (script test:read ; aucune dep nouvelle attendue)
    lib/supabase/.gitkeep         # DELETE (remplacé par client.ts)
    lib/data/.gitkeep             # DELETE (remplacé par participants.ts)
  ```
- `lib/domain/` et `lib/store/` restent vides (`.gitkeep`) — hors-scope. `app/` inchangé (pas d'UI ici).
- **Répercussion 1.5** : Root Directory Vercel + CI pointeront sur `daily-wheel/` ; le harnais `npm test` global et le déploiement y sont cadrés.

### Testing standards (pour cette story)
- Un seul test = **intégration lecture** (AC2/AC4), live, env-gated, lancé par `npm run test:read` depuis `daily-wheel/`. Pas de test unitaire de domaine (aucun `lib/domain/` ici). Le harnais domaine + CI arrive en 1.5 (AD-13).
- Critère « vert » : `fetchParticipants()` sans erreur + `npm run lint` + `npm run build` verts + grep `.next/static` sans secret (AC3). Si aucun projet Supabase dispo au moment du dev → test skippé proprement (documenter), mais ici le projet **est** disponible (1.2).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 ; #Story-1.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-7 ; #AD-10 ; #AD-11 ; #Consistency-Conventions ; #Structural-Seed]
- [Source: _bmad-output/implementation-artifacts/1-2-provisionner-supabase-schema-rls-realtime.md#Testing-standards ; #Completion-Notes ; #AC4 ; #File-List]
- [Source: _bmad-output/implementation-artifacts/1-1-initialiser-application-nextjs-charte-existante.md#Project-Structure-Notes]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md]
- [Source: docs/prd.md §4 (modèle de données) ; NFR3, NFR8]
- [Source: supabase.com/docs — reference/javascript/initializing ; guides/realtime/postgres-changes]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- **Rouge** (avant câblage) : `npx vitest run tests/read.integration.test.ts` → `Error: Cannot find package '@/lib/data/participants'` (modules absents).
- **Vert** (client + repository créés, `.gitkeep` retirés) : `npx vitest run tests/read.integration.test.ts` → 1 passed (lecture réelle de `participants`, test **non skippé** car les 4 vars d'env sont présentes).
- **Vert** via script : `npm run test:read` → 1 passed.
- **Build** : `npm run build` → ✓ Compiled + TypeScript OK + 4/4 pages statiques (`/`, `/_not-found`).
- **AC3 — grep `.next/static`** (depuis `daily-wheel/`) :
  - `grep -rl "service_role" .next/static` → **0 occurrence**.
  - `grep -rlF "<valeur SUPABASE_SECRET_KEY>" .next/static` → **0 occurrence** (clé de 41 car. détectée dans `.env.local`).
  - `grep -rl "SUPABASE_SECRET_KEY" .next/static` → **0 occurrence** (nom de var non plus).
- **Lint** : `npm run lint` → 0 erreur.
- **Régression** : `npx vitest run` (parallèle) → **1 failed** (`test:realtime` timeout 20s) ; `npx vitest run --no-file-parallelism` → **2 passed** (1.18s) ; `npm run test:realtime` seul → passed. ⇒ flake de **contention parallèle** entre tests d'intégration live, **pas** une régression de code.

### Completion Notes List

- 4 AC satisfaits et **prouvés sur le projet Supabase réel** : client low-privilege (AC1), lecture via `lib/data/` seul point de contact (AC2, AD-11), aucun secret dans le bundle client (AC3, prouvé par grep), convention dates `string` (AC4).
- **Périmètre tenu** : créé uniquement le client de **lecture**. Aucun client secret/admin, aucune Route Handler, aucun store/Realtime/UI (réservés 1.4/1.5). `lib/domain/` et `lib/store/` restent vides.
- **Alias `@` Vitest** : ajouté à `vitest.config.ts` via `fileURLToPath(new URL('.', import.meta.url))`. Vérifié qu'il ne capte **pas** `@supabase/supabase-js` (l'alias `'@'` ne matche que `@/…`, pas `@scope/pkg`) → test Realtime 1.2 intact.
- **Gotcha pour Story 1.5 (CI / `npm test` global)** : les tests d'intégration **live** (`test:realtime`, `test:read`) entrent en contention en exécution **parallèle** (deux connexions Supabase concurrentes → timeout Realtime). À cadrer en 1.5 : soit `--no-file-parallelism`/`fileParallelism: false`, soit isoler les tests live des tests de domaine. Pour l'instant chaque test a son **script dédié** (pattern hérité de 1.2) et reste hors d'un `npm test` global.
- **Convention dates** : aucune transformation `Date`/UTC sur le chemin de lecture ; `created_at`/`updated_at` typés `string`. Table `participants` sans colonne `date` métier — l'assertion AC4 porte sur les timestamps ; les colonnes `date` (unavailabilities, holidays, etc.) suivront la même règle dès leur lecture (Epics 2-3).
- **Réseau** : lectures via HTTPS (`https://<ref>.supabase.co`) — le gotcha IPv6/pooler de 1.2 (`db push`) ne s'applique pas ici.

### File List

**Nouveaux :**
- `daily-wheel/lib/supabase/client.ts` (client low-privilege — cœur AC1)
- `daily-wheel/lib/data/participants.ts` (repository lecture `fetchParticipants` + type `Participant` — AC2/AC4)
- `daily-wheel/tests/read.integration.test.ts` (test d'intégration lecture, env-gated — AC2/AC4)

**Modifiés :**
- `daily-wheel/vitest.config.ts` (alias `@` → racine projet)
- `daily-wheel/package.json` (script `test:read` ; aucune dépendance nouvelle)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut 1.3)

**Supprimés :**
- `daily-wheel/lib/supabase/.gitkeep` (remplacé par `client.ts`)
- `daily-wheel/lib/data/.gitkeep` (remplacé par `participants.ts`)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-22 | 0.3.0 | Création du contexte de la Story 1.3 (connexion lecture low-privilege). Statut ready-for-dev. |
| 2026-06-22 | 0.3.1 | Implémentation Story 1.3 : client Supabase low-privilege (`lib/supabase/client.ts`), repository lecture (`lib/data/participants.ts`, seul point de contact — AD-11), test d'intégration lecture env-gated (vert sur projet réel), alias `@` Vitest, script `test:read`. AC3 prouvé par grep `.next/static` (0 secret). Lint + build verts. Statut → review. |
