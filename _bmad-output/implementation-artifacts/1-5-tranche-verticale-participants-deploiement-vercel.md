---
baseline_commit: 68fd030cc19f9090bd7028f6282a5181f9da0e25
---

# Story 1.5: Tranche verticale « participants » partagée + déploiement Vercel

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a membre de l'équipe,
I want ajouter et voir la liste des participants depuis n'importe quel poste via l'URL en ligne, l'état se synchronisant en temps réel entre clients,
so that l'état est réellement partagé (FR13) et l'application accessible sans installation (NFR1) — clôturant Epic 1 par une preuve bout-en-bout de l'ossature lecture (1.3) + écriture gardée (1.4).

## Acceptance Criteria

> Les AC ci-dessous décomposent les 6 critères de l'epic (epics.md#Story-1.5) en unités implémentables et testables. Ils câblent ensemble tout ce qui a été posé en 1.1→1.4 : la couche **state** (`lib/store/`, vide jusqu'ici), l'**UI** (`components/`, `app/page.tsx`), la **CI** et le **déploiement Vercel**.

1. **Réducteur de réconciliation PUR `lib/store/reconcile.ts` (cœur testable — AD-15, AD-16).** Une fonction pure `reconcileParticipants(state: Participant[], event): Participant[]` applique un événement Realtime `postgres_changes` à la copie de travail :
   - `INSERT` / `UPDATE` : upsert par `id`. Si la ligne existe déjà **avec le même `id` ET le même `updated_at`** → l'événement est **ignoré** (écho de sa propre écriture déjà appliquée, AD-15). Sinon, **Last-Write-Wins ordonné par `updated_at`** : la ligne entrante n'écrase la locale **que si** son `updated_at` est `>=` (chaîne ISO comparable lexicographiquement) à celui de la locale (AD-16).
   - `DELETE` : retire la ligne par `id` (`event.old.id`).
   - Fonction **pure** (aucun accès store/réseau/`Date`), exportée et testée unitairement **sans réseau ni env**. [Source: ARCHITECTURE-SPINE.md#AD-15 ; #AD-16 ; #AD-6 ; epics.md#Story-1.5]

2. **Provider + hook de store client `lib/store/participants-store.tsx` (`'use client'`).** Un provider React (`useReducer`) :
   - **Hydrate** l'état initial depuis une prop `initial: Participant[]` (fournie en SSR par `app/page.tsx`, AC8) — pas de flash de chargement.
   - **S'abonne** au canal Realtime `postgres_changes` (`event: '*'`, `schema: 'public'`, `table: 'participants'`) via `supabasePublic` (clé low-privilege, AD-7) ; chaque événement passe par `reconcileParticipants` (AC1).
   - **Se re-hydrate à chaque `SUBSCRIBED`** (abonnement initial **et** reconnexions — les connexions publiques tombent ~24 h) : appelle `fetchParticipants()` (1.3) et remplace l'état (AD-6). Désabonnement propre au démontage (`removeChannel`).
   - Expose un hook `useParticipants()` → `{ participants, addParticipant, … }`. Aucun composant ne fait `supabase.from(...)` ni `fetch('/api/...')` en direct — tout transite par le store → `lib/data/` (AD-11). [Source: ARCHITECTURE-SPINE.md#AD-4 ; #AD-6 ; #AD-7 ; #AD-11 ; tests/realtime.integration.test.ts]

3. **Ajout optimiste + réconciliation de l'id serveur (AD-5, AD-15).** `addParticipant(name)` :
   - Insère **immédiatement** une ligne optimiste dans le store avec un **id temporaire** (préfixé, ex. `temp:<n>`) et `active: true` (état `pending`).
   - Appelle `writeParticipant('insert', { data: { name } }, passphrase)` (1.4, `lib/data/`).
   - **Succès** : remplace la ligne temp par la **ligne retournée par le serveur** (id réel + `updated_at` réel) → l'écho Realtime de ce même `id`+`updated_at` est ensuite dédupliqué par AC1 (pas de doublon).
   - **Le nom est trimé** ; un nom vide après trim n'émet aucune écriture. (Le découpage multi-noms `,`/`;` est **hors-scope** — FR1/Story 2.1 ; ici **un** participant par ajout.) [Source: ARCHITECTURE-SPINE.md#AD-5 ; #AD-15 ; epics.md#Story-1.5 ; epics.md#Story-2.1 (hors-scope)]

4. **Consommation de la taxonomie d'erreurs d'écriture (AD-17).** Sur échec de `writeParticipant` (un `WriteError` typé est levé — 1.4), le store réagit **selon `error.kind`** :
   - `auth` (401) : **ne pas** rollback silencieusement ; passer l'item en attente d'authentification, **re-prompt** la passphrase (AC5), puis **rejouer** l'écriture une fois une passphrase saisie.
   - `validation` (400) : **rollback** de la ligne optimiste + message d'erreur français.
   - `conflict` (409) : **re-hydrater** (`fetchParticipants()`) puis laisser l'état serveur faire autorité (AD-16).
   - `transient` (5xx) : **retry** possible (au moins un re-essai ou un bouton « réessayer »), l'optimiste reste affiché entre-temps.
   [Source: ARCHITECTURE-SPINE.md#AD-17 ; #AD-16 ; lib/data/participants.ts (WriteError/kind)]

5. **Saisie de la passphrase d'équipe côté client (AD-8 consommation).** La passphrase requise par le proxy d'écriture est **collectée dans l'UI** (jamais une variable `NEXT_PUBLIC_`) :
   - Demandée **paresseusement** (au 1er ajout si absente) via un champ dédié ; conservée en mémoire + `sessionStorage` (persiste au rechargement **dans l'onglet**, pas au-delà).
   - Un `401` (AC4) **efface** la passphrase mémorisée et **re-prompt**.
   - La passphrase n'est **jamais** loggée ni rendue dans le DOM en clair (champ `type="password"`). [Source: ARCHITECTURE-SPINE.md#AD-8 ; #AD-10 ; #AD-17]

6. **UI de la carte Participants (`components/`) — charte, français, responsive.** La carte Participants de `app/page.tsx` devient interactive :
   - Un **formulaire d'ajout** : `<input>` (nom) + bouton « Ajouter » ; soumission au clic **et** à la touche Entrée ; champ vidé après ajout.
   - La **liste** des participants (nom ; indicateur visuel `inactif` si `active === false` — grisé/barré, réutilisable Epic 2) ; l'**état vide** existant (« Aucun participant… ») s'affiche quand la liste est vide.
   - Les lignes `pending` (optimiste non confirmé) ont un retour visuel discret (opacité). Tout en **français** (NFR4), conforme à la **charte CSS existante** (`globals.css` : `--primary #0078d4`, cartes, `--radius-sm`, **sans dégradés**) — étendre `globals.css`, **ne pas** introduire Tailwind ni lib UI. Reste lisible **≤ 520 px** (NFR5, UX-DR7). [Source: epics.md#Story-1.5 ; PRD §3 UX-DR1/DR3/DR7 ; daily-wheel/app/globals.css]

7. **Headers de sécurité `next.config.ts` (dette différée 1.1 → production).** `next.config.ts` définit `async headers()` appliquant à toutes les routes : `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Permissions-Policy` restrictive (caméra/micro/géoloc off). **CSP complète différée** (nonces Next requis — risque de casse). [Source: deferred-work.md (« headers de sécurité next.config.ts → Story 1.5 ») ; nextjs.org/docs — next.config.js/headers]

8. **`app/page.tsx` : SSR de l'état initial, rendu dynamique.** `app/page.tsx` (Server Component) appelle `fetchParticipants()` (1.3, via `supabasePublic` — fonctionne aussi côté serveur) et passe le résultat en `initial` au provider client (AC2), qui enveloppe la carte Participants. La page est **dynamique** (`export const dynamic = 'force-dynamic'`) : l'état est live et partagé, **pas** de prérendu statique. Les cartes Options/Résultat **restent inchangées** (hors-scope). [Source: ARCHITECTURE-SPINE.md#Structural-Seed ; #AD-4 ; nextjs.org/docs — dynamic rendering]

9. **`npm test` global + harnais Vitest non-flaky (AD-13, dette 1.4).** Ajouter le script `"test": "vitest run --no-file-parallelism"` (le `--no-file-parallelism` neutralise la **contention parallèle** des tests live documentée en 1.3/1.4). `npm test` exécute **tous** les fichiers de test : les tests **purs** (mapping `WriteError` 1.4 + réconciliation AC10) tournent partout ; les tests **live env-gated** (`read`/`realtime`/`write`) se **skippent proprement** sans secrets (ex. en CI). Les scripts dédiés `test:read|realtime|write|unit` **restent** pour la vérif locale. [Source: ARCHITECTURE-SPINE.md#AD-13 ; 1-4-*.md#gotcha-1.5 (contention) ; 1-3-*.md#Completion-Notes]

10. **Preuve de test — réconciliation pure (rouge → vert).** `tests/reconcile.unit.test.ts` (pur, sans réseau ni env, enrôlé dans `npm test`) couvre `reconcileParticipants` :
    - `INSERT` d'une ligne nouvelle → ajoutée ; `INSERT`/`UPDATE` d'un `id` déjà présent **avec même `updated_at`** → état **inchangé** (dédup écho, AD-15).
    - `UPDATE` avec `updated_at` **plus récent** → ligne mise à jour ; avec `updated_at` **plus ancien** → **ignoré** (LWW, AD-16).
    - `DELETE` → ligne retirée par `id`.
    Rouge d'abord (fonction absente), puis vert. [Source: ARCHITECTURE-SPINE.md#AD-15 ; #AD-16 ; 1-4-*.md#Testing-standards]

11. **Déploiement Vercel + CI gate (NFR1, AD-13) — livrables code + checklist ops.** 
    - **Code (dans le repo) :** un workflow GitHub Actions `.github/workflows/ci.yml` (à la **racine du repo**) qui, sur `push`/`pull_request`, installe et teste l'app **dans `daily-wheel/`** : `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`. Node **20.x** (Stack ; Next 16 impose Node 20.9+). **Pas** de secrets Supabase en CI → les tests live se skippent, le gate repose sur lint + typecheck + tests purs (le `npm run build` réel est validé par Vercel avec les vraies env).
    - **Ops (guidé, hors-repo) :** documenter dans les Completion Notes la checklist à exécuter par l'utilisateur sur Vercel/GitHub : (a) connecter le repo GitHub `Infinter/SpinThatWeeklyWheel` à Vercel, **Root Directory = `daily-wheel`** ; (b) renseigner les 4 variables d'env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` côté client ; `SUPABASE_SECRET_KEY`, `TEAM_PASSPHRASE` côté serveur — **aucune** en `NEXT_PUBLIC_` pour les secrètes) ; (c) **conditionner le déploiement de production aux tests verts** via une branch protection sur `main` exigeant le check CI (NFR1 « intégration Git continue » conservée, AD-13). [Source: ARCHITECTURE-SPINE.md#AD-13 ; #AD-10 ; #Stack ; epics.md#Story-1.5 ; .env.example ; MEMORY:git-remote-push-setup]

## Tasks / Subtasks

> ⚠️ **Toutes les commandes et tous les chemins de code sont sous `daily-wheel/`** (variance structurelle héritée 1.1→1.4). Le workflow CI (`.github/workflows/`) est la **seule** exception : il vit à la **racine du repo**.

- [x] **Tâche 1 — Réducteur de réconciliation pur + test rouge** (AC: 1, 10)
  - [x] Écrire d'abord `daily-wheel/tests/reconcile.unit.test.ts` (rouge : fonction absente) couvrant INSERT nouveau, dédup `id`+`updated_at`, LWW (UPDATE plus récent appliqué / plus ancien ignoré), DELETE.
  - [x] Créer `daily-wheel/lib/store/reconcile.ts` : `reconcileParticipants(state, event)` pur. Définir un type d'événement minimal (`{ eventType: 'INSERT'|'UPDATE'|'DELETE', new?: Participant, old?: { id: string } }`) mappé depuis le payload `postgres_changes`. Aucune dépendance React/Supabase/`Date`.
  - [x] Vert : `npm run test:unit` (ou cible dédiée) puis `npm test`.

- [x] **Tâche 2 — Store client : provider + hook + Realtime + hydratation** (AC: 2, 3, 4)
  - [x] Créer `daily-wheel/lib/store/participants-store.tsx` (`'use client'`) : `useReducer` sur `Participant[]`, prop `initial`, contexte + hook `useParticipants()`.
  - [x] `useEffect` d'abonnement : `supabasePublic.channel('participants-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, (payload) => dispatch(reconcile…))`. Mapper `payload.eventType`/`payload.new`/`payload.old`. Dans le callback `.subscribe((status) => …)` : sur `SUBSCRIBED`, **re-hydrater** via `fetchParticipants()`. Cleanup : `supabasePublic.removeChannel(channel)`.
  - [x] `addParticipant(name)` : trim ; si vide → no-op. Sinon dispatch optimiste (id `temp:<seq>`, `active:true`, `pending:true`) → `await writeParticipant('insert', { data: { name } }, passphrase)` → succès : dispatch remplacement temp→ligne serveur ; échec : router selon `WriteError.kind` (Tâche 3).
  - [x] **Interdit** : `supabase.from(...)` ou `fetch('/api/...')` hors `lib/data/` (AD-11). Le store appelle uniquement `fetchParticipants` / `writeParticipant`.

- [x] **Tâche 3 — Gestion d'erreurs typées + passphrase** (AC: 4, 5)
  - [x] Implémenter la routine `kind` → action : `auth`→effacer passphrase + ouvrir prompt + replay après saisie ; `validation`→rollback optimiste + message ; `conflict`→`fetchParticipants()` (re-hydrate) ; `transient`→retry (≥1) ou exposer un « réessayer ».
  - [x] Passphrase : helper de lecture/écriture `sessionStorage` (`getPassphrase()/setPassphrase()/clearPassphrase()`) ; prompt paresseux au 1er besoin. Champ `type="password"`. **Jamais** de `console.log` de la valeur.

- [x] **Tâche 4 — UI carte Participants** (AC: 6)
  - [x] Créer `daily-wheel/components/ParticipantsCard.tsx` (`'use client'`) : formulaire (input nom + bouton « Ajouter », submit clic+Entrée, vidage après), liste (nom + style `inactif` si `!active`, opacité si `pending`), état vide réutilisé.
  - [x] Créer le composant de saisie passphrase (inline ou petit panneau) déclenché par le store ; messages d'erreur en français.
  - [x] Étendre `daily-wheel/app/globals.css` : styles liste/lignes participant, champ texte, `button:disabled` (dette 1.1), `.pending`/`.inactif`. Respecter la charte (tokens existants), **sans dégradés**, lisible ≤ 520 px. **Ne pas** ajouter Tailwind ni dépendance UI.

- [x] **Tâche 5 — `app/page.tsx` SSR + rendu dynamique** (AC: 8)
  - [x] `app/page.tsx` (reste Server Component) : `export const dynamic = 'force-dynamic'` ; `const initial = await fetchParticipants()` ; envelopper la carte Participants par `<ParticipantsStoreProvider initial={initial}>`. Options/Résultat **inchangées**.
  - [x] Gérer proprement une erreur de fetch initial (try/catch → `initial = []`, l'app reste utilisable, Realtime/re-hydrate prendra le relais).

- [x] **Tâche 6 — Headers de sécurité** (AC: 7)
  - [x] `daily-wheel/next.config.ts` : `async headers()` renvoyant la source `'/(.*)'` avec les 5 headers (nosniff, Referrer-Policy, X-Frame-Options DENY, HSTS, Permissions-Policy). Pas de CSP (différée).
  - [x] Vérifier `npm run build` toujours vert.

- [x] **Tâche 7 — Harnais de test global** (AC: 9)
  - [x] `package.json` : ajouter `"test": "vitest run --no-file-parallelism"`. Conserver `test:read|realtime|write|unit`.
  - [x] Vérifier : `npm test` en local (avec `.env.local`) → tous verts sans flake ; simuler l'absence de secrets (les live se skippent) en confirmant que `reconcile`/`write-error` passent seuls.

- [x] **Tâche 8 — CI GitHub Actions** (AC: 11)
  - [x] Créer `.github/workflows/ci.yml` (**racine du repo**) : déclencheurs `push` + `pull_request` ; job Ubuntu, `actions/setup-node@v4` Node `20.x` avec cache npm (`cache-dependency-path: daily-wheel/package-lock.json`) ; `defaults.run.working-directory: daily-wheel` ; étapes `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`.
  - [x] Confirmer (localement) que les commandes du job passent : `cd daily-wheel && npm run lint && npx tsc --noEmit && npm test`.

- [x] **Tâche 9 — Déploiement Vercel (ops guidé) + non-régression** (AC: 11)
  - [x] Rédiger dans Completion Notes la checklist Vercel/GitHub (Root Directory `daily-wheel`, 4 env vars, branch protection `main` exigeant le check CI). Ne **pas** committer de secret ; `.env.example` documente déjà les clés.
  - [x] Non-régression : `npm run lint` (0 erreur), `npm run build` (vert), `npm run test:read`/`test:realtime`/`test:write` (live, lancés **séparément** — contention) verts. Grep `.next/static` : `SUPABASE_SECRET_KEY` (nom+valeur), `TEAM_PASSPHRASE` (nom+valeur), `service_role` → **0** occurrence (la passphrase saisie dans l'UI vit en `sessionStorage`, jamais dans le bundle).
  - [x] Renseigner Dev Agent Record (File List, Completion Notes, Debug Log, Change Log) + cocher les tâches.

## Dev Notes

### Contexte & périmètre
- **5ᵉ et DERNIÈRE story d'Epic 1** : la **tranche verticale** qui prouve l'ossature de bout en bout. Précédentes : **1.1 done** (scaffold), **1.2/1.3/1.4 review** (Supabase schéma+RLS+Realtime ; lecture low-privilege ; proxy d'écriture gardé). Cette story **assemble** : state (`lib/store/`), UI (`components/`, `page.tsx`), CI, déploiement. [Source: epics.md#Epic-1 ; sprint-status.yaml]
- **Scope strict — câbler l'existant, ne PAS anticiper Epic 2+ :**
  - **Hors-scope :** toggle actif/inactif, renommage, suppression (UI) → **Story 2.2** ; ajout **multi-noms** `,`/`;` → **Story 2.1** ; indisponibilités → 2.3 ; Options/Résultat (week-ends, génération, planning) → Epic 4 ; Route Handlers des autres tables → Epics 2-4.
  - **In-scope :** ajouter **un** participant, **voir** la liste, **synchro temps réel** inter-clients, **déploiement** en ligne, **CI**.
- La **liste affiche** `active` (indicateur visuel) car un autre client peut déjà émettre des UPDATE/DELETE via la Route Handler — le réducteur doit gérer les 3 types d'événements (correctness du partage, **pas** du scope creep). Mais **aucune UI** pour déclencher update/delete ici.

### ⚠️ Variance structurelle héritée (CRITIQUE — rappel 1.1→1.4)
- **L'app vit dans `daily-wheel/`**, pas à la racine. Code, `npm`, grep `.next/` → **depuis `daily-wheel/`**. **Seule exception** : `.github/workflows/ci.yml` à la **racine du repo** (le repo Git couvre la racine ; le job `cd` dans `daily-wheel/`). [Source: 1-4-*.md#Variance-structurelle]
- État réel pertinent (sous `daily-wheel/`, vérifié au commit `68fd030`) :
  - `lib/store/` et `lib/domain/` = **`.gitkeep` uniquement** (vides — `lib/store/` est rempli **ici**).
  - `lib/data/participants.ts` : `fetchParticipants()` + `type Participant` (1.3) **+** `writeParticipant(op, payload, passphrase)` + `WriteError`/`WriteErrorKind`/`writeErrorFromStatus` (1.4) — **déjà en place, réutiliser tel quel, ne pas casser**.
  - `lib/supabase/client.ts` : `supabasePublic` (lecture + Realtime, **ne pas modifier**). `lib/supabase/admin.ts` : secret, **server-only**, importé **uniquement** par `app/api/` — **ne jamais** l'importer depuis store/UI.
  - `app/api/participants/route.ts` : proxy d'écriture (1.4) — **ne pas modifier**, juste le consommer via `writeParticipant`.
  - `app/page.tsx` : statique, 3 cartes vides (à rendre dynamique + carte Participants interactive). `app/layout.tsx` : `lang="fr"`, viewport OK.
  - `app/globals.css` : charte complète + tokens ; **pas** de style `button:disabled` (dette 1.1, à ajouter ici).
  - `next.config.ts` : **vide** (headers à ajouter, dette 1.1).
  - `vitest.config.ts` : alias `@` + stub `server-only` ; `testTimeout 20000` ; `tests/setup.ts` charge `.env.local`. **Ne pas retoucher** la config (sauf si nécessaire).
  - `package.json` : scripts `dev/build/start/lint` + `test:realtime/read/write/unit` ; **pas** de `npm test` global (à ajouter). Deps : `@supabase/supabase-js@^2.108.2`, `next@16.2.9`, `react@19.2.4`, `server-only`. **Aucune lib d'état** (zustand/redux) → utiliser **React natif** (`useReducer`/context), **ne pas** ajouter de dépendance.
  - `.env.local` (non commité) contient déjà les 4 variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `TEAM_PASSPHRASE`, + `SUPABASE_DB_URL`). [Source: inspection repo `68fd030` ; 1-4-*.md#File-List]

### Décisions d'architecture qui cadrent cette story
- **AD-4 (Supabase = source canonique)** : le store est une **copie de travail** hydratée au chargement et re-hydratée à chaque (re)connexion Realtime. L'optimiste est la **seule** exception, et il se réconcilie.
- **AD-5 (optimiste + rollback)** : mutation → store d'abord → écriture en arrière-plan → réconciliation/rollback selon AD-17. **Pas** de bouton « Enregistrer » global.
- **AD-6 (Realtime + réconciliation)** : abonnement **côté lecture** (clé low-privilege). Le pattern d'abonnement est **déjà prouvé** en 1.2 (`tests/realtime.integration.test.ts`) — réutiliser : `reader.channel(name).on('postgres_changes', {event, schema:'public', table:'participants'}, cb).subscribe(statusCb)`. Ici on écoute `event: '*'`. **Re-hydratation à chaque `SUBSCRIBED`** (couvre la reconnexion auto après coupure ~24 h). Dédup de l'écho par AD-15.
- **AD-7 (chemins asymétriques)** : **lectures** client-direct (`supabasePublic`/Realtime) ; **écritures** via `writeParticipant` → `POST /api/participants`. Aucune écriture client-direct.
- **AD-8 / AD-10 (passphrase + secrets)** : la passphrase est saisie dans l'**UI** et envoyée en header par `writeParticipant` (déjà câblé en 1.4). **Jamais** une variable `NEXT_PUBLIC_`. Côté serveur (Vercel), `SUPABASE_SECRET_KEY` + `TEAM_PASSPHRASE` sont **server-only**.
- **AD-11 (`lib/data/` seul point Supabase + dépendances descendantes)** : UI → store → `lib/data/`. Le store **n'importe pas** `@supabase/supabase-js` directement **sauf** pour l'abonnement Realtime, qui passe par `supabasePublic` exporté de `lib/supabase/client.ts` (lecture). Garder le `.from(...)`/`fetch` hors des composants.
- **AD-15 (ids serveur + `updated_at`)** : l'optimiste utilise un **id temporaire** remplacé par l'id serveur au retour du `POST`. La **dédup** de l'écho Realtime se fait sur **match `id` ET `updated_at`** (les deux). C'est l'invariant que le test AC10 protège.
- **AD-16 (LWW ordonné serveur)** : conflit same-row → la ligne au `updated_at` le plus récent gagne ; l'écho Realtime (ou un refetch) **fait autorité** sur l'optimiste local. Comparaison de chaînes ISO (`timestamptz` sérialisé) — lexicographiquement ordonnée tant que c'est le même format/zone (PostgREST renvoie de l'ISO 8601 UTC stable).
- **AD-17 (taxonomie d'erreurs)** : le mapping HTTP→`kind` est **déjà** posé en 1.4 (`writeErrorFromStatus`, `WriteError`). Ici on **consomme** `error.kind` : `auth`/`validation`/`conflict`/`transient` → re-prompt / rollback / re-hydrate / retry.
- **AD-13 (CI + déploiement)** : CI = tests (Vitest) ; déploiement Vercel **conditionné aux tests verts**. `lib/domain/` étant vide jusqu'à Epic 4, les « tests du domaine » se résument **aujourd'hui** aux tests **purs** (`reconcile`, `write-error`) ; ils grossiront en Epic 4 (test golden de parité AD-12). Le `next build` reste validé par Vercel (vraies env).

### Points techniques (Next.js 16 / React 19 / Supabase — janv. 2026)
- **Client/Server Components** : `app/page.tsx` reste **Server** (peut `await fetchParticipants()` car `supabasePublic` n'utilise que des `NEXT_PUBLIC_*` → OK côté serveur). Le **provider de store** et la **carte interactive** sont des **Client Components** (`'use client'`) recevant `initial` en prop **sérialisable** (`Participant[]` = objets plats). [Source: nextjs.org/docs — server-and-client-components]
- **Rendu dynamique** : un `await` réseau dans un Server Component peut sinon être mis en cache/prérendu. `export const dynamic = 'force-dynamic'` garantit un rendu **à la requête** (état live partagé, FR13). [Source: nextjs.org/docs — route-segment-config]
- **Realtime payload** : `payload.eventType` ∈ `INSERT|UPDATE|DELETE` ; `payload.new` = nouvelle ligne (INSERT/UPDATE) ; `payload.old` = ancienne (DELETE/UPDATE, contient au moins `id` grâce à `REPLICA IDENTITY FULL` posé en 1.2). [Source: supabase.com/docs — realtime/postgres-changes ; 1-2 migration]
- **`next.config.ts` headers** : `async headers() { return [{ source: '/(.*)', headers: [{ key, value }, …] }] }`. HSTS n'a d'effet qu'en HTTPS (Vercel) — sans risque en local. [Source: nextjs.org/docs — next.config.js/headers]
- **CI Node** : Stack impose **Node 20.9+** (Next 16). En CI, épingler `node-version: 20.x`. ⚠️ Le **local** tourne sur Node v26 (futur) — la CI sur 20.x est la **référence** ; viser une compat 20.x (rien de spécifique v26 dans le code). [Source: ARCHITECTURE-SPINE.md#Stack]
- **Vitest `--no-file-parallelism`** : exécute les fichiers en **série** → supprime la contention multi-connexions Supabase observée en 1.3/1.4 sur les tests live. Acceptable (suite courte). [Source: 1-3-*.md ; 1-4-*.md#gotcha-1.5]

### Previous Story Intelligence (1.1→1.4)
- **Pattern Realtime live** (1.2) : voir `tests/realtime.integration.test.ts` — abonnement → `SUBSCRIBED` → action ; cleanup `removeChannel`. Réutiliser la **forme**, pas le code de test.
- **Flake handshake Realtime** (1.3/1.4) : le 1er run `test:realtime` peut timeouter puis passer au 2e — **transitoire connu**, pas une régression. Ne pas tenter de « corriger » le chemin Realtime.
- **`writeParticipant` / `WriteError`** (1.4) : déjà testés (mapping pur 5✓ + intégration live 6✓). **Réutiliser**, ne pas réécrire le mapping.
- **Garde `server-only` + stub Vitest** (1.4) : `admin.ts` n'est **pas** dans le graphe de cette story (store/UI = lecture+`/api`). Ne pas importer `admin.ts` ici.
- **Dette différée à résorber ICI** (deferred-work.md) : `button:disabled` (Tâche 4) ; headers de sécurité `next.config.ts` (Tâche 6). **À NE PAS toucher ici** (rester ciblé) : reset lien global `a {…}` ; script `"lint": "eslint"` sans cible (fonctionne avec la flat config) ; breakpoints 521–780 px ; dark mode. [Source: deferred-work.md]
- **Texte d'état vide** (deferred 1.1) : la carte Participants **garde** un état vide explicite (la décision de le retirer est différée — ici on le **conserve**, branché sur `participants.length === 0`).
- **Push Git** : remote via alias SSH `github-perso` → `Infinter/SpinThatWeeklyWheel` (compte SoloOz). Le repo GitHub à connecter à Vercel et à protéger (branch protection) est `Infinter/SpinThatWeeklyWheel`. [Source: MEMORY:git-remote-push-setup]

### Project Structure Notes
- Arborescence touchée :
  ```
  (racine repo)
    .github/workflows/ci.yml            # NEW (CI : lint + tsc + test, working-dir daily-wheel)
  daily-wheel/
    lib/store/reconcile.ts              # NEW (réducteur PUR — cœur AC1/AC10)
    lib/store/participants-store.tsx    # NEW (provider + hook + Realtime + hydratation — AC2-4)
    components/ParticipantsCard.tsx     # NEW (UI ajout + liste — AC6)
    components/PassphrasePrompt.tsx      # NEW (saisie passphrase — AC5) [ou inline dans la carte]
    app/page.tsx                        # UPDATE (SSR initial + force-dynamic + provider — AC8)
    app/globals.css                     # UPDATE (styles liste/champ/pending/inactif + button:disabled — AC6)
    next.config.ts                      # UPDATE (headers de sécurité — AC7)
    package.json                        # UPDATE (script "test" global — AC9)
    tests/reconcile.unit.test.ts        # NEW (test pur réconciliation — AC10)
    _bmad-output/.../sprint-status.yaml # UPDATE (statut 1.5 ; géré par le workflow)
  ```
- **Inchangés** : `lib/data/participants.ts` (réutilisé), `lib/supabase/{client,admin}.ts`, `app/api/participants/route.ts`, `app/layout.tsx`, `vitest.config.ts`, migrations SQL. `lib/domain/` reste vide (Epic 4).
- **Répercussion Epics 2+** : le store et le réducteur posés ici seront **étendus** (toggle/rename/delete, autres tables) ; soigner leur forme générique (le réducteur traite déjà les 3 types d'événements).

### Testing standards (pour cette story)
- **TDD** : écrire `reconcile.unit.test.ts` **avant** `reconcile.ts` (rouge → vert). C'est le **vrai filet** AD-15/AD-16 (pur, CI-runnable).
- **Périmètre testé automatiquement** : la **réconciliation pure** (AC10) + le mapping `WriteError` (1.4, déjà là). Le store React + l'UI ne sont **pas** unit-testés ici (pas de RTL/jsdom installé — ne **pas** ajouter de dépendance de test ; la preuve UI est la **vérification manuelle** de la tranche : ajout → reload → autre navigateur → temps réel).
- **Critère « vert »** : `npm test` vert (purs + live skippés-ou-verts) ; `npm run lint` 0 erreur ; `npx tsc --noEmit` 0 erreur ; `npm run build` vert ; grep `.next/static` sans secret **ni passphrase** ; tests live (`read`/`realtime`/`write`) verts lancés **séparément**.
- **Tests live env-gated** : restent skippables sans secrets (pattern `describe.skipIf(!ready)`). Le projet Supabase **est** disponible (1.2-1.4) → viser le vert réel en local.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 ; #Story-1.5 ; #Story-2.1 (frontière scope) ; FR13 ; NFR1 ; NFR4 ; NFR5 ; NFR8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#AD-4 ; #AD-5 ; #AD-6 ; #AD-7 ; #AD-8 ; #AD-10 ; #AD-11 ; #AD-13 ; #AD-15 ; #AD-16 ; #AD-17 ; #Consistency-Conventions ; #Structural-Seed ; #Stack]
- [Source: _bmad-output/implementation-artifacts/1-4-proxy-ecriture-serveur-garde-par-passphrase.md#Dev-Notes ; #Completion-Notes ; #gotcha-1.5 ; #File-List]
- [Source: _bmad-output/implementation-artifacts/1-3-connecter-app-supabase-lecture-cle-low-privilege.md#Testing-standards ; #Completion-Notes]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md (button:disabled ; headers next.config.ts ; état vide)]
- [Source: daily-wheel/lib/data/participants.ts (fetchParticipants, writeParticipant, WriteError) ; daily-wheel/lib/supabase/client.ts (supabasePublic) ; daily-wheel/tests/realtime.integration.test.ts (pattern abonnement) ; daily-wheel/app/globals.css (charte) ; daily-wheel/.env.example (env vars)]
- [Source: docs/prd.md §3 (UX-DR1/DR3/DR5/DR7) ; FR1/FR13 ; NFR1/NFR4/NFR5/NFR8]
- [Source: nextjs.org/docs — server-and-client-components ; route-segment-config (dynamic) ; next.config.js/headers ; supabase.com/docs — realtime/postgres-changes]
- [Source: MEMORY:git-remote-push-setup (remote github-perso → Infinter/SpinThatWeeklyWheel)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia, dev-story workflow).

### Debug Log References

- **TDD réconciliation** : `tests/reconcile.unit.test.ts` écrit d'abord → ROUGE (`Cannot find package '@/lib/store/reconcile'`) → `lib/store/reconcile.ts` créé → VERT 9/9.
- **Lint `react-hooks/refs`** : écrire `stateRef.current = participants` pendant le rendu était interdit → déplacé dans un `useEffect([participants])`.
- **Gotcha CI majeur (résolu)** : `lib/supabase/{client,admin}.ts` jettent à l'import quand les env manquent. `describe.skipIf` ne protège que le `describe`, PAS l'import → en CI sans secrets, `npm test` faisait échouer non seulement les suites live mais aussi le test PUR `write-error.unit` (qui importe `participants.ts` → `client.ts`). Corrigé dans le harnais (sans toucher `lib/`) : `tests/setup.ts` pose un sentinel `SUPABASE_TEST_LIVE` (capturé AVANT substitution) puis injecte des placeholders d'import neutres ; les 3 suites live (`read`/`write`/`realtime`) gatent désormais sur le sentinel et non sur la présence brute des env.
- **Flake Realtime connu (1.3/1.4)** : le 1er `npm test` peut timeouter sur le handshake Realtime (20 s) puis passer au 2e run (~1 s). Transitoire confirmé, pas une régression.

### Completion Notes List

**Résumé** — Tranche verticale « participants » complète : state (`lib/store/`), UI (`components/`, `app/page.tsx`), headers de sécurité, harnais `npm test` global + gate CI. Epic 1 prouvé bout-en-bout (lecture 1.3 + écriture gardée 1.4 + temps réel + déploiement).

**AC couverts**
- AC1/AC10 : `reconcileParticipants` pur (AD-15 dédup écho `id`+`updated_at` ; AD-16 LWW lexicographique ISO ; DELETE par `old.id`) — 9 tests rouges→verts.
- AC2 : provider `useReducer` + hook `useParticipants()`, hydratation SSR via prop `initial`, abonnement `postgres_changes` `event:'*'` via `supabasePublic`, **re-hydratation à chaque `SUBSCRIBED`**, cleanup `removeChannel`.
- AC3 : ajout optimiste (`temp:<seq>`, `pending`), remplacement par la ligne serveur au succès (id+updated_at réels → écho dédupliqué), nom trimé, vide = no-op.
- AC4 : consommation `WriteError.kind` → `auth` (re-prompt + replay) / `validation` (rollback) / `conflict` (re-hydrate) / `transient` (optimiste conservé + bouton « Réessayer »).
- AC5 : passphrase saisie UI (`type="password"`), `sessionStorage` (onglet), effacée + re-prompt sur 401, jamais loggée ni dans le DOM en clair.
- AC6 : carte Participants FR (formulaire submit clic+Entrée, champ vidé ; liste avec `inactif`/`pending`/`failed` ; état vide conservé) ; `globals.css` étendu (charte, sans dégradés, ≤520px) + `button:disabled` (dette 1.1).
- AC7 : `next.config.ts` `async headers()` (nosniff, Referrer-Policy, X-Frame-Options DENY, HSTS, Permissions-Policy). CSP différée.
- AC8 : `app/page.tsx` Server Component, `export const dynamic = 'force-dynamic'`, `await fetchParticipants()` (try/catch → `[]`), provider enveloppant la carte ; Options/Résultat inchangées. Build confirme `/` = `ƒ (Dynamic)`.
- AC9 : `"test": "vitest run --no-file-parallelism"` ; purs tournent partout, live skippés sans secrets.
- AC11 : `.github/workflows/ci.yml` (racine repo, Node 20.x, working-dir `daily-wheel`, `npm ci`→lint→tsc→test).

**Validations**
- `npm run lint` : 0 erreur. `npx tsc --noEmit` : 0 erreur. `npm run build` : vert (`/` dynamique).
- `npm test` local (secrets) : **22/22**. Simulation CI (sans secrets) : **14 purs verts, 8 live skippés**.
- Live séparés : `test:read` 1✓, `test:write` 6✓, `test:realtime` ✓ (au retry — flake handshake connu), `test:unit` 14✓.
- Grep `.next/static` : `SUPABASE_SECRET_KEY`, `TEAM_PASSPHRASE`, `service_role` (noms ET valeurs) → **0**. Seul hit : le littéral `team-passphrase` = clé `sessionStorage` (inoffensif, la valeur vit en session au runtime).

**⚠️ Hors-périmètre code laissé tel quel** (intentionnel, scope 1.5) : pas d'UI toggle/rename/delete (Story 2.2), pas de multi-noms (Story 2.1), Options/Résultat intactes (Epic 4).

**📋 Checklist OPS à exécuter par Solo (hors-repo — Vercel + GitHub)**
1. **Connecter le repo à Vercel** : importer `Infinter/SpinThatWeeklyWheel` → **Root Directory = `daily-wheel`** (CRITIQUE : l'app n'est pas à la racine). Framework auto-détecté = Next.js.
2. **Variables d'environnement Vercel** (Project Settings → Environment Variables) :
   - Côté client (publiques) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Côté serveur (secrètes, **jamais** `NEXT_PUBLIC_`) : `SUPABASE_SECRET_KEY`, `TEAM_PASSPHRASE`.
   - (Valeurs déjà dans `.env.local` local ; `.env.example` documente les clés. Ne **jamais** committer les valeurs.)
3. **Branch protection `main`** (GitHub → Settings → Branches) : exiger le check CI **« CI / quality »** vert avant merge → conditionne le déploiement de production aux tests verts (NFR1, AD-13).
4. Vérifier le 1er déploiement : ajout d'un participant depuis 2 navigateurs → synchro temps réel (preuve manuelle de la tranche).

### File List

**Nouveaux (sous `daily-wheel/`)**
- `lib/store/reconcile.ts` — réducteur pur AD-15/AD-16 (AC1/AC10).
- `lib/store/participants-store.tsx` — provider + hook + Realtime + hydratation + taxonomie d'erreurs + passphrase (AC2-5).
- `components/ParticipantsCard.tsx` — UI carte Participants (AC6).
- `components/PassphrasePrompt.tsx` — saisie passphrase (AC5).
- `tests/reconcile.unit.test.ts` — preuve pure réconciliation (AC10).

**Nouveau (racine repo)**
- `.github/workflows/ci.yml` — gate CI lint+tsc+test, Node 20.x, working-dir `daily-wheel` (AC11).

**Modifiés (sous `daily-wheel/`)**
- `app/page.tsx` — SSR `initial` + `force-dynamic` + provider (AC8).
- `app/globals.css` — styles participants/champ/pending/inactif/failed/passphrase + `button:disabled` (AC6, dette 1.1).
- `next.config.ts` — headers de sécurité (AC7).
- `package.json` — script `"test"` global ; `test:unit` inclut `reconcile.unit` (AC9).
- `tests/setup.ts` — sentinel `SUPABASE_TEST_LIVE` + placeholders d'import (gate CI propre, AC9).
- `tests/read.integration.test.ts`, `tests/write.integration.test.ts`, `tests/realtime.integration.test.ts` — skip gaté sur le sentinel (AC9 ; nécessaire pour que les live skippent à l'import en CI).

**Inchangés (réutilisés)** : `lib/data/participants.ts`, `lib/supabase/{client,admin}.ts`, `app/api/participants/route.ts`, `app/layout.tsx`, `vitest.config.ts`.

### Change Log

- 2026-06-22 — Story 1.5 implémentée (tranche verticale participants + temps réel + headers sécurité + harnais `npm test` + CI GitHub Actions). Statut → review. Tests : 22/22 local, gate CI vert sans secrets (14 purs / 8 live skippés).
