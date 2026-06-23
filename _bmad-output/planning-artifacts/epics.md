---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - docs/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/EXPERIENCE.md
---

# Daily Wheel - Epic Breakdown

## Overview

Ce document fournit le découpage complet en epics et stories pour **Daily Wheel** (migration de « Spin That Wheel v2.html » vers Next.js + Supabase sur Vercel). Il décompose les exigences du PRD (`docs/prd.md`) et les décisions d'architecture (spine `architecture-SpinThatWeeklyWheel-2026-06-22`) en stories implémentables, chacune avec des critères d'acceptation testables. Aucun document UX dédié n'existe à ce jour — les exigences d'interface sont reprises de la section §3 du PRD.

## Requirements Inventory

### Functional Requirements

- **FR1 :** L'utilisateur peut ajouter un ou plusieurs participants en une saisie (noms séparés par virgule ou point-virgule).
- **FR2 :** Chaque participant peut être marqué actif/inactif ; seuls les actifs entrent dans le tirage.
- **FR3 :** L'utilisateur peut renommer un participant.
- **FR4 :** L'utilisateur peut supprimer un participant (avec confirmation), ce qui supprime aussi ses indisponibilités associées.
- **FR5 :** L'utilisateur peut gérer les indisponibilités individuelles d'un participant, en jour isolé ou en plage de dates, avec ajout et suppression unitaires.
- **FR6 :** L'utilisateur peut définir des exclusions de groupe récurrentes : un jour de la semaine, toutes les N semaines, à partir d'une date de référence.
- **FR7 :** *(Nouveau)* L'utilisateur peut saisir manuellement des jours fériés (date + libellé), valables pour toute l'équipe ; aucun animateur n'y est planifié.
- **FR8 :** *(Nouveau)* L'utilisateur peut saisir des jours « off » d'équipe (jour isolé ou plage + libellé optionnel), appliqués à tout le groupe.
- **FR9 :** L'utilisateur peut activer/désactiver l'option « ignorer les week-ends ».
- **FR10 :** L'utilisateur peut choisir la date de début du planning (défaut : aujourd'hui).
- **FR11 :** L'application génère un planning en désignant un animateur unique par jour ouvré valide, en respectant toutes les contraintes selon la stratégie EDF, sans créer de trou.
- **FR12 :** L'application affiche le planning généré (date longue FR → animateur) ainsi que la liste des participants non planifiés.
- **FR13 :** Toutes les données sont persistées dans Supabase et partagées : tout client qui ouvre l'URL voit le même état.
- **FR14 :** Le tirage de base reste aléatoire (l'ordre initial change à chaque lancement), l'EDF servant uniquement à départager selon les fenêtres de disponibilité.
- **FR15 :** *(Redesign — Epic 5)* La rotation produit autant de sessions qu'il y a de participants **disponibles** (actifs ET non indisponibles sur la période) : chacun anime exactement une fois. Les jours bloqués (week-end, exclusion de groupe, férié, jour off) sont **sautés et non comptés** comme slot ; l'horizon s'étend sur les semaines suivantes jusqu'à placer tous les disponibles.
- **FR16 :** *(Redesign — Epic 5)* Le tirage est révélé via une **roue animée** qui matérialise le résultat EDF pré-calculé (elle ne tire pas indépendamment), selon deux modes : « Rotation complète » (révèle tous les jours d'affilée) et « Jour le jour » (révèle un jour par interaction) ; chaque personne tirée est **retirée** de la roue.
- **FR17 :** *(Redesign — Epic 5)* L'utilisateur peut exporter le planning au format **Message Slack** (markdown) et **CSV** (dates ISO), avec un **aperçu du contenu exact** avant copie. (Lien public et `.ics` hors périmètre.)
- **FR18 :** *(Redesign — Epic 5)* Le planning généré **persiste** (graine + curseur de progression) afin que le mode « Jour le jour » reprenne au bon endroit après rechargement ou changement de poste.

### NonFunctional Requirements

- **NFR1 :** Application développée en Next.js (App Router, React), déployée sur Vercel via intégration Git continue.
- **NFR2 :** Persistance via Supabase (PostgreSQL), accédé via `@supabase/supabase-js`.
- **NFR3 :** Mono-équipe sans login par comptes ; écritures gardées par une passphrase d'équipe partagée. Lecture directe par URL via clé publique low-privilege (RLS autorise `SELECT`). Écritures refusées à la clé publique par RLS, passant par un proxy d'écriture serveur (Route Handlers) validant la passphrase puis écrivant via la clé secrète.
- **NFR4 :** Interface et formats de dates entièrement en français.
- **NFR5 :** Interface responsive (utilisable sur mobile, ≤ 520 px) ; mise en page actuelle conservée.
- **NFR6 :** Rendu initial et génération quasi instantanés pour une équipe typique (≤ 50 participants, horizon ≤ 1 an).
- **NFR7 :** Algorithme de génération déterministe à seed donné.
- **NFR8 :** Secrets fournis via variables d'environnement Vercel ; aucune clé `service_role` exposée côté client.
- **NFR9 :** Aucune régression fonctionnelle par rapport à `Spin That Wheel v2.html` ; parité confirmée avant mise hors service.

### Additional Requirements

*(Extraites de la spine d'architecture — décisions AD-1 à AD-17, Stack, conventions.)*

- **Starter template (AD/Stack) :** initialiser via `create-next-app --app --ts --eslint`, **sans Tailwind** (la charte CSS existante est ratifiée), **sans** dossier `src/`. → impacte Epic 1, Story 1.
- **Domaine pur (AD-1, AD-2) :** toute la logique de génération vit dans `lib/domain/` sans import React/DOM/Supabase ; `generateSchedule(input, rng)` reçoit un `rng: () => number` seedable (aucun `Math.random()` interne).
- **Prédicat unique (AD-3) :** `isTeamNonSessionDay` est la source unique du « jour neutralisé », branchée à la fois dans la boucle de génération et dans le calcul de deadline EDF ; un test paramétré le prouve. `isPersonUnavailable` pour les indispos individuelles.
- **Schéma & migrations (AD-13, conventions) :** SQL versionné dans `supabase/migrations/`, appliqué via Supabase CLI (`supabase db push`). 6 tables : `participants`, `unavailabilities`, `group_exclusions`, `holidays`, `team_off_days`, `settings`.
- **RLS (AD-9) :** RLS activé sur les 6 tables ; `SELECT` autorisé au rôle public, `INSERT`/`UPDATE`/`DELETE` non accordés.
- **Realtime (AD-6) :** migration ajoute les 6 tables à la publication `supabase_realtime` + `REPLICA IDENTITY FULL` ; abonnement côté lecture maintient le store à jour ; re-hydratation à chaque (re)connexion.
- **Chemins asymétriques (AD-7, AD-11) :** lectures client-direct (clé low-privilege) ; écritures via `POST` vers Route Handlers (`app/api/<table>/route.ts`). `lib/data/` est le seul point de contact Supabase.
- **Passphrase serveur (AD-8, AD-10) :** passphrase en header `x-team-passphrase`, validée côté serveur ; clé secrète + passphrase = variables d'env serveur uniquement (jamais `NEXT_PUBLIC_`).
- **Contrat d'écriture (AD-14) :** une Route Handler par table, corps unique `{ op: 'insert'|'update'|'delete', id?, data? }` ; `update` = patch partiel ; allowlist de colonnes par table côté serveur.
- **Ids serveur + versioning (AD-15) :** ids uuid `gen_random_uuid()` côté serveur ; `updated_at` (timestamptz serveur) sur toute table écrivable ; dédup écho Realtime par match `id` ET `updated_at`.
- **Optimiste + réconciliation (AD-5, AD-16, AD-17) :** écritures optimistes (store d'abord) avec rollback/retry selon taxonomie d'erreurs (401 auth re-prompt, 400 rollback, 409 re-hydrate+réapplique, 5xx retry) ; conflits same-row résolus en Last-Write-Wins ordonné par `updated_at` serveur.
- **Parité golden (AD-12) :** test golden rejouant un dataset + seed fixe comparé à un fixture legacy ; couvre uniquement les contraintes legacy (week-ends, exclusions de groupe, indispos). L'interaction fériés/off ↔ deadline EDF est une extension à tests dédiés.
- **CI / déploiement (AD-13) :** la CI exécute les tests du domaine (Vitest) ; le déploiement Vercel est conditionné aux tests verts.
- **Conventions transverses :** dates métier = chaînes `YYYY-MM-DD` manipulées en local (jamais UTC/`toISOString()`) ; `settings.id = 'singleton'` + upsert ; `ON DELETE CASCADE` sur `unavailabilities.participant_id` ; nommage `snake_case` en base.
- **Migration legacy (PRD §4, deferred architecture) :** import one-shot des données `localStorage` — **optionnel/différé**.

### UX Design Requirements

**Epics 1–4 (UI d'origine).** À leur création, aucun document UX dédié n'existait ; les exigences d'interface provenaient du PRD §3 (UX-DR1–7 ci-dessous) :

- **UX-DR1 :** Écran principal unique organisé en cartes (Participants, Options, Résultat) ; action principale claire « 🎲 Lancer la sélection ».
- **UX-DR2 :** Charte visuelle reprise de l'existant — primaire `#0078d4`, fond clair `#eef4fb`, cartes blanches, coins arrondis, icône 🎲, **sans dégradés**.
- **UX-DR3 :** Édition inline et persistance automatique (pas de bouton « Enregistrer » global).
- **UX-DR4 :** Panneaux repliables pour les réglages avancés (exclusions de groupe, jours fériés, jours off) sur le modèle du panneau existant.
- **UX-DR5 :** Retour visuel via badges (nombre d'indispos, nombre de règles) et messages d'avertissement sur les non-planifiés.
- **UX-DR6 :** Accessibilité cible WCAG AA raisonnable (contrastes, focus visibles, navigation clavier). *(À confirmer avec l'UX Expert — non spécifié en détail.)*
- **UX-DR7 :** Responsive desktop-first, mobile pleinement supporté (≤ 520 px).

**Epic 5 (redesign rituel).** Source autoritaire : la spec UX bmad-ux `ux-SpinThatWeeklyWheel-2026-06-23` (`DESIGN.md` + `EXPERIENCE.md` + `mockups/spin-rotation.html`). C'est une **évolution** de l'UI existante (ADN visuel conservé), pas une réécriture :

- **UX-DR8 :** Parcours guidé en **stepper 3 étapes collant** (Équipe → Contraintes → Spin), non bloquant — pas un wizard, retour à toute étape en un clic ; **bandeau « 🔒 Équipe protégée »** annoncé en amont (la saisie de passphrase reste paresseuse, au premier write).
- **UX-DR9 :** **Roue animée `<canvas>`** — segments par participant (couleur stable partagée avec les avatars), pointeur or à 12h, moyeu central 🎡 ; ralentissement ease-out vers l'animateur assigné ; **retrait du segment tiré** à chaque tour.
- **UX-DR10 :** **Timeline en grille multi-lignes, sans scrollbar horizontale** : week-ends hachurés, jours bloqués en ambre marqués « sauté », animateur révélé par jour ouvré (avatar couleur + prénom).
- **UX-DR11 :** **Panneau d'aperçu d'export** affichant le contenu exact (monospace) avant copie ; export désactivé tant qu'aucune rotation n'est tirée.
- **UX-DR12 :** **Microcopie & branding** : CTA « **Lancer la roue** » (remplace « Lancer la sélection »), mark applicatif **🎡** (remplace 🎲), tutoiement sobre-joueur, vocabulaire produit (animateur, tirage, jours fériés/off, indisponibilités, exclusions de groupe).
- **UX-DR13 :** **Mouvement & accessibilité** : `prefers-reduced-motion` respecté (roue → résultat direct, sans rotation) ; résultat de la roue annoncé en **région live `role="status"`** (canvas `aria-hidden`) ; **couleur jamais seule** porteuse de sens (badge texte : « WE », « Férié », « sauté », état participant).
- **UX-DR14 :** **Navigation & édition rapide entre étapes** : stepper collant (retour en 1 clic) ; **édition d'indispos en popover** depuis un chip participant (y compris à l'étape Spin), sans quitter la page ni perdre le tirage ; **nudge non destructif** « Contraintes mises à jour — relancer la roue ? » au lieu d'une réinitialisation silencieuse (l'ancien planning reste affiché jusqu'à la relance).

### FR Coverage Map

- **FR1 :** Epic 2 — Ajout multiple de participants.
- **FR2 :** Epic 2 — Toggle actif/inactif.
- **FR3 :** Epic 2 — Renommage.
- **FR4 :** Epic 2 — Suppression + cascade indispos.
- **FR5 :** Epic 2 — Indisponibilités individuelles (jour/plage).
- **FR6 :** Epic 3 — Exclusions de groupe récurrentes.
- **FR7 :** Epic 3 — Jours fériés (nouveau).
- **FR8 :** Epic 3 — Jours off d'équipe (nouveau).
- **FR9 :** Epic 4 — Option « ignorer les week-ends ».
- **FR10 :** Epic 4 — Date de début du planning.
- **FR11 :** Epic 4 — Génération EDF intégrant toutes les contraintes, sans trou.
- **FR12 :** Epic 4 — Affichage du planning + non-planifiés.
- **FR13 :** Epic 1 — Persistance partagée Supabase (établie par la tranche verticale participants), réutilisée et étendue par Epics 2-4.
- **FR14 :** Epic 4 — Tirage aléatoire initial, EDF en départage.
- **FR15 :** Epic 5 — Règle de rotation à horizon étendu (1 jour ouvré par disponible).
- **FR16 :** Epic 5 — Roue de révélation du résultat EDF + deux modes.
- **FR17 :** Epic 5 — Exports Slack + CSV avec aperçu.
- **FR18 :** Epic 5 — Persistance de la rotation (mode Jour le jour).

> FR1-FR14 couvertes par Epics 1-4 (livrés). FR15-FR18 couvertes par Epic 5 (redesign rituel), qui revisite aussi la restitution de FR11/FR12 (génération/affichage) côté UX. Les NFRs sont transverses : NFR1/NFR2/NFR3/NFR8 établies en Epic 1 et respectées par toutes les écritures ; NFR4/NFR5 (français, responsive) appliquées à chaque story d'UI, y compris Epic 5 ; NFR6 (performance) et NFR7/NFR9 (déterminisme, parité) vérifiées en Epic 4 et préservées par Epic 5 (la roue ne change pas le résultat de `generateSchedule`, elle le révèle).

## Epic List

### Epic 1: Fondations & déploiement en ligne
Mettre en place l'ossature technique complète (Next.js, Supabase, schéma + RLS + Realtime, Vercel) et prouver le bout-en-bout par une tranche verticale réelle : afficher et ajouter des participants stockés en base, accessibles publiquement par URL et partagés entre clients. À l'issue de cet epic, l'équipe dispose d'une application en ligne fonctionnelle où l'état participant est réellement partagé.
**FRs couvertes :** FR13 (établie), amorce de FR1.
**NFRs/AD :** NFR1, NFR2, NFR3, NFR8 ; AD-7 à AD-15, AD-13, Stack/Starter.

### Epic 2: Participants & contraintes individuelles
Atteindre la parité avec l'existant sur la gestion des participants et de leurs indisponibilités, le tout persisté dans Supabase via le contrat d'écriture serveur. À l'issue, l'utilisateur gère entièrement son équipe (ajout multiple, actif/inactif, renommage, suppression cascade) et les indispos individuelles.
**FRs couvertes :** FR1, FR2, FR3, FR4, FR5.
**NFRs/AD :** NFR4, NFR5 ; AD-5, AD-11, AD-14, AD-17, conventions (cascade).

### Epic 3: Contraintes d'équipe
Offrir les contraintes communes à toute l'équipe : migration des exclusions de groupe récurrentes + ajout des nouveaux jours fériés et jours off d'équipe, chacun dans son panneau dédié. À l'issue, l'utilisateur modélise toutes les contraintes collectives sans saisie individuelle.
**FRs couvertes :** FR6, FR7, FR8.
**NFRs/AD :** NFR4, NFR5 ; AD-3 (prédicat de neutralisation), AD-14, conventions (dates YMD).

### Epic 4: Génération du planning & affichage
Reproduire et fiabiliser l'algorithme EDF en intégrant l'ensemble des contraintes, gérer les options (week-ends, date de début) et afficher le résultat (planning + non-planifiés). À l'issue, l'application livre la valeur cœur : un animateur équitable par jour ouvré valide, avec parité prouvée vs l'ancienne page.
**FRs couvertes :** FR9, FR10, FR11, FR12, FR14.
**NFRs/AD :** NFR6, NFR7, NFR9 ; AD-1, AD-2, AD-3, AD-12, conventions (settings singleton).

### Epic 5: Redesign UX — rituel de la roue
Transformer l'expérience de tirage en un **rituel** : parcours guidé (stepper Équipe→Contraintes→Spin), **roue animée** qui révèle le résultat EDF jour par jour (modes Rotation complète / Jour le jour), **timeline visuelle** en remplacement du tableau, et **exports** Slack + CSV. La règle de rotation est précisée (1 jour ouvré par disponible, horizon étendu, jours bloqués sautés). C'est une **évolution** de l'app existante : le domaine `generateSchedule` reste la source de vérité, la roue n'en est que la mise en scène. À l'issue, désigner l'animateur devient un moment attendu, perçu comme équitable parce que mécanique.
**FRs couvertes :** FR15, FR16, FR17, FR18 (+ revisite UX de FR11/FR12).
**NFRs/AD :** NFR4, NFR5, NFR7 ; AD-1, AD-2, AD-3 (prédicat unique réutilisé), AD-5 (optimiste). Source : spec UX `ux-SpinThatWeeklyWheel-2026-06-23`.

---

## Epic 1: Fondations & déploiement en ligne

**Goal :** Mettre en place l'ossature technique complète (Next.js, Supabase, schéma + RLS + Realtime, proxy d'écriture serveur, Vercel) et prouver le bout-en-bout par une tranche verticale réelle : afficher et ajouter des participants stockés en base, accessibles publiquement par URL et partagés entre clients.

### Story 1.1: Initialiser l'application Next.js avec la charte existante

As a développeur,
I want un projet Next.js (App Router, TypeScript) versionné, lançable en local et reprenant la charte visuelle de l'ancienne page,
So that je dispose d'une base de travail propre et fidèle à l'identité actuelle.

**Acceptance Criteria:**

**Given** un dépôt vide
**When** le projet est initialisé via `create-next-app --app --ts --eslint` (sans Tailwind, sans dossier `src/`)
**Then** l'app démarre en local (`npm run dev`) et affiche la page d'accueil Daily Wheel : header + cartes vides (Participants, Options, Résultat)
**And** la charte de base est appliquée en CSS (primaire `#0078d4`, fond clair `#eef4fb`, cartes blanches, coins arrondis, icône 🎲, **sans dégradés**) — UX-DR1, UX-DR2
**And** l'arborescence respecte la graine structurelle (`app/`, `components/`, `lib/{domain,data,supabase,store}/`, `supabase/migrations/`) — AD-11
**And** `npm run build` réussit sans erreur et l'interface est en français (NFR4).

### Story 1.2: Provisionner Supabase — schéma, RLS et Realtime

As a développeur,
I want un projet Supabase avec les 6 tables du modèle de données, les politiques RLS et la publication Realtime, le tout versionné en migration SQL,
So that les données puissent être persistées, partagées et gardées en écriture.

**Acceptance Criteria:**

**Given** un projet Supabase et la Supabase CLI configurée
**When** la migration SQL versionnée dans `supabase/migrations/` est appliquée (`supabase db push`)
**Then** les tables `participants`, `unavailabilities`, `group_exclusions`, `holidays`, `team_off_days`, `settings` sont créées conformément au modèle (§4 PRD + AD-15), avec `id` uuid `default gen_random_uuid()` (sauf `settings.id` text = `'singleton'`) et `updated_at` (timestamptz) sur toute table écrivable
**And** `ON DELETE CASCADE` est posé sur `unavailabilities.participant_id` ; `holidays.date` est unique
**And** RLS est activé sur les 6 tables : `SELECT` accordé au rôle public, `INSERT`/`UPDATE`/`DELETE` **non** accordés (AD-9)
**And** les 6 tables sont ajoutées à la publication `supabase_realtime` avec `REPLICA IDENTITY FULL` (AD-6)
**And** un test prouve qu'un événement Realtime est bien émis lors d'une modification de ligne (AD-6).

### Story 1.3: Connecter l'app à Supabase en lecture (clé low-privilege)

As a développeur,
I want le client Supabase de lecture initialisé via variables d'environnement publiques,
So that l'app lise la base sans exposer de secret sensible.

**Acceptance Criteria:**

**Given** les variables `NEXT_PUBLIC_SUPABASE_URL` et la clé low-privilege (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) configurées en `.env.local`
**When** `lib/supabase/` initialise le client navigateur low-privilege
**Then** une lecture de test sur une table renvoie un résultat sans erreur (à travers `lib/data/`, seul point de contact Supabase — AD-11)
**And** aucune clé secrète / `service_role` n'est présente dans le bundle client ni préfixée `NEXT_PUBLIC_` (AD-10, NFR8)
**And** la convention de dates est respectée côté lecture : les colonnes `date` sont traitées comme chaînes `YYYY-MM-DD` locales, jamais converties en UTC.

### Story 1.4: Proxy d'écriture serveur gardé par passphrase

As a développeur,
I want une Route Handler serveur d'écriture pour la table `participants`, gardée par la passphrase d'équipe et écrivant via la clé secrète,
So that les écritures soient verrouillées et le contrat d'écriture établi pour toutes les tables suivantes.

**Acceptance Criteria:**

**Given** la clé secrète Supabase et la passphrase d'équipe en variables d'environnement **serveur uniquement** (jamais `NEXT_PUBLIC_`) — AD-10
**When** un client envoie `POST app/api/participants` avec corps `{ op: 'insert'|'update'|'delete', id?, data? }` et header `x-team-passphrase` (AD-14)
**Then** le serveur valide la passphrase puis écrit via la clé secrète ; `update` est un patch partiel et une **allowlist de colonnes** est appliquée avant écriture
**And** le serveur positionne `updated_at` côté serveur à chaque write (AD-15)
**And** `lib/data/` route les écritures vers cette Route Handler (jamais d'écriture client-direct vers Supabase — AD-7)
**And** les réponses suivent la taxonomie d'erreurs typée : `401` passphrase invalide, `400` validation, `409` conflit, `5xx` transitoire (AD-17)
**And** une passphrase absente ou erronée renvoie `401` et aucune écriture n'est effectuée.

### Story 1.5: Tranche verticale « participants » partagée + déploiement Vercel

As a membre de l'équipe,
I want ajouter et voir la liste des participants depuis n'importe quel poste via l'URL en ligne,
So that l'état est réellement partagé et l'application accessible sans installation.

**Acceptance Criteria:**

**Given** l'app connectée en lecture (1.3) et le proxy d'écriture (1.4)
**When** un utilisateur ajoute un participant
**Then** le participant est écrit en base via le proxy et apparaît dans la liste (affichage optimiste avec réconciliation — AD-5)
**And** après rechargement de page **et** depuis un autre navigateur, le même participant est visible (FR13)
**And** une modification faite par un autre client se reflète sans rechargement manuel via l'abonnement Realtime (AD-6), l'écho de sa propre écriture étant dédupliqué par match `id`+`updated_at` (AD-15)
**And** l'application est déployée sur Vercel via intégration Git continue, accessible par une URL publique (NFR1)
**And** les variables d'environnement Supabase (publiques côté client, secrètes + passphrase côté serveur) sont configurées sur Vercel
**And** la CI exécute les tests du domaine (Vitest) et le déploiement Vercel est conditionné aux tests verts (AD-13).

---

## Epic 2: Participants & contraintes individuelles

**Goal :** Atteindre la parité avec l'existant sur la gestion des participants et de leurs indisponibilités, le tout persisté dans Supabase via le contrat d'écriture serveur.

### Story 2.1: Ajout multiple et liste des participants

As a utilisateur,
I want ajouter plusieurs participants en une seule saisie (séparés par `,` ou `;`) et les voir dans un tableau,
So that je configure l'équipe rapidement (FR1).

**Acceptance Criteria:**

**Given** la carte Participants affichée
**When** je saisis « Alice, Bob ; Chloé » et valide (clic ou touche Entrée)
**Then** trois participants distincts sont créés (noms découpés et trimés) et persistés via le proxy d'écriture (AD-14)
**And** les espaces superflus et entrées vides sont ignorés
**And** le tableau affiche les colonnes Nom / Actif / Actions
**And** un état vide explicite s'affiche quand aucun participant n'existe (UX-DR1)
**And** les nouveaux participants sont créés `active = true` par défaut.

### Story 2.2: Activer/désactiver, renommer, supprimer un participant

As a utilisateur,
I want basculer l'état actif, renommer et supprimer un participant,
So that je maintiens la liste de l'équipe à jour (FR2, FR3, FR4).

**Acceptance Criteria:**

**Given** un participant existant dans le tableau
**When** je bascule son toggle Actif
**Then** l'état `active` est persisté (update patch partiel) et un participant inactif est visuellement distinct (grisé/barré) — il sera exclu du tirage (FR2)
**And** quand je renomme un participant inline, le nouveau nom est persisté immédiatement (UX-DR3)
**And** quand je supprime un participant, une confirmation est demandée avant action (FR4)
**And** après confirmation de suppression, le participant **et** ses indisponibilités liées sont supprimés (`ON DELETE CASCADE` au niveau DB)
**And** chaque mutation est optimiste avec rollback en cas d'échec selon la classe d'erreur (AD-5, AD-17).

### Story 2.3: Indisponibilités individuelles (jour isolé / plage)

As a utilisateur,
I want ajouter à un participant des indisponibilités en jour isolé ou en plage de dates, et les supprimer unitairement,
So that le planning évite de le désigner ces jours-là (FR5).

**Acceptance Criteria:**

**Given** un participant dans le tableau
**When** j'ouvre son panneau repliable d'indisponibilités (UX-DR4)
**Then** je peux ajouter une indispo « jour isolé » (`kind='day'`, `date1`) ou « plage » (`kind='range'`, `date1`+`date2`)
**And** pour une plage, la validation refuse `date2 < date1`
**And** l'ajout d'un jour déjà présent (doublon) est refusé
**And** je peux supprimer une indispo unitairement
**And** un badge affiche le nombre d'indispos du participant (UX-DR5)
**And** toutes les dates sont stockées en `YYYY-MM-DD` local (jamais UTC) et persistées en base
**And** le prédicat pur `isPersonUnavailable(person, date)` reconnaît correctement ces indispos (testable unitairement — AD-3), l'effet sur la génération étant vérifié en Story 4.2.

---

## Epic 3: Contraintes d'équipe

**Goal :** Offrir les contraintes communes à toute l'équipe : migration des exclusions de groupe récurrentes + ajout des jours fériés et jours off d'équipe, chacun dans son panneau dédié. Chaque contrainte est saisie, persistée et reconnue par le prédicat pur `isTeamNonSessionDay` (AD-3) ; l'intégration effective au planning est vérifiée en Story 4.2.

### Story 3.1: Exclusions de groupe récurrentes

As a utilisateur,
I want définir des jours récurrents ignorés pour tout le groupe (jour de semaine, toutes les N semaines, à partir d'une date de référence),
So that je modélise un Daily qui ne se tient pas certaines semaines (FR6).

**Acceptance Criteria:**

**Given** le panneau repliable « Exclusions de groupe » dans la carte Options (UX-DR4)
**When** je saisis un jour de semaine, une fréquence N et une date de référence
**Then** la validation impose que la date de référence tombe bien sur le jour de semaine choisi
**And** la règle est créée (`day_of_week` 0-6, `every_n` ≥ 1, `ref_date`) et persistée en base
**And** la liste des règles s'affiche sous forme de tags supprimables, avec un badge de comptage (UX-DR5)
**And** je peux supprimer une règle unitairement
**And** le prédicat pur `isTeamNonSessionDay` reconnaît un jour couvert par une exclusion de groupe (testable unitairement — AD-3).

### Story 3.2: Jours fériés (nouveau)

As a utilisateur,
I want saisir manuellement des jours fériés (date + libellé) communs à toute l'équipe,
So that aucun animateur n'y soit planifié sans avoir à le renseigner par personne (FR7).

**Acceptance Criteria:**

**Given** un panneau dédié « Jours fériés » dans la carte Options (UX-DR4)
**When** j'ajoute une date + un libellé
**Then** le jour férié est créé (`date` unique, `label`) et persisté en base
**And** l'ajout d'une date déjà présente (doublon) est refusé (contrainte d'unicité `holidays.date`)
**And** la liste s'affiche triée par date, chaque entrée supprimable unitairement
**And** les dates sont stockées en `YYYY-MM-DD` local (jamais UTC)
**And** le prédicat pur `isTeamNonSessionDay` reconnaît un jour férié comme jour neutralisé (testable unitairement — AD-3) ; l'absence d'animateur et l'absence de trou à la génération sont vérifiées en Story 4.2.

### Story 3.3: Jours off d'équipe (nouveau)

As a utilisateur,
I want saisir des jours « off » d'équipe en jour isolé ou en plage (avec libellé optionnel),
So that je gère une fermeture/un pont pour tout le monde en une seule saisie (FR8).

**Acceptance Criteria:**

**Given** un panneau dédié « Jours off d'équipe » dans la carte Options (UX-DR4)
**When** j'ajoute un jour isolé (`kind='day'`) ou une plage (`kind='range'`, `date1`+`date2`) avec libellé optionnel
**Then** pour une plage, la validation refuse `date2 < date1`
**And** l'entrée est créée et persistée en base
**And** la liste s'affiche avec suppression unitaire
**And** les dates sont stockées en `YYYY-MM-DD` local (jamais UTC)
**And** le prédicat pur `isTeamNonSessionDay` reconnaît un jour off d'équipe comme jour neutralisé (testable unitairement — AD-3) ; l'effet à la génération est vérifié en Story 4.2.

---

## Epic 4: Génération du planning & affichage

**Goal :** Reproduire et fiabiliser l'algorithme EDF en intégrant l'ensemble des contraintes, gérer les options (week-ends, date de début) et afficher le résultat (planning + non-planifiés), avec parité prouvée vs l'ancienne page.

### Story 4.1: Options de génération (week-ends, date de début)

As a utilisateur,
I want régler « ignorer les week-ends » et la date de début,
So that je cadre la période du planning (FR9, FR10).

**Acceptance Criteria:**

**Given** la carte Options
**When** je bascule « ignorer les week-ends » (défaut activée) ou modifie la date de début (défaut = aujourd'hui)
**Then** chaque réglage est persisté dans la ligne unique `settings` via **upsert** sur `id = 'singleton'` (jamais d'insert multiple — conventions)
**And** la date de début est stockée en `YYYY-MM-DD` local
**And** ces réglages sont fournis en entrée de la génération (Story 4.2)
**And** la mutation est optimiste avec réconciliation (AD-5).

### Story 4.2: Algorithme EDF intégrant toutes les contraintes

As a utilisateur,
I want lancer la génération et obtenir un animateur unique par jour ouvré valide,
So that l'ordre est équitable et toutes les contraintes respectées (FR11, FR14).

**Acceptance Criteria:**

**Given** la fonction pure `generateSchedule(input, rng)` dans `lib/domain/` (aucun import React/DOM/Supabase — AD-1)
**When** je clique « 🎲 Lancer la sélection »
**Then** l'ordre initial des actifs est tiré au sort (aléatoire à chaque lancement, via un `rng: () => number` seedable — AD-2, FR14)
**And** un jour est ignoré (neutralisé, pas un trou) s'il est week-end (option active), exclusion de groupe, jour férié ou jour off d'équipe — via l'unique prédicat `isTeamNonSessionDay` (AD-3)
**And** un jour où **tous** les actifs sont indisponibles est ignoré (pas un trou)
**And** la priorité EDF place d'abord la personne dont la fenêtre de disponibilité se ferme le plus tôt (`getLastConsecAvailDay`, calculée via **le même** `isTeamNonSessionDay` — AD-3) ; en cas d'égalité, l'ordre du tirage initial départage
**And** aucun trou n'est créé : un participant qui ne peut être placé sans créer un jour sans candidat reste non planifié (rotation one-shot)
**And** un test paramétré prouve que la boucle de génération et le calcul de deadline EDF utilisent le **même** prédicat `isTeamNonSessionDay` (AD-3)
**And** un **test golden** rejoue un dataset + seed fixe et confirme la parité avec un fixture dérivé de l'ancienne page, sur le périmètre **legacy** (week-ends, exclusions de groupe, indispos) — NFR9, AD-12
**And** l'interaction fériés/jours off ↔ deadline EDF (extension hors legacy) porte ses **propres** tests dédiés, distincts de la parité (AD-12)
**And** la génération reste déterministe à seed donné (NFR7) et quasi instantanée pour ≤ 50 participants / horizon ≤ 1 an (NFR6).

### Story 4.3: Affichage du planning et des non-planifiés

As a utilisateur,
I want voir le planning (date longue FR → animateur) et la liste des non-planifiés,
So that je comprends le résultat et les éventuels écarts (FR12).

**Acceptance Criteria:**

**Given** un planning généré (Story 4.2)
**When** le résultat s'affiche dans la zone Résultat
**Then** un tableau Date / Animateur s'affiche avec les dates en **français** en format long (NFR4)
**And** un compteur de sessions figure dans l'en-tête du résultat (UX-DR5)
**And** un avertissement liste les participants **non planifiés** avec la raison générique (indisponible / placerait un trou) — UX-DR5
**And** un message explicite s'affiche si aucun participant n'est planifiable
**And** la zone Résultat reste responsive et lisible sur mobile (≤ 520 px) — NFR5, UX-DR7.

---

## Epic 5: Redesign UX — rituel de la roue

**Goal :** Transformer le tirage en rituel attendu sans réécrire l'app : parcours guidé, roue animée qui **révèle** (et non re-tire) le résultat EDF, timeline visuelle, exports. Source autoritaire : la spec UX `ux-SpinThatWeeklyWheel-2026-06-23` (`DESIGN.md` + `EXPERIENCE.md` + `mockups/spin-rotation.html`). **Principe directeur :** `generateSchedule` reste la source de vérité du planning ; la roue n'en est que la mise en scène (les deux doivent toujours coïncider).

### Story 5.1: Parcours guidé (stepper) et protection annoncée

As a utilisateur,
I want une page organisée en trois étapes claires (Équipe → Contraintes → Spin) et savoir d'emblée que l'équipe est protégée,
So that je sais où je suis dans le réglage et je ne suis pas surpris par la demande de passphrase (UX-DR8).

**Acceptance Criteria:**

**Given** la page principale
**When** elle se charge
**Then** un **stepper** affiche trois étapes — `1 Équipe` · `2 Contraintes` · `3 Spin` — avec l'état visuel à faire / complétée (`{colors.accent}` + ✓) / active (`{colors.primary}` + halo)
**And** le stepper est **collant** (`position: sticky`, reste fixé en haut au défilement) : un clic sur une étape — depuis n'importe quel endroit de la page — fait défiler en douceur vers la surface correspondante
**And** la navigation est **non bloquante** (pas un wizard) : aucune étape n'est verrouillée, toutes les surfaces restent accessibles à tout moment
**And** l'étape `1 Équipe` est marquée complétée dès qu'il existe au moins un participant actif ; `3 Spin` dès qu'une rotation a été lancée
**And** un **bandeau « 🔒 Équipe protégée »** est visible dans la barre supérieure dès le chargement, indiquant l'état déverrouillée/verrouillée — UX-DR8
**And** la saisie effective de la passphrase reste **paresseuse** (déclenchée au premier write, via le `.passphrase-prompt` existant, mémorisée en `sessionStorage`) — comportement hérité inchangé
**And** la mise en page reste responsive (≤ 520 px) : le stepper reste lisible (libellés condensés) — NFR5, UX-DR13.

### Story 5.2: Règle de rotation à horizon étendu (domaine)

As a utilisateur,
I want que la génération produise exactement un jour ouvré par personne disponible, en débordant sur les semaines suivantes si besoin,
So that chaque membre dispo anime une fois, sans que les jours bloqués ne « consomment » une place (FR15).

**Acceptance Criteria:**

**Given** la fonction pure `generateSchedule(input, rng)` dans `lib/domain/` (aucun import React/DOM/Supabase — AD-1)
**When** la rotation est calculée
**Then** le nombre de sessions produites égale le nombre de **disponibles** (participants `actifs` ET non couverts par une indisponibilité sur leur fenêtre) — chacun apparaît **exactement une fois**
**And** un jour n'est un slot que si `isTeamNonSessionDay` est faux ; les jours bloqués (week-end si option, exclusion de groupe, férié, jour off, ou tous actifs indispo) sont **sautés et non comptés** — via l'unique prédicat (AD-3)
**And** l'**horizon s'étend** au-delà de la semaine courante : la génération continue d'avancer dans le calendrier jusqu'à avoir placé tous les disponibles ; **toute borne d'horizon implicite qui couperait ce parcours est identifiée et levée** (flag archi #1)
**And** l'affectation EDF et l'ordre aléatoire initial (FR14) sont préservés : la roue ne change pas le résultat
**And** un participant ne reste non planifié que s'il ne tient **aucun** slot de l'horizon (cas rare) — l'avertissement existant (Story 4.3) demeure
**And** des **tests** couvrent : nb sessions = nb dispos ; un férié/week-end intercalé n'est pas compté ; un horizon qui déborde sur N semaines place bien tout le monde ; déterminisme à seed donné (NFR7)
**And** la performance reste quasi instantanée (≤ 50 participants, horizon ≤ 1 an — NFR6).

### Story 5.3: Timeline visuelle (grille multi-lignes, sans scrollbar)

As a utilisateur,
I want voir la rotation sous forme de bande de jours visuelle plutôt qu'un tableau,
So that je comprends le planning et ses contraintes d'un coup d'œil (FR12 revisité, UX-DR10).

**Acceptance Criteria:**

**Given** un planning généré (Story 5.2)
**When** la timeline s'affiche
**Then** elle est rendue en **grille `repeat(auto-fit, minmax(96px, 1fr))`** qui **s'enroule sur plusieurs lignes, sans scrollbar horizontale** — UX-DR10
**And** chaque cellule jour montre jour abrégé + numéro + mois ; les **week-ends** sont hachurés (filigrane), les **jours bloqués** (férié/off) sont en `{colors.gold-soft}` avec badge libellé + mention « **sauté** »
**And** chaque jour ouvré attribué affiche l'**animateur** (avatar initiale de couleur stable `{colors.wheel-segments}` + prénom)
**And** la couleur d'un participant est **identique** sur la timeline et sur la roue (attribution par index stable)
**And** la couleur n'est jamais le seul signal (badges texte) — UX-DR13
**And** la timeline reste lisible sur mobile (≤ 520 px) : la grille reflue, toujours sans scrollbar — NFR5.

### Story 5.4: Roue animée — théâtre de révélation du résultat EDF

As a utilisateur,
I want faire tourner une vraie roue qui s'arrête sur l'animateur du jour,
So that la désignation devient un moment de suspense partagé (FR16, UX-DR9, axe A).

**Acceptance Criteria:**

**Given** un planning calculé par `generateSchedule` (Story 5.2) et la timeline (Story 5.3)
**When** je lance le tirage
**Then** une **roue `<canvas>`** affiche un segment par participant disponible (couleur stable, nom lisible), un **pointeur or** fixe à 12h et un moyeu central 🎡 — UX-DR9
**And** au spin, la roue **ralentit en ease-out (~2 s) et s'arrête sur l'animateur que l'EDF a assigné** au jour courant — **elle ne tire pas indépendamment** (animation et planning coïncident toujours)
**And** la personne révélée est **retirée** de la roue (le tour suivant ne contient que les restants), garantissant « chacun une fois »
**And** la cellule de jour correspondante se remplit (animation `pop`) et la révélation est annoncée en **région live `role="status"`** (« {prénom} animera le standup du {jour} {date} ») — le canvas est `aria-hidden` — UX-DR13
**And** sous `prefers-reduced-motion`, la roue **saute directement au résultat** sans rotation, et la cellule se remplit sans animation — UX-DR13
**And** la roue est actionnable au clavier (focus + Entrée/Espace) ; CTA désactivé pendant l'animation (`aria-busy`).

### Story 5.5: Deux modes — Rotation complète / Jour le jour

As a utilisateur,
I want choisir entre tout révéler d'un coup ou un jour à la fois,
So that j'adapte le rituel : planning de la semaine vs suspense quotidien au standup (FR16, axe A).

**Acceptance Criteria:**

**Given** la section Spin avec un sélecteur de mode (`role="tablist"`)
**When** je choisis **« Rotation complète »** et lance la roue
**Then** la roue enchaîne les révélations jour par jour (~0,6 s entre chaque) et remplit toute la timeline, jusqu'au message de fin « Rotation complète ! Chacun anime une fois »
**And** quand je choisis **« Jour le jour »**, chaque clic révèle **un seul** jour (le suivant dans l'ordre chronologique des slots), le CTA passant de « Tirer le premier jour » → « Tirer le jour suivant » → « ✓ Rotation complète »
**And** changer de mode réinitialise proprement la rotation en cours (roue et timeline remises à l'état initial)
**And** les libellés suivent la microcopie figée (Story 5.8) ; le résultat de chaque jour reste annoncé en région live.

### Story 5.6: Persistance de la rotation (mode Jour le jour)

As a membre de l'équipe,
I want que la rotation reprenne au bon jour après un rechargement ou depuis un autre poste,
So that le rituel quotidien « Jour le jour » survive entre les standups (FR18, flag archi #2).

**Acceptance Criteria:**

**Given** une rotation entamée en mode « Jour le jour »
**When** je recharge la page ou l'ouvre depuis un autre navigateur
**Then** la rotation reprend au **même curseur** (mêmes jours déjà révélés, mêmes animateurs), sans re-tirer
**And** la persistance s'appuie sur une **graine + un curseur de progression** stockés (et non sur un résultat figé non reproductible), conformément au déterminisme `generateSchedule` (NFR7) — le `schedule` aujourd'hui éphémère dans le store devient persistant
**And** le mécanisme respecte le contrat d'écriture serveur existant (proxy gardé par passphrase, AD-14) si la graine/curseur sont persistés en base, **ou** est documenté comme état local si la décision d'archi le préfère — la décision est tranchée et tracée
**And** réinitialiser/relancer la rotation réinitialise graine et curseur
**And** un test prouve que (graine + curseur) rejoués reproduisent exactement la même rotation.

> ⚠ Cette story porte une **décision d'architecture** (où et comment persister la rotation). À valider avec l'architecte (`bmad-architecture`) avant implémentation.

### Story 5.7: Exports Slack + CSV avec aperçu

As a utilisateur,
I want exporter le planning en message Slack ou en CSV, en voyant exactement ce qui sera copié,
So that je partage la rotation à l'équipe sans surprise (FR17, UX-DR11).

**Acceptance Criteria:**

**Given** un planning généré
**When** je clique un format d'export
**Then** un **panneau d'aperçu** affiche en monospace le **contenu exact** qui sera copié — UX-DR11
**And** le **Message Slack** est un markdown formaté (titre + une ligne `• {jour} {date} → *{animateur}*` par session)
**And** le **CSV** comporte un en-tête et des **dates ISO `YYYY-MM-DD`** (cohérent avec la convention de dates locales du domaine), une ligne par session
**And** un bouton « Copier » copie le contenu (avec repli silencieux si le presse-papier est indisponible) et confirme par un toast « Copié dans le presse-papier »
**And** tout export est **désactivé** tant qu'aucune rotation n'est tirée (message « Lance d'abord la rotation »)
**And** le **lien public** et le **calendrier `.ics`** sont **hors périmètre** de cette story (différés).

### Story 5.8: Microcopie, branding et accessibilité du mouvement

As a utilisateur,
I want une interface cohérente, joueuse mais sobre, et respectueuse de mes préférences de mouvement,
So that le redesign est fini et confortable pour tous (UX-DR12, UX-DR13).

**Acceptance Criteria:**

**Given** l'ensemble du redesign
**When** je parcours l'application
**Then** le CTA principal de tirage affiche « **Lancer la roue** » (remplace « Lancer la sélection ») et le mark applicatif est **🎡** (favicon + header, remplace 🎲) — UX-DR12
**And** la microcopie suit le tutoiement sobre-joueur et le **vocabulaire produit** (animateur, tirage/planning, jours fériés, jours off d'équipe, indisponibilités, exclusions de groupe)
**And** une action garde son nom dans tout le flux (bouton « Copier » → toast « Copié ») ; les empty states sont des invitations à agir
**And** `prefers-reduced-motion` est respecté partout (roue, `pop`, halos désactivés) — UX-DR13
**And** la couleur n'est jamais le seul signal ; focus visibles (`outline 2px {colors.primary}`) et navigation clavier conservés (hérités)
**And** aucune régression visuelle de l'ADN existant (bleu `#0078d4`, teal, Segoe UI, cartes blanches) — c'est une évolution, pas une réécriture.

### Story 5.9: Navigation et édition rapide entre étapes

As a utilisateur,
I want pouvoir ajuster une contrainte (ajouter une indispo, par ex.) sans quitter le tirage ni tout réinitialiser,
So that le geste rapide récurrent reste fluide malgré le parcours en étapes (UX-DR14).

**Acceptance Criteria:**

**Given** une rotation affichée à l'étape Spin
**When** je clique sur un **chip participant** (y compris dans le résumé d'équipe visible à l'étape Spin)
**Then** l'**éditeur d'indisponibilités** du participant s'ouvre en **popover** par-dessus la page (le même éditeur jour/plage qu'à l'étape Équipe — FR5), sans défilement ni perte de l'état du tirage
**And** je peux ajouter/supprimer une indispo dans le popover ; la modification est persistée via le contrat d'écriture serveur existant (AD-14), optimiste (AD-5)
**And** le popover se ferme par `Échap`, clic extérieur ou bouton de fermeture
**And** dès qu'une **contrainte change** alors qu'un planning est affiché (indispo, férié, jour off, exclusion, toggle actif, option), un **nudge non destructif** « Contraintes mises à jour — relancer la roue ? » apparaît avec une action **Relancer**
**And** tant que je n'ai pas cliqué **Relancer**, l'**ancien planning reste affiché** (aucune réinitialisation silencieuse) ; cliquer **Relancer** recalcule la rotation avec les nouvelles contraintes
**And** le popover et le nudge sont accessibles : focus géré à l'ouverture/fermeture, actionnables au clavier, `role` appropriés, et `prefers-reduced-motion` respecté (UX-DR13)
**And** sur mobile (≤ 520 px), le popover s'affiche en pleine largeur en bas d'écran et reste utilisable (NFR5).
