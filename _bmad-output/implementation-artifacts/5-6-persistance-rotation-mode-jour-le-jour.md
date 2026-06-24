---
baseline_commit: 576b7c0a9948c91ca359c4d8230b0ad3d42974ad
---
# Story 5.6: Persistance de la rotation (mode Jour le jour)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> ⚠ **Cette story porte une décision d'architecture (flag archi #2)** : *où et comment persister la rotation*. La décision est **tranchée et tracée** ci-dessous (Dev Notes §« Décision d'architecture (flag #2) ») : **persistance serveur Supabase** via une **table singleton dédiée `rotation_state`**, sous le contrat d'écriture existant (AD-14). Une **validation par l'architecte** (`bmad-architecture`) et/ou la **confirmation de Solo** est recommandée **avant `dev-story`** (voir §Questions ouvertes). Le reste de la story est entièrement contexté pour exécution immédiate une fois la décision confirmée.

## Story

As a membre de l'équipe,
I want que la rotation reprenne au bon jour après un rechargement ou depuis un autre poste,
so that le rituel quotidien « Jour le jour » survive entre les standups (FR18, flag archi #2).

## Acceptance Criteria

> Reformulées depuis `epics.md#Story 5.6` (l. 485-501) et croisées avec l'architecture-spine (`ARCHITECTURE-SPINE.md` : AD-2 aléa seedable, AD-4 Supabase canonique, AD-5 optimiste, AD-6 Realtime, AD-7/AD-8 chemins asymétriques + passphrase, AD-14 contrat d'écriture, AD-15/AD-16 dédup+LWW, AD-17 taxonomie d'erreurs ; convention « settings = singleton + upsert »). Chaque AC porte un ID pour le suivi des tâches.
>
> **PRINCIPE DIRECTEUR Epic 5 (`epics.md:398`)** : `generateSchedule` reste la **SOURCE DE VÉRITÉ** ; la roue n'est qu'une mise en scène. **5.6 ne touche NI le domaine, NI la géométrie de la roue, NI la projection timeline, NI l'orchestration bi-mode de 5.5** : elle rend **persistants** la **graine** (seed) et le **curseur de révélation** (revealedCount) qui étaient jusqu'ici éphémères, pour pouvoir **recalculer à l'identique** (NFR7) la rotation au rechargement. On persiste un **mécanisme reproductible (graine + curseur)**, jamais un planning figé.

**AC-1 — Reprise au même curseur après rechargement OU depuis un autre poste (epics.md:493-495, FR18).** Étant donné une rotation entamée en mode « Jour le jour », quand je **recharge la page** ou l'**ouvre depuis un autre navigateur / poste**, la rotation **reprend au même curseur** : les **mêmes jours déjà révélés** affichent les **mêmes animateurs**, la roue ne contient plus que les restants, et **rien n'est re-tiré**. Le mode (« Jour le jour » / « Rotation complète ») actif est lui aussi restauré.

**AC-2 — Persistance = graine + curseur (+ mode), recalcul déterministe — PAS de résultat figé (epics.md:496, AD-2, NFR7).** La reprise s'appuie sur une **graine** (`seed`, l'entier passé à `createRng`) **+ un curseur de progression** (`cursor` = `revealedCount`) **stockés** — **jamais** sur le tableau `planning` figé (non reproductible, vite périmé). Au chargement, le store **recalcule** `schedule = generateSchedule(input, createRng(seed))` à partir des **entrées courantes** et de la graine persistée, puis restaure le curseur. Le `schedule`, **aujourd'hui éphémère** dans le store (`participants-store.tsx:138-141,190-191` : « calcul client pur, NON persisté »), **devient persistant** au sens où sa **graine** l'est (le résultat reste recalculé, jamais sérialisé en base).

**AC-3 — Décision d'architecture tranchée & tracée : persistance SERVEUR Supabase (epics.md:497, AD-4/AD-7/AD-14).** La graine + le curseur (+ le mode) sont persistés **en base Supabase**, dans une **table singleton dédiée `rotation_state`** (`id = 'singleton'`), et **respectent le contrat d'écriture serveur existant** : écriture via le **proxy gardé par passphrase** (`POST /api/rotation_state`, header `x-team-passphrase`, op `upsert`, AD-14), lecture via la clé low-privilege (AD-7). **Justification décisive** : l'AC-1 exige la reprise *« depuis un autre navigateur / poste »* → un état **purement local** (`localStorage`/`sessionStorage`) **ne peut PAS** la satisfaire (il ne franchit ni le navigateur ni la machine) → la persistance **doit** être serveur (AD-4 : Supabase = source canonique de l'état partagé, FR13). La décision, ses alternatives et leur rejet sont tracés en Dev Notes §« Décision d'architecture (flag #2) ».

**AC-4 — Reset / relancer réinitialise graine ET curseur (epics.md:498).** Réinitialiser ou **relancer** la rotation (CTA « Relancer la rotation » en mode complet, ou nouveau tirage) **tire une nouvelle graine** et **remet le curseur à 0**, et **persiste** ce nouvel état (upsert `{ seed: <nouveau>, cursor: 0, mode }`). Un simple **changement de mode** remet le **curseur à 0** (cohérent 5.5 AC-6) et persiste `{ cursor: 0, mode }` **sans** retirer une nouvelle graine (le plan n'est pas recalculé par un changement de mode — 5.5).

**AC-5 — Test de rejouabilité : (graine + curseur) reproduit exactement la rotation (epics.md:499, NFR7, AD-2).** Un **test pur** (Vitest, env `node`, sans Supabase) prouve que, à **entrées identiques**, `(seed, cursor)` rejoués reproduisent **exactement** la même rotation : `generateSchedule(input, createRng(seed)).planning` est **identique** d'un appel à l'autre (déterminisme mulberry32), et la **tranche révélée** `planning.slice(0, cursor)` (mêmes dates, mêmes `participantId`/`name`, même ordre) est **identique** après « reprise ». Cas couverts : `cursor = 0`, `0 < cursor < len`, `cursor = len` ; et **non-reproductibilité documentée** si les entrées changent (→ relève de 5.9, hors périmètre).

**AC-6 — Contrat d'écriture respecté de bout en bout (AD-5/AD-8/AD-14/AD-15/AD-16/AD-17).** Les écritures de `rotation_state` sont **optimistes** (store d'abord, AD-5), passent par la **file d'écriture partagée** table-agnostique (`useWriteQueue`, un seul prompt passphrase pour toutes tables, AD-8), avec **rollback/retry** selon la taxonomie (AD-17 : 401 re-prompt, 400 rollback, 409 re-hydrate, 5xx retry). La table porte `updated_at` (serveur) et est **abonnée Realtime** ; l'**écho** d'une propre écriture est **dédupliqué** par `id`+`updated_at` (AD-15) et les conflits résolus **Last-Write-Wins** ordonné serveur (AD-16). **Conséquence UX assumée** : la **première** action persistante de la session (premier spin / révélation / relance) déclenche le **prompt passphrase paresseux** existant (mémorisé en `sessionStorage`) — cohérent avec le bandeau « 🔒 Équipe protégée » (5.1, AD-8). Voir Dev Notes §« Conséquence passphrase ».

**AC-7 — Périmètre PROTÉGÉ + granularité d'écriture maîtrisée (sacré, NFR9/AD-12).** Le **domaine `lib/domain/` n'est PAS touché** (ni `schedule.ts`, ni `rng.ts`) ; `lib/ui/wheel.ts`, `lib/ui/timeline.ts`, `lib/ui/spin-mode.ts`, `components/SpinWheel.tsx`, `components/ScheduleTimeline.tsx` **ne changent pas de contrat**. L'**orchestration bi-mode de 5.5** (enchaînement ~600 ms, libellés CTA, reset au changement de mode, reduced-motion) est **préservée à l'identique** — 5.6 ne fait que **brancher la persistance** du couple `(seed, cursor, mode)`. Les tests **golden**, domaine, `wheel`/`timeline`/`spin-mode` restent **verts sans modification**. **Granularité d'écriture** : les écritures persistantes sont déclenchées sur des **transitions délibérées** (génération/relance, changement de mode, et **chaque révélation en « Jour le jour »**) — **JAMAIS par frame d'animation** ; en « Rotation complète » l'enchaînement n'écrit **PAS** à chaque ~600 ms mais **une seule fois** le curseur final à la complétion (voir Dev Notes §« Granularité d'écriture »).

**AC-8 — Hors-périmètre 5.6 (différés).** Sont **STRICTEMENT différés** : les **exports Slack/CSV + aperçu** → **5.7** ; le **gel microcopie/branding** (mark 🎡, favicon, titres contextuels) → **5.8** ; le **clic chip → popover d'édition** et surtout le **nudge « Contraintes mises à jour — relancer la roue ? »** + la **détection de changement de contraintes** → **5.9**. **Important** : 5.6 ne gère **pas** le cas « les entrées ont changé entre deux sessions » (participant ajouté/retiré, contrainte modifiée) : si les entrées diffèrent, le recalcul à graine constante peut produire un planning différent — c'est **attendu** et **traité par le nudge de 5.9**. 5.6 garantit la reprise identique **à entrées inchangées** (le cas nominal du rituel quotidien).

**AC-9 — Non-régression globale.** `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; **toute** la suite Vitest verte (existants 5.2→5.5 + golden + nouveaux `rotation-state`) ; `npm run build` OK. La migration s'applique proprement via `supabase db push` (AD-13) **ou** est documentée comme à appliquer manuellement si l'env CLI n'est pas branché.

## Tasks / Subtasks

> Ordre TDD recommandé : T1 (migration) → **T2/T7 RED** (test pur rejouabilité, doit échouer si le helper manque, sinon il s'appuie sur `generateSchedule` existant) → T3→T6 (chaîne data/route/reducer/store/UI GREEN) → T8 (non-régression). La logique **purement décidable** est minime (la reproductibilité vient de `generateSchedule` déjà testé) ; l'essentiel est du **câblage data/store** validé par tsc/eslint/build + un test de rejouabilité + un test de reducer.

- [x] **T1 — Migration `rotation_state` (NEW SQL)** (AC: 3, 6, 9)
  - [x] Lire d'abord **intégralement** `daily-wheel/supabase/migrations/20260622121017_init_schema.sql` pour **répliquer EXACTEMENT** les patrons : `create table`, `enable row level security`, policy `SELECT` au rôle public, **aucune** policy write, ajout à la publication `supabase_realtime`, `alter table … replica identity full`. (Cf. AD-6/AD-9/AD-15.)
  - [x] Créer `daily-wheel/supabase/migrations/<YYYYMMDDHHMMSS>_add_rotation_state.sql` (timestamp UTC **postérieur** à `20260622121017`, ex. `20260624HHMMSS`). Schéma (snake_case, convention spine) :
    ```sql
    create table public.rotation_state (
      id text primary key default 'singleton',
      seed bigint not null,                                  -- entier uint32 (0..4294967295) → bigint (int4 trop court)
      cursor integer not null default 0,                     -- = revealedCount (≥ 0)
      mode text not null default 'rotation-complete'         -- 'rotation-complete' | 'jour-le-jour'
        check (mode in ('rotation-complete','jour-le-jour')),
      updated_at timestamptz not null default now()
    );
    ```
  - [x] RLS : `SELECT` public autorisé ; **pas** d'`INSERT/UPDATE/DELETE` (écritures via la clé secrète serveur uniquement, AD-9). Réplique la formulation des 6 tables existantes.
  - [x] Realtime : ajouter `rotation_state` à `supabase_realtime` + `replica identity full` (AD-6/AD-15), comme les 6 tables.
  - [x] **Aucune ligne semée** (table vide au départ → `maybeSingle()` renvoie `null`, le store matérialise un défaut, comme `settings`).

- [x] **T2 — Helper pur de rejouabilité + test RED→GREEN (NEW `lib/ui/rotation-resume.ts` + `tests/rotation-resume.unit.test.ts`)** (AC: 2, 5)
  - [x] Créer `daily-wheel/lib/ui/rotation-resume.ts` — **PUR** (aucun import React/DOM/Supabase ; voisin de `wheel.ts`/`timeline.ts`/`spin-mode.ts`, esprit AD-1). Commenter : « 5.6 — reprise de rotation. Le domaine reste la source de vérité ; ce module ne fait que (re)dériver de façon déterministe le planning + la tranche révélée à partir de (input, seed, cursor). »
    ```ts
    import { generateSchedule, type ScheduleInput, type ScheduleResult } from '@/lib/domain/schedule'
    import { createRng } from '@/lib/domain/rng'

    // Recalcule le schedule à partir d'une graine persistée (déterminisme NFR7/AD-2).
    export function replayRotation(input: ScheduleInput, seed: number): ScheduleResult {
      return generateSchedule(input, createRng(seed))
    }

    // Curseur borné dans [0, planning.length] (défensif : un curseur périmé ne déborde jamais).
    export function clampCursor(cursor: number, planningLen: number): number {
      if (!Number.isFinite(cursor) || cursor < 0) return 0
      return Math.min(Math.trunc(cursor), planningLen)
    }
    ```
  - [x] Créer `daily-wheel/tests/rotation-resume.unit.test.ts` (Vitest env `node`, **pur**, style maison : helpers en tête, `describe('… (Story 5.6, AC-5)')`, assertions explicites — pas de snapshot). Couvrir :
    - **déterminisme** : `replayRotation(input, seed).planning` appelé deux fois ⇒ **égalité profonde** (dates + `participantId` + `name` + ordre) ;
    - **tranche révélée** : pour un `(input, seed)` donné, `replay.planning.slice(0, clampCursor(c, len))` est **identique** au préfixe attendu pour `c ∈ {0, 1, len}` (mêmes animateurs aux mêmes dates) — c'est la « reprise » ;
    - **clampCursor** : `c < 0 → 0`, `c > len → len`, `NaN → 0`, valeur valide inchangée ;
    - **(documentation)** un commentaire de test note qu'un **input différent** + même seed peut donner un planning différent (hors garantie 5.6 → 5.9). *Optionnel* : un cas illustratif (2 inputs, mêmes seed) montrant la divergence, **sans** en faire un invariant.

- [x] **T3 — Couche data `rotation_state` (NEW `lib/data/rotation-state.ts`)** (AC: 3, 6)
  - [x] Créer `daily-wheel/lib/data/rotation-state.ts` en **calquant `lib/data/settings.ts`** (patron SINGLETON/UPSERT, **pas** les 6 tables-liste) :
    ```ts
    import { supabasePublic } from '@/lib/supabase/client'
    import { WriteError } from '@/lib/data/write-error'

    export type RotationState = {
      id: string                                    // toujours 'singleton'
      seed: number                                  // entier uint32 (bigint en base ; JS-safe < 2^53)
      cursor: number                                // = revealedCount
      mode: 'rotation-complete' | 'jour-le-jour'
      updated_at: string                            // ISO (PostgREST), JAMAIS typé Date (convention dates)
    }

    export async function fetchRotationState(): Promise<RotationState | null> {
      const { data, error } = await supabasePublic
        .from('rotation_state').select('*').eq('id', 'singleton').maybeSingle()
      if (error) throw error
      return data ?? null
    }

    export type RotationStateWritePayload = {
      seed?: number
      cursor?: number
      mode?: 'rotation-complete' | 'jour-le-jour'
    }

    export async function writeRotationState(
      payload: RotationStateWritePayload, passphrase: string,
    ): Promise<unknown> {
      const res = await fetch('/api/rotation_state', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-team-passphrase': passphrase },
        body: JSON.stringify({ op: 'upsert', data: payload }),
      })
      if (!res.ok) {
        let message = `Échec d'écriture (${res.status})`
        try { const b = await res.json(); if (b?.error) message = String(b.error) } catch { /* corps non-JSON */ }
        throw new WriteError(res.status, message)
      }
      return res.json()
    }
    ```
  - [x] **NB `bigint`** : PostgREST renvoie `bigint` en **number** JSON tant que < 2^53 — OK pour un uint32. Ne pas typer `Date` l'`updated_at`.

- [x] **T4 — Route d'écriture `rotation_state` (NEW `app/api/rotation_state/route.ts`)** (AC: 3, 6)
  - [x] Créer `daily-wheel/app/api/rotation_state/route.ts` en **calquant `app/api/settings/route.ts`** (op UNIQUE `upsert`, garde passphrase `timingSafeEqual` AVANT tout accès Supabase, id forcé `'singleton'`, `updated_at` posé serveur, mapping AD-17). Allowlist :
    ```ts
    const ALLOWED = ['seed', 'cursor', 'mode'] as const
    ```
  - [x] **Validation défensive (AD-17:400)** : `seed` entier ≥ 0 et ≤ 0xFFFFFFFF ; `cursor` entier ≥ 0 ; `mode ∈ {'rotation-complete','jour-le-jour'}`. Rejeter sinon (400). Réutiliser `safeEqual`/`json`/`pickAllowed`/`mapDbError` à l'identique de la route settings.
  - [x] `upsert({ id: 'singleton', ...picked, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single()` — `runtime = 'nodejs'`.

- [x] **T5 — Réducteur singleton + réconciliation (NEW `lib/store/rotation-state-reducer.ts` ; UPDATE `lib/store/reconcile.ts`)** (AC: 4, 6)
  - [x] Créer `daily-wheel/lib/store/rotation-state-reducer.ts` en **calquant `lib/store/settings-reducer.ts`** (patron SCALAIRE singleton : actions `HYDRATE | REALTIME | OPTIMISTIC | CONFIRM | MARK_FAILED | RESTORE`, drapeaux `pending`/`failed`, PUR : aucun import React/DOM/Supabase/`Date`).
    ```ts
    export type StoreRotationState = RotationState & { pending?: boolean; failed?: boolean }
    export const DEFAULT_ROTATION_STATE: RotationState = {
      id: 'singleton', seed: 0, cursor: 0, mode: 'rotation-complete', updated_at: '',
    }
    ```
    > `DEFAULT_ROTATION_STATE.seed = 0` est un **placeholder** « aucune rotation persistée » ; le store ne **recalcule un schedule au montage que si une ligne existait** (`fetchRotationState() !== null`) — sinon `schedule` reste `null` (état initial inchangé). Documenter ce point dans le réducteur.
  - [x] Ajouter `reconcileRotationState(state, event)` à `lib/store/reconcile.ts` en **calquant `reconcileSetting`** (dédup `id`+`updated_at` AD-15, LWW serveur AD-16, no-op renvoie `state` à l'identique). Exporter le type `RotationStateChangeEvent` correspondant.
  - [x] Créer le test `daily-wheel/tests/rotation-state-reducer.unit.test.ts` en calquant `tests/settings-reducer.unit.test.ts` : cycle `OPTIMISTIC → CONFIRM`, `OPTIMISTIC → MARK_FAILED → RESTORE`, `HYDRATE(null) → DEFAULT`, `REALTIME` no-op vs application (AD-15/AD-16).

- [x] **T6 — Câblage store (UPDATE `lib/store/participants-store.tsx`) + SSR (UPDATE `app/page.tsx`)** (AC: 1, 2, 3, 4, 6)
  - [x] **Provider** : ajouter la prop `initialRotationState: RotationState | null` ; brancher `const [rotationState, dispatchR] = useReducer(rotationStateReducer, (initialRotationState ?? DEFAULT_ROTATION_STATE) as StoreRotationState)` + un `stateRefR` miroir (comme `stateRefS`).
  - [x] **`generate()` refactoré** (l. 655-679) : la **graine** ne doit plus être jetée. Deux chemins :
    - **nouveau tirage / relance** (action utilisateur via `setSchedule` neuf) : tirer `const seed = Math.floor(Math.random() * 0x100000000)` (Math.random AUTORISÉ ici, hors domaine — AD-2), `setSchedule(generateSchedule(input, createRng(seed)))`, **et persister** `{ seed, cursor: 0, mode }` (optimiste via la file d'écriture, voir ci-dessous). Conserver la graine courante dans le reducer/state (`rotationState.seed`).
    - **recalcul au montage / re-hydratation** (graine persistée existante) : recalculer **sans** nouvelle écriture → `setSchedule(replayRotation(input, rotationState.seed))` quand `rotationState.seed` provient d'une ligne hydratée. Voir §Hydratation en Dev Notes pour le « quand » (au montage si `initialRotationState !== null`, via le pattern « ajuster l'état pendant le rendu » déjà utilisé par `ScheduleResult`, **pas** un `useEffect` setState).
  - [x] **Setters exposés** (au `StoreValue`, AC-4/AC-6), tous **optimistes** via `runWrite` (file partagée, table-agnostique — fournir un `WriteSpec` avec `write: (pp) => writeRotationState(patch, pp)`, `onPending/onConfirm/onFailed` → `dispatchR`, `rollback` → `RESTORE` snapshot, `retryKey: 'rotation_state'`, `onConflictRehydrate` → `fetchRotationState`) :
    - `persistRotationCursor(cursor: number): void` — `OPTIMISTIC {cursor}` + write `{cursor}` ;
    - `persistRotationMode(mode): void` — `OPTIMISTIC {mode, cursor: 0}` + write `{mode, cursor: 0}` (reset au changement de mode, 5.5 AC-6) ;
    - `startRotation(): void` (le nouveau tirage : `generate()` + `OPTIMISTIC {seed, cursor:0, mode}` + write). *(Au choix du dev : intégrer dans `generate()` ou exposer à part — l'essentiel est que `generate()` persiste la graine.)*
  - [x] **Realtime** : ajouter un abonnement `.channel('rotation-state-rt')` sur `table: 'rotation_state'` calqué sur les autres ; à `SUBSCRIBED` (abonnement initial + reconnexions ~24 h, AD-6) → `fetchRotationState()` puis `dispatchR({ type:'HYDRATE', row })` ; sur event → `reconcileRotationState` via `dispatchR({type:'REALTIME', event})`. **Après une (re)hydratation qui change la graine, recalculer `schedule`** (même règle qu'au montage).
  - [x] **Exposer** dans `StoreValue` : `rotationState` (ou au moins `rotationCursor`, `rotationSeed`, `rotationMode`) + les setters ci-dessus, pour que `ScheduleResult` lise/écrive le curseur et le mode **persistés** au lieu de son state local.
  - [x] **`app/page.tsx`** : ajouter `fetchRotationState().catch((): RotationState | null => null)` au `Promise.all` SSR et passer `initialRotationState={…}` au provider (calqué sur `initialSettings`).

- [x] **T7 — Lever le curseur & le mode dans le store (UPDATE `components/ScheduleResult.tsx`)** (AC: 1, 4, 6, 7)
  - [x] **Remplacer le state local persistant par le store** : `revealedCount` (l. 44) et `mode` (l. 39) deviennent **lus depuis le store** (`rotationState.cursor` / `rotationState.mode`). **Rester LOCAUX** (éphémères, animation pure) : `spinNonce`, `busy`, `justRevealedDate`, `revealMessage`, `autoSpin`, `chainTimer`, `justPickedTimer`.
  - [x] **`handleRevealed`** (5.5) : après avoir avancé la révélation (logique 5.4/5.5 inchangée), **persister le curseur** :
    - **« Jour le jour »** : à **chaque** révélation → `persistRotationCursor(nextCount)` (c'est le cœur de la story : chaque jour de standup est persisté) ;
    - **« Rotation complète »** : **ne pas** persister à chaque ~600 ms ; persister **une seule fois** `persistRotationCursor(planningLen)` à la complétion (cf. AC-7 §Granularité).
  - [x] **`switchMode`** (5.5 AC-6) : appeler `persistRotationMode(next)` (qui remet `cursor: 0` et persiste) **en plus** du reset visuel local existant (timers annulés, roue repleine). Le plan n'est pas recalculé (5.5).
  - [x] **`handleSpin`** : le nouveau tirage / relance déclenche `generate()` (qui persiste désormais la graine + `cursor:0`). Inchangé par ailleurs.
  - [x] **Au montage** : `revealedCount`/`mode` venant du store **déjà hydraté** (SSR + recalcul graine), la roue s'affiche d'emblée au bon curseur (segments restants) et la timeline montre les jours déjà révélés — **sans** re-spin (pas d'`autoSpin` sur une reprise ; n'amorcer un spin auto que pour un **nouveau** tirage). Vérifier que `clampCursor` borne un curseur périmé.
  - [x] Mettre à jour le **commentaire d'en-tête** (l. 29-30) : la révélation **n'est plus** « locale et éphémère » — le **curseur et le mode sont désormais persistés (Story 5.6)** ; seuls `spinNonce`/`busy`/halo/`revealMessage` restent locaux.

- [x] **T8 — Vérification finale & non-régression** (AC: 5, 7, 9)
  - [x] `cd daily-wheel && npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur.
  - [x] `npm run test` (ou `npx vitest run`) → **toute** la suite verte : golden, domaine, `wheel`/`timeline`/`spin-mode` **inchangés** (AC-7), + nouveaux `rotation-resume` & `rotation-state-reducer`.
  - [x] `npm run build` → OK.
  - [x] **Migration** : appliquer via `supabase db push` (AD-13) si l'env CLI est branché ; sinon documenter dans les Completion Notes qu'elle reste à appliquer (SQL editor). **Sans la table, les fetchs retombent sur `null`/`catch` → l'app fonctionne en dégradé (pas de reprise)** : vérifier qu'aucune erreur n'est levée si la table est absente (le `.catch` SSR + `maybeSingle` doivent absorber).
  - [x] **Contrôle navigateur recommandé en passe humaine** (pas de tests de composant React dans ce projet) : (a) tirer en « Jour le jour », révéler 2 jours → **recharger** → reprise aux 2 mêmes jours, roue sans les 2 révélés ; (b) ouvrir un **2ᵉ navigateur** → même curseur ; (c) « Relancer » → nouvelle graine, curseur 0, persisté ; (d) changer de mode → curseur 0 persisté ; (e) première écriture → **prompt passphrase** (puis mémorisé) ; (f) sous `prefers-reduced-motion`, reprise sans animation.

## Dev Notes

### État actuel — ce que 5.6 fait évoluer
- **`schedule` est aujourd'hui ÉPHÉMÈRE** (`participants-store.tsx:138-141, 190-191`) : « calcul client pur, jamais persisté ni hydraté. Un rechargement efface le résultat (attendu) ». `generate()` (l. 655-679) **tire une graine `Math.random()` (l. 677) puis la JETTE** — c'est précisément ce qu'il faut **conserver et persister**.
- **`revealedCount` et `mode` sont LOCAUX à `ScheduleResult`** (`ScheduleResult.tsx:39, 44`) et le commentaire d'en-tête (l. 29-30) annonce explicitement : « L'état de révélation reste LOCAL et éphémère (la persistance « jour le jour » est l'objet de 5.6) ». 5.6 **lève** `seed`/`cursor`/`mode` dans le store et les **persiste** ; les états d'animation restent locaux.
- **Aucune table de rotation n'existe** (migration `20260622121017_init_schema.sql` : 6 tables seulement). 5.6 en ajoute une 7ᵉ, **singleton**.

### Décision d'architecture (flag #2) — TRANCHÉE & TRACÉE
**Question** : où et comment persister la rotation (graine + curseur) pour qu'elle survive reload et changement de poste ?

**Décision retenue : table Supabase singleton dédiée `rotation_state`, écrite via le proxy `/api/rotation_state` (AD-14), lue low-privilege + Realtime.**

**Pourquoi (décisif)** : l'AC-1 (`epics.md:494`) exige la reprise *« depuis un autre navigateur »*. Cela **élimine** toute solution locale. Et AD-4 pose Supabase comme **source canonique de l'état partagé** (FR13). La rotation partagée DOIT donc vivre en base, sous le contrat d'écriture existant (AD-7/AD-8/AD-14).

**Pourquoi une table DÉDIÉE plutôt qu'étendre `settings`** (alternative viable mais rejetée) :
- **Cohésion** : `settings` = **options de génération durables** (skip_weekends, start_date, préférences utilisateur) ; `rotation_state` = **progression runtime transitoire** d'un tirage. Les mélanger brouille l'allowlist et surtout la **sémantique de reset** (AC-4 : relancer réinitialise graine+curseur **sans** toucher les options).
- **AD-14** = une route par table → une route + une allowlist propres.
- **Coût** : +1 migration, +1 route, +1 module data, +1 réducteur — toutes **calquées 1:1** sur l'existant `settings` (faible risque, patrons éprouvés Story 4.1).

**Alternatives rejetées** :
- **`localStorage`/`sessionStorage`** — *rejetée* : ne franchit ni navigateur ni poste (échoue AC-1). Le projet n'utilise le `sessionStorage` que pour la **passphrase** (`use-write-queue.ts:14-28`), volontairement non partagée.
- **Étendre `settings` de 3 colonnes** (`rotation_seed`, `rotation_cursor`, `rotation_mode`) — *rejetée* (cohésion/reset ci-dessus), mais **repli acceptable** si l'architecte préfère minimiser la surface SQL : la mécanique store/route est identique, seules la table et l'allowlist changent. À acter en §Questions.
- **Sérialiser le `planning` figé en base** — *rejetée par l'AC-2* (non reproductible, périme dès qu'une contrainte bouge ; on persiste **graine+curseur**, pas le résultat).

### Conséquence passphrase (AC-6) — assumée
Persister = **écrire** = passphrase (AD-8). Donc : **révéler un jour est une écriture**. La **première** révélation/relance d'une session déclenche le **prompt passphrase paresseux** existant (`useWriteQueue`, mémorisé `sessionStorage`, un seul prompt pour toutes tables). C'est **cohérent** avec le modèle de protection (5.1, bandeau « 🔒 Équipe protégée ») : la personne qui anime le standup détient la passphrase. **Ne pas** contourner ce contrat (pas d'écriture client-direct, AD-7). Si une révélation **sans** passphrase doit rester possible en lecture seule, c'est une **question produit** (voir §Questions) — par défaut, on suit AD-8.

### Granularité d'écriture (AC-7) — éviter le spam Realtime
- **« Jour le jour »** : 1 révélation = 1 standup = **1 écriture** `{cursor: n}`. C'est voulu (chaque jour franchi doit survivre).
- **« Rotation complète »** : l'enchaînement révèle tout en ~quelques secondes ; **NE PAS** écrire à chaque ~600 ms. Écrire **une seule fois** `{cursor: planningLen}` à la complétion (et `{seed, cursor:0}` au départ). Sous `prefers-reduced-motion` (option A de 5.5, délai 0 ms), idem : une écriture finale, pas une par tick.
- **Optimiste** : l'UI avance le curseur **immédiatement** (révélation instantanée) ; l'écriture part en arrière-plan (AD-5) ; l'écho Realtime est dédupliqué (AD-15) — pas de clignotement.

### Hydratation & recalcul du schedule (pièges)
- **Au montage** : `app/page.tsx` SSR `initialRotationState`. Si **non `null`** et `seed` issu d'une vraie ligne → recalculer `schedule = replayRotation(buildInput(), seed)` et exposer `cursor`/`mode`. Si `null` → `schedule` reste `null` (comportement initial inchangé), `seed=0` placeholder, **aucun** recalcul.
- **Le recalcul utilise les ENTRÉES COURANTES** (participants/contraintes hydratés). À entrées inchangées ⇒ planning identique (NFR7). Si elles ont changé depuis la session précédente ⇒ planning potentiellement différent → **hors périmètre 5.6**, c'est le **nudge de 5.9**. Ne PAS tenter de détecter/avertir ici.
- **Pas de setState-in-`useEffect`** pour amorcer : réutiliser le pattern « ajuster l'état pendant le rendu » déjà présent dans `ScheduleResult` (l. 54-67, garde-fou 5.5). Le recalcul de `schedule` au montage côté store doit suivre le même esprit (le projet évite délibérément les boucles setState/effect).
- **Ne pas re-spinner sur une reprise** : à la reprise, on AFFICHE le curseur (roue avec restants, timeline remplie) ; on n'anime PAS les jours déjà révélés. N'armer `autoSpin` que pour un **nouveau** tirage utilisateur.
- **`clampCursor`** borne un curseur persisté devenu invalide (ex. planning plus court après changement d'entrées) → jamais de débordement.
- **Realtime + graine** : si une autre session relance (nouvelle graine), l'écho Realtime change `rotationState.seed` → le store doit **recalculer** `schedule` et l'UI refléter la nouvelle rotation (LWW, AD-16). Tester ce chemin en passe humaine (2 navigateurs).

### Contrats à NE PAS casser (sacré — AC-7)
- **Domaine** `lib/domain/schedule.ts`, `lib/domain/rng.ts` : **zéro** modification (la graine est tirée dans le store, AD-2). `generateSchedule(input, rng)` inchangé.
- **`lib/ui/wheel.ts`, `lib/ui/timeline.ts`, `lib/ui/spin-mode.ts`** : inchangés. `replayRotation` est un **nouveau** voisin, il ne modifie pas les existants.
- **`SpinWheel.tsx`, `ScheduleTimeline.tsx`** : contrats de props inchangés (5.6 ne touche que `ScheduleResult` qui les pilote).
- **Orchestration 5.5** (`spin-mode.ts` + `ScheduleResult` enchaînement/labels/reset/reduced-motion) : **préservée**. 5.6 lit `cursor`/`mode` depuis le store au lieu du local, et ajoute des écritures sur les transitions — la mécanique d'animation est identique.
- **Tests golden / domaine / wheel / timeline / spin-mode** : **verts sans modification** (NFR9, AD-12).
- **Périmètre 4.3** (compteur de sessions, avertissement non-planifiés, états vides) : inchangé.

### Conventions & structure (rappel architecture-spine)
- **Couches** (`ARCHITECTURE-SPINE.md:40-46`) : UI → state → data → domaine pur. `rotation_state` suit la chaîne **data (`lib/data/`) → store (`lib/store/`) → UI (`components/`)** ; `lib/data/` est le **seul** point de contact Supabase (AD-11) ; aucune écriture client-direct (AD-7).
- **Convention « settings = singleton + upsert »** (`ARCHITECTURE-SPINE.md:191`) : `rotation_state` la **réutilise telle quelle** (id `'singleton'`, op `upsert`, jamais d'insert multiple).
- **Dates** : non concerné (pas de colonne date métier ; `updated_at` reste une **chaîne ISO**, jamais `Date` — convention).
- **Nommage** : table/colonnes en `snake_case` (`rotation_state`, `seed`, `cursor`, `mode`, `updated_at`) ; types TS en `camelCase`/`PascalCase`.
- **Tests** = Vitest ; **aucun test de composant React** dans ce projet → la couverture 5.6 porte sur le **pur** (`rotation-resume`) + le **réducteur** (`rotation-state-reducer`) ; l'intégration (hydratation, reprise multi-navigateur, passphrase) est validée par **contrôle navigateur humain** (T8) + tsc/eslint/build.
- **Stack** (inchangée) : Next 16.2 (App Router), React 19.2, @supabase/supabase-js 2.108, TS 5.1+, Node 20.9+, Supabase Postgres+Realtime, Vercel. `runtime = 'nodejs'` sur la route (comme les 6 existantes).

### Project Structure Notes
- **NEW** `daily-wheel/supabase/migrations/<ts>_add_rotation_state.sql` — 7ᵉ table singleton + RLS + Realtime (calque init).
- **NEW** `daily-wheel/lib/ui/rotation-resume.ts` (pur) — `replayRotation` + `clampCursor`.
- **NEW** `daily-wheel/tests/rotation-resume.unit.test.ts` — rejouabilité (AC-5).
- **NEW** `daily-wheel/lib/data/rotation-state.ts` — calque `lib/data/settings.ts` (fetch + write).
- **NEW** `daily-wheel/app/api/rotation_state/route.ts` — calque `app/api/settings/route.ts` (op `upsert`, allowlist `seed/cursor/mode`).
- **NEW** `daily-wheel/lib/store/rotation-state-reducer.ts` — calque `lib/store/settings-reducer.ts` (singleton, optimiste).
- **NEW** `daily-wheel/tests/rotation-state-reducer.unit.test.ts` — calque `tests/settings-reducer.unit.test.ts`.
- **UPDATE** `daily-wheel/lib/store/reconcile.ts` — ajoute `reconcileRotationState` (+ type event) calqué sur `reconcileSetting`.
- **UPDATE** `daily-wheel/lib/store/participants-store.tsx` — provider prop `initialRotationState`, reducer + ref miroir, `generate()` persiste la graine, setters `persistRotationCursor/Mode`, abonnement Realtime `rotation-state-rt`, recalcul schedule au montage/hydratation, exposition au `StoreValue`.
- **UPDATE** `daily-wheel/app/page.tsx` — fetch SSR `fetchRotationState` + prop provider.
- **UPDATE** `daily-wheel/components/ScheduleResult.tsx` — `cursor`/`mode` lus du store + persistés sur transitions ; animation locale conservée ; commentaire d'en-tête mis à jour.
- **Périmètre transverse** (data + api + store + UI + SQL) : 5.6 est **plus large** que 5.5 (UI pure). C'est attendu (flag archi #2). Garder chaque couche dans son rôle (AD-11/AD-7).

### References
- [Source: epics.md#Story 5.6 (l. 485-501)] — AC source : reprise au curseur, graine+curseur (pas figé), contrat d'écriture, reset, test de rejouabilité, ⚠ décision d'archi.
- [Source: epics.md#Epic 5 (l. 396-398)] — principe directeur : `generateSchedule` source de vérité, la roue met en scène.
- [Source: ARCHITECTURE-SPINE.md — AD-2 (l. 75-79)] — aléa injecté/seedable `rng: () => number`, seed aléatoire en prod, déterminisme NFR7.
- [Source: ARCHITECTURE-SPINE.md — AD-4 (l. 90-94)] — Supabase = source canonique de l'état (justifie la persistance serveur).
- [Source: ARCHITECTURE-SPINE.md — AD-5/AD-6/AD-15/AD-16 (l. 96-110, 163-173)] — optimiste + Realtime + dédup `id`+`updated_at` + LWW.
- [Source: ARCHITECTURE-SPINE.md — AD-7/AD-8 (l. 112-125)] — lectures low-privilege / écritures via proxy + passphrase.
- [Source: ARCHITECTURE-SPINE.md — AD-14 (l. 157-161) + convention « settings singleton/upsert » (l. 191)] — contrat d'écriture, une route par table, allowlist ; patron singleton.
- [Source: ARCHITECTURE-SPINE.md — AD-17 (l. 175-183)] — taxonomie d'erreurs 401/400/409/5xx.
- [Source: lib/data/settings.ts] — patron data singleton à calquer (fetch maybeSingle + write upsert).
- [Source: app/api/settings/route.ts] — patron route à calquer (op upsert, garde passphrase, id forcé, updated_at serveur, mapping erreurs).
- [Source: lib/store/settings-reducer.ts] — patron réducteur singleton optimiste (HYDRATE/REALTIME/OPTIMISTIC/CONFIRM/MARK_FAILED/RESTORE).
- [Source: lib/store/use-write-queue.ts (WriteSpec, runWrite, l. 1-80)] — file d'écriture table-agnostique à réutiliser (un seul prompt passphrase).
- [Source: lib/store/participants-store.tsx (generate l. 655-679 ; provider l. 154-208 ; abonnement Realtime l. 683-699)] — points d'ancrage du câblage.
- [Source: app/page.tsx] — patron SSR `Promise.all` + props provider à étendre.
- [Source: components/ScheduleResult.tsx (l. 29-30, 39, 44, 54-67)] — état local à lever ; pattern « ajuster pendant le rendu ».
- [Source: lib/domain/schedule.ts, lib/domain/rng.ts] — `generateSchedule(input, rng)` + `createRng(seed)` (mulberry32) réutilisés SANS modification.
- [Source: supabase/migrations/20260622121017_init_schema.sql] — patron RLS + Realtime + REPLICA IDENTITY FULL à répliquer.
- [Source: 5-5-deux-modes-rotation-complete-jour-le-jour.md (AC-11)] — différé explicite de la persistance vers 5.6 (continuité).

### Questions ouvertes (pour Solo / l'architecte, avant `dev-story`)
1. **Décision d'archi (flag #2)** — On retient la **table dédiée `rotation_state`** (recommandé). Valides-tu, ou préfères-tu le **repli « 3 colonnes sur `settings` »** (moins de surface SQL, couplage cohésion) ? *(1 décision ; bascule la T1/T3/T4 mais pas le reste.)*
2. **Passphrase à la révélation** — Conséquence assumée : la **1ʳᵉ révélation/relance** d'une session prompte la passphrase (écriture, AD-8). OK ? Ou faut-il un mode « lecture seule » où révéler n'écrit pas (à spécifier — par défaut on suit AD-8) ?
3. **Persistance en « Rotation complète »** — On persiste **graine au départ + curseur final à la complétion** (pas par tick). La reprise d'une rotation complète rouvre donc la timeline pleine. OK, ou la persistance doit-elle être **scopée au seul « Jour le jour »** (la rotation complète restant éphémère) ? *(AC-1 vise « Jour le jour » ; persister les deux est uniforme et peu coûteux — recommandé.)*

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer) — Opus 4.8 (1M context). TDD red→green→refactor.

### Debug Log References

- `npx vitest run tests/rotation-resume.unit.test.ts` → RED (module `@/lib/ui/rotation-resume` absent) puis GREEN (9/9).
- `npx vitest run tests/rotation-state-reducer.unit.test.ts` → GREEN (15/15).
- Suite unitaire complète (hors intégration Supabase) : `npx vitest run tests/*.unit.test.ts tests/schedule.golden.test.ts` → **320/320 verts** (25 fichiers ; +24 vs 5.5 = 9 rotation-resume + 15 rotation-state-reducer ; golden 2/2, wheel/timeline/spin-mode INTACTS → zéro régression).
- `npx tsc --noEmit` → 0 erreur ; `npx eslint .` → 0 erreur ; `npm run build` → OK (10 routes, dont la NOUVELLE `/api/rotation_state`).

### Completion Notes List

- **Décision d'archi (flag #2) — appliquée** : persistance **serveur Supabase** via la table singleton dédiée **`rotation_state`** (graine + curseur + mode), proxy gardé par passphrase (`/api/rotation_state`, op `upsert`, AD-14), lecture low-privilege + Realtime (AD-6/AD-15/AD-16). État local **rejeté** (AC-1 exige la reprise multi-navigateur). **Défauts retenus** (confirmés par Solo en lançant dev-story) : (1) table dédiée ; (2) passphrase à la 1ʳᵉ écriture/révélation selon AD-8 ; (3) persistance **uniforme des deux modes** (graine au départ + curseur final en « Rotation complète », curseur à chaque révélation en « Jour le jour »).
- **On persiste un mécanisme reproductible, jamais le planning figé (AC-2)** : `schedule` est **recalculé** via `generateSchedule(input, createRng(seed))` (déterminisme NFR7) au montage (lazy initializer du store si une graine est persistée) et à la re-synchro Realtime — jamais sérialisé en base.
- **`seed` NULLABLE** (décision d'implémentation) : `null` = aucune rotation tirée. Permet de persister le **mode seul** avant tout tirage (changement d'onglet) sans violer une contrainte `NOT NULL`, et sert de **marqueur de reprise** (on ne recalcule que si `seed != null`).
- **Câblage store** : `mode` + `cursor` deviennent **possédés par le store** (`rotation_state`) ; `ScheduleResult` LIT `rotationMode` et initialise son curseur d'animation local depuis `rotationCursor`. L'**orchestration 5.5** (enchaînement ~600 ms, libellés, reduced-motion) est **inchangée** ; seuls `spinNonce`/`busy`/halo/`revealMessage` restent locaux.
- **Granularité d'écriture (AC-7)** : persistance sur transitions délibérées uniquement — `generate()` (graine + curseur 0), `switchMode` (mode + curseur 0), et la **branche `else` de `handleRevealed`** (qui couvre exactement : chaque révélation en « Jour le jour », et le **seul** curseur final en « Rotation complète » — l'enchaînement ne persiste pas par ~600 ms).
- **Synchro inter-clients** : 7ᵉ abonnement Realtime `rotation-state-rt` ; recalcul du `schedule` **uniquement si la graine change** (un écho de curseur/mode garde la même graine → pas de réinitialisation intempestive de la vue locale).
- **Garde-fou `clampCursor`** : un curseur persisté périmé (entrées changées entre sessions → planning plus court ; relève de 5.9) est **borné** côté store (reprise) et côté `ScheduleResult` (pattern « ajuster pendant le rendu »), sans débordement roue/timeline.
- **Dégradation gracieuse** : si la migration n'est pas encore appliquée, `fetchRotationState()` échoue → `.catch → null` (SSR + abonnement) → l'app fonctionne **sans reprise**, aucun crash.
- **Frontière de reproductibilité (documentée)** : la reprise est identique **à entrées inchangées**. Si `settings.start_date` est `null` (défaut « aujourd'hui »), la date de référence est un input implicite : la reprise est identique **le même jour** ; pour une rotation pluri-jours stable, une `start_date` explicite (déjà persistée dans `settings`) garantit l'identité. Le cas « entrées changées » relève du **nudge 5.9** (hors périmètre).
- **Différés intacts (AC-8)** : exports 5.7, gel microcopie/branding 5.8, popover + **nudge « relancer la roue »** + détection de changement de contraintes 5.9.
- **Note review/passe humaine** : aucun test de composant React dans ce projet → l'intégration (reprise après reload, 2ᵉ navigateur, prompt passphrase, recalcul Realtime) est validée par tsc/eslint/build + cœur pur testé (rejouabilité) + reducer testé ; un **contrôle navigateur** et l'**application de la migration** (`supabase db push`) restent recommandés (cf. T8).
- **Suivi optionnel** : aucun `tests/rotation_state.write.integration.test.ts` ajouté (nécessite un Supabase live + passphrase ; la liste `test:unit` du `package.json` n'étant déjà plus maintenue pour les tests 5.x, elle n'a pas été modifiée). Un test d'intégration d'écriture pourrait être ajouté pour la parité avec les 6 autres tables si un env de test est branché.

### File List

- `daily-wheel/supabase/migrations/20260624120000_add_rotation_state.sql` (NEW) — 7ᵉ table singleton `rotation_state` (seed nullable, cursor, mode) + RLS lecture publique + Realtime + REPLICA IDENTITY FULL.
- `daily-wheel/lib/ui/rotation-resume.ts` (NEW) — cœur pur : `replayRotation(input, seed)` + `clampCursor`.
- `daily-wheel/tests/rotation-resume.unit.test.ts` (NEW) — 9 tests (rejouabilité AC-5 + clamp).
- `daily-wheel/lib/data/rotation-state.ts` (NEW) — couche data singleton (`fetchRotationState`, `writeRotationState`).
- `daily-wheel/app/api/rotation_state/route.ts` (NEW) — proxy d'écriture passphrase (op `upsert`, allowlist seed/cursor/mode, validation défensive).
- `daily-wheel/lib/store/rotation-state-reducer.ts` (NEW) — réducteur scalaire optimiste + `DEFAULT_ROTATION_STATE`.
- `daily-wheel/tests/rotation-state-reducer.unit.test.ts` (NEW) — 15 tests (réducteur + reconcileRotationState AD-15/AD-16).
- `daily-wheel/lib/store/reconcile.ts` (UPDATE) — ajout `reconcileRotationState` + `RotationStateChangeEvent`.
- `daily-wheel/lib/store/participants-store.tsx` (UPDATE) — prop `initialRotationState`, reducer + ref miroir, `buildScheduleInput` extrait, `generate()` persiste la graine, `persistRotationCursor`/`persistRotationMode`, 7ᵉ abonnement Realtime + recalcul sur changement de graine, reprise au montage, exposition `rotationCursor`/`rotationMode`.
- `daily-wheel/app/page.tsx` (UPDATE) — fetch SSR `fetchRotationState` + prop `initialRotationState`.
- `daily-wheel/components/ScheduleResult.tsx` (UPDATE) — `mode`/curseur lus du store + persistés aux points de contrôle ; init du curseur local depuis le curseur persisté ; garde `clampCursor` ; commentaire d'en-tête mis à jour. Animation locale conservée.

### Change Log

- 2026-06-24 — Story 5.6 implémentée (Amelia/dev-story) : in-progress → review. Persistance serveur de la rotation via table singleton `rotation_state` (graine nullable + curseur + mode), proxy passphrase `/api/rotation_state` (op upsert, AD-14), data + reducer + reconcile calqués 1:1 sur `settings`, 7ᵉ abonnement Realtime (recalcul du schedule sur changement de graine), reprise au montage (recalcul déterministe NFR7 depuis la graine, jamais figé), curseur/mode levés dans le store et lus par `ScheduleResult` (orchestration 5.5 intacte), granularité d'écriture maîtrisée (jour-le-jour = chaque révélation ; complète = curseur final), garde `clampCursor`, dégradation gracieuse si migration absente. +24 tests (9 rejouabilité + 15 reducer) ; tsc 0 / eslint 0 / 320 tests unitaires / build OK (route `/api/rotation_state`). Domaine/wheel/timeline/spin-mode/SpinWheel/golden INTACTS.
- 2026-06-24 — Story 5.6 contextée (Amelia/create-story) : backlog → ready-for-dev. Décision d'archi (flag #2) tranchée : persistance SERVEUR Supabase via table singleton dédiée `rotation_state` (proxy passphrase AD-14, Realtime AD-6/AD-15, LWW AD-16) — état local rejeté car AC-1 exige la reprise multi-navigateur. Persiste graine+curseur(+mode), recalcul déterministe (NFR7) ; jamais de planning figé. Périmètre transverse (migration + route + data + reducer + store + page + ScheduleResult) calqué 1:1 sur le patron `settings`. Domaine/wheel/timeline/spin-mode/SpinWheel/golden INTACTS ; orchestration 5.5 préservée. 3 questions ouvertes (table dédiée vs colonnes settings ; passphrase à la révélation ; scope complète vs jour-le-jour).
