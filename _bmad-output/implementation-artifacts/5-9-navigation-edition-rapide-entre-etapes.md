---
baseline_commit: 093960ef009367376e160edd872cba59444d48a3
---

# Story 5.9: Navigation et édition rapide entre étapes

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want pouvoir ajuster une contrainte (ajouter une indispo, par ex.) sans quitter le tirage ni tout réinitialiser,
so that le geste rapide récurrent reste fluide malgré le parcours en étapes (UX-DR14).

> **Nature de la story** : DERNIÈRE story d'Epic 5 (redesign UX). Elle livre les **trois derniers composants** spec'd : `roster-chip` (résumé d'équipe cliquable, présent à l'étape ③ Spin), `constraint-popover` (édition d'indispos en popover réutilisant l'éditeur existant), `rerun-nudge` (bandeau « relancer la roue ? » non destructif). Le **changement de comportement** majeur : aujourd'hui un changement de contrainte **n'invalide rien** (le planning ne se recalcule que sur changement de seed Realtime) ; 5.9 remplace l'absence de signal par un **choix explicite** de l'utilisateur (nudge), l'ancien planning restant affiché jusqu'à la relance.

## Acceptance Criteria

Source autoritaire : `_bmad-output/planning-artifacts/epics.md#L537-553` (Story 5.9) + spec UX `ux-designs/.../EXPERIENCE.md#L80-82,L143-150` + `DESIGN.md#L162-169`. ACs numérotés pour traçabilité.

**AC-1 — Popover d'indispos depuis un chip participant (FR5, à l'étape Spin)**
**Given** une rotation affichée à l'étape Spin
**When** je clique sur un **chip participant** (dans le résumé d'équipe `roster-chip` visible à l'étape ③ Spin)
**Then** l'**éditeur d'indisponibilités** du participant s'ouvre en **popover** par-dessus la page — le **même** éditeur jour/plage qu'à l'étape Équipe (`UnavailabilityPanel`, FR5) — sans défilement ni perte de l'état du tirage (roue, révélation, mode, curseur intacts).

**AC-2 — Écriture persistée, optimiste, via le contrat existant**
**And** je peux ajouter/supprimer une indispo dans le popover ; la modification est persistée via le **contrat d'écriture serveur existant** (`/api/unavailabilities`, AD-14), de façon **optimiste** avec rollback (AD-5) — aucun nouveau chemin de données.

**AC-3 — Fermeture du popover**
**And** le popover se ferme par **`Échap`**, **clic extérieur**, ou **bouton de fermeture (✕)**.

**AC-4 — Nudge non destructif sur changement de contrainte**
**And** dès qu'une **contrainte change** alors qu'un planning est affiché (indispo, **férié**, **jour off**, **exclusion de groupe**, **toggle actif**, **option** week-end/date de début), un **nudge non destructif** « **Contraintes mises à jour — relancer la roue ?** » apparaît, avec une action **Relancer**.

**AC-5 — Ancien planning conservé jusqu'à la relance**
**And** tant que je n'ai pas cliqué **Relancer**, l'**ancien planning reste affiché** (aucune réinitialisation silencieuse) ; cliquer **Relancer** recalcule la rotation avec les nouvelles contraintes (nouveau tirage) et fait disparaître le nudge.

**AC-6 — Accessibilité popover + nudge (UX-DR13)**
**And** le popover et le nudge sont accessibles : **focus géré** à l'ouverture (focus déplacé dans le popover) / fermeture (focus rendu au chip déclencheur), actionnables au **clavier**, **`role` appropriés** (`role="dialog"` + `aria-labelledby` pour le popover ; nudge actionnable au clavier), et **`prefers-reduced-motion`** respecté (apparition douce désactivée).

**AC-7 — Mobile ≤ 520 px**
**And** sur mobile (≤ 520 px), le popover s'affiche en **pleine largeur en bas d'écran** (feuille) et reste utilisable, cibles tactiles ≥ 40 px (NFR5).

**AC-8 — Aucune régression (domaine, données, ADN visuel)**
**And** `generateSchedule` reste l'unique source de vérité du planning (AD-1) ; aucune régression du domaine / golden / persistance 5.6 / exports 5.7 ; ADN visuel intact (tokens, #0078d4, teal, Segoe UI, cartes blanches — évolution, pas réécriture).

## Tasks / Subtasks

- [x] **Task 1 — Cœur PUR de détection de péremption + tests (AC-4, AC-5) — ANCRE TDD**
  - [x] 1.1 **[RED]** Créé `tests/schedule-signature.unit.test.ts` (8 cas : a–f). Vérifié rouge (module absent : « Failed to resolve import @/lib/ui/schedule-signature »).
  - [x] 1.2 **[GREEN]** Implémenté `lib/ui/schedule-signature.ts` : helper PUR `scheduleSignature(input) = JSON.stringify(input)`. 8/8 verts.
  - [x] 1.3 La signature dérive de `ScheduleInput` (sortie de `buildScheduleInput`) : participants actifs (id/name/indispos), contraintes (skipWeekends/exclusions/fériés/off), startDate. `pending`/`failed`/`updated_at` déjà éliminés par `buildScheduleInput` ⇒ ignorés (pas de nudge sur écho Realtime sans changement métier).

- [x] **Task 2 — État `scheduleStale` dans le store (AC-4, AC-5)**
  - [x] 2.1 `signatureAtGenerate` ajouté en `useState` ; posé aux TROIS endroits en réutilisant l'`input` déjà construit : `generate()` (après `setSchedule`), init paresseuse au montage (reprise seed), `recomputeFromSeed` (refactoré pour capturer `input` puis `setSignatureAtGenerate`).
  - [x] 2.2 Signature COURANTE calculée avant l'objet `value` via `scheduleSignature(buildScheduleInput(...))` (6 slices) ; `scheduleStale = schedule !== null && signatureAtGenerate !== null && currentSignature !== signatureAtGenerate` exposé dans `StoreValue` + objet retourné.
  - [x] 2.3 Auto-correction confirmée : `scheduleStale` est purement dérivé (recalculé à chaque rendu) ⇒ un rollback optimiste rétablit le slice, donc la signature, donc masque le nudge. Aucun `markStale()` dispersé.
  - [x] 2.4 `generate()` sert de « Relancer » (re-snapshot signature ⇒ false). Aucune nouvelle action de store.

- [x] **Task 3 — `roster-chip` : résumé d'équipe cliquable à l'étape Spin (AC-1, AC-8)**
  - [x] 3.1 Créé `components/RosterChips.tsx` : un chip par participant ; avatar `initialOf` + `colorForIndex(buildColorIndexMap(actifs))` pour les actifs (contrat partagé), inactifs grisés (`.chip.out` : opacity .6 + barré + « · inactif »).
  - [x] 3.2 Chaque chip = `<button>` (hover bordure `--primary`, cursor pointer via CSS), `aria-label` « Modifier les indisponibilités de {prénom} », `min-height: 40px`. `onOpen(p.id)`.
  - [x] 3.3 Monté dans `ScheduleResult.tsx` dans `schedule-result`, après le nudge, avant la roue. Contrat couleur réutilisé (même base d'index que la roue/timeline).
  - [x] 3.4 Badge de comptage NON ajouté (nice-to-have hors AC) ; « absent aujourd'hui » NON calculé (hors périmètre). État chip = `· inactif` seulement.

- [x] **Task 4 — `constraint-popover` : éditeur d'indispos en popover (AC-1, AC-2, AC-3, AC-6, AC-7)**
  - [x] 4.1 Créé `components/ConstraintPopover.tsx` : props `{ participantId, participantName, onClose }` ; contenu = `<UnavailabilityPanel participantId={...} />` repris TEL QUEL ; en-tête « Indispos de {prénom} » + ✕.
  - [x] 4.2 `role="dialog"` + `aria-labelledby` (titre) ; voile `.popover-scrim` `rgba(15,23,42,.08)` non masquant.
  - [x] 4.3 Fermeture : Échap (listener `document`, effet séparé), clic extérieur (`onMouseDown` du voile, `stopPropagation` sur la carte), bouton ✕.
  - [x] 4.4 Focus : effet de montage UNIQUEMENT (`[]`) — capture le chip, déplace le focus dans le popover (1er focusable = ✕), restaure le focus au chip à la fermeture. **Bug évité** : `onClose` stabilisé via `useCallback` côté parent + effet focus dissocié de l'effet Échap (sinon le focus sauterait à chaque ré-rendu, ex. ajout d'indispo).
  - [x] 4.5 État `openParticipantId` local à `ScheduleResult` (`useState<string | null>`), pas dans le store. `RosterChips` reçoit `onOpen`.
  - [x] 4.6 Écriture via store (`UnavailabilityPanel` → `addUnavailability`/`removeUnavailability`) ⇒ AC-2 sans code données neuf. La fermeture ne relance pas (c'est le nudge `scheduleStale`).

- [x] **Task 5 — `rerun-nudge` : bandeau de relance non destructif (AC-4, AC-5, AC-6)**
  - [x] 5.1 Créé `components/RerunNudge.tsx` : rendu conditionnel sur `scheduleStale` (store) ; « Contraintes mises à jour — relancer la roue ? » + bouton **Relancer** (primaire compact).
  - [x] 5.2 **Relancer** = `generate()` ⇒ nouveau seed + re-snapshot signature ⇒ `scheduleStale=false` ⇒ nudge disparaît, nouveau planning (pattern reset+auto-spin `ScheduleResult:95-110` inchangé).
  - [x] 5.3 Placé sous `schedule-header`, avant les chips et la roue ; non modal, ne recouvre jamais le planning.
  - [x] 5.4 A11y : `role="status"`, bouton focusable ; apparition `nudge-in` désactivée sous reduced-motion (CSS).

- [x] **Task 6 — CSS (tokens RÉELS) + reduced-motion + mobile (AC-6, AC-7, AC-8)**
  - [x] 6.1 Classes ajoutées dans `app/globals.css` : `.roster`/`.chip`/`.chip-av`/`.chip.out`/`.chip-state` ; `.popover-scrim`/`.constraint-popover`/`.popover-head`/`.popover-title`/`.popover-close` ; `.rerun-nudge`/`-text`/`button`. Tokens RÉELS uniquement. NB : `.chip` et `.popover-close` neutralisent le style `<button>` primaire de base (fond bleu/ombre) ; « Relancer » l'hérite (compact). Bordure nudge = `--excl-border` (#bfdbfe).
  - [x] 6.2 Reduced-motion (bloc `@media` existant) : `.rerun-nudge`/`.constraint-popover` `animation: none`, `.chip` `transition: none` (additif). Couvre aussi `sheet-in` mobile (même élément).
  - [x] 6.3 Mobile `@media (max-width: 520px)` : popover en feuille pleine largeur en bas (`align-items: flex-end`, `width:100%`, radius haut, `sheet-in`) ; cibles ≥ 40 px (`.chip min-height`).
  - [x] 6.4 Tokens du mockup (`--muted`/`--text`/`--font`) NON utilisés ; chaque token vérifié contre `globals.css:1-31`.

- [x] **Task 7 — Gates & non-régression (AC-8)**
  - [x] 7.1 `npx tsc --noEmit` = 0 ; `npx eslint .` = 0.
  - [x] 7.2 `npx vitest run` : **354/354** (35 fichiers ; +8 `schedule-signature`). Domaine/golden/wheel/timeline/spin-mode/rotation-resume/exports INTACTS.
  - [x] 7.3 `npm run build` OK ; **8 routes API inchangées** + `/icon.svg` ; aucune migration ; aucune écriture serveur nouvelle.
  - [x] 7.4 Passe humaine navigateur **à faire** (non automatisable) : chip → popover (Échap/clic extérieur/✕), focus rendu au chip, ajout indispo persiste + nudge apparaît, ancien planning conservé, Relancer recalcule, mobile feuille pleine largeur, `prefers-reduced-motion` calme, multi-onglet (changement d'un autre poste déclenche aussi le nudge).

## Dev Notes

### Contexte & source de vérité
- **Dernière story du redesign Epic 5.** Spec UX autoritaire : `ux-designs/ux-SpinThatWeeklyWheel-2026-06-23/` — `EXPERIENCE.md#L80-82` (les 3 comportements), `#L143-150` (Flow 3 « édition rapide en plein tirage »), `DESIGN.md#L162-169` (`roster-chip`, `constraint-popover`, `rerun-nudge`).
- **`generateSchedule` reste la source de vérité du planning** (AD-1). La 5.9 ne touche **ni domaine ni données** : elle ajoute un cœur pur de *détection* (signature), 3 composants UI, et un état dérivé dans le store. Le « Relancer » réutilise `generate()` existant.

### Décision d'architecture centrale — détection de péremption PURE et DÉRIVÉE (pas de `markStale` dispersé)
**Constat code (vérifié) :** aujourd'hui un changement de contrainte **n'invalide pas** le planning. Le store ne recalcule le schedule **que** sur changement de `rotation_state.seed` via le 7ᵉ abonnement Realtime (`participants-store.tsx:974,1003`). Les abonnements de contraintes (`unavailabilities`/`settings`/`group_exclusions`/`holidays`/`team_off_days`, lignes ~835-954) mettent à jour **leur slice** mais **ne touchent pas** le schedule. C'est précisément le « trou » que 5.9 comble — non pas en recalculant en silence, mais en **signalant** (nudge).

**Approche retenue — signature dérivée :**
- Un helper PUR `scheduleSignature(input)` produit une empreinte déterministe de **l'exact ensemble d'entrées** qui pilotent le tirage (= sortie de `buildScheduleInput`, `participants-store.tsx:117-135`).
- Le store mémorise `signatureAtGenerate` (instantané au moment où le schedule courant a été produit) et expose `scheduleStale = schedule != null && signature(maintenant) !== signatureAtGenerate`.
- **Pourquoi cette approche** : (1) **un seul point de vérité**, pas de `markStale()` à appeler dans ~6 reducers/actions (oubli garanti sinon → AC-4 partiellement mort) ; (2) capte **aussi** les changements venus d'un **autre poste** via Realtime (le slice change → la signature change) — exigé par Flow 3 + AD-6 ; (3) **auto-correcteur** : un rollback optimiste (AD-5) rétablit le slice → la signature → le nudge disparaît seul ; (4) **testable** en pur (ancre TDD).

**Alternatives REJETÉES :**
- ❌ `markScheduleStale()` appelé dans chaque action de mutation : fragile (oublis), ne capte pas les changements Realtime d'un autre client.
- ❌ Recalculer-puis-diff (`recomputeFromSeed` + comparer ancien/nouveau planning) : plus coûteux, et inutile — l'AC dit « **dès qu'une contrainte change** … le nudge apparaît », pas « si le planning changerait ». Une signature des **entrées** suffit et est plus simple.

### Stack & conventions (architecture)
- Next.js **16.2.x** (App Router), React **19.2**, TypeScript **5.1+**. **Pas de Tailwind** : CSS maison, tokens `app/globals.css:1-31`. [Source: ARCHITECTURE-SPINE.md#L202-211]
- **UI 100 % français** (NFR4) ; dates `YYYY-MM-DD` en local (jamais UTC). [Source: ARCHITECTURE-SPINE.md#L189-197]
- **Dépendances descendantes** UI → store → data → domaine ; le domaine est une feuille (AD-1, AD-11). Le helper de signature va dans `lib/ui/` (logique pure de présentation, comme `spin-mode.ts`, `timeline.ts`, `participant-colors.ts`), **zéro import React/DOM/Supabase**, testable en env node. [Source: ARCHITECTURE-SPINE.md#L48-67]
- Écritures d'indispos = **contrat existant inchangé** : optimiste → `POST /api/unavailabilities` avec `x-team-passphrase`, rollback selon AD-17 (AD-5, AD-7, AD-14). [Source: ARCHITECTURE-SPINE.md#L157-161]

### Cartographie de l'existant — fichiers à TOUCHER / CRÉER

| Fichier:ligne | État actuel | Changement 5.9 |
|---|---|---|
| `lib/ui/schedule-signature.ts` | n'existe pas | **CRÉER** : `scheduleSignature(input): string` pur (Task 1) |
| `tests/schedule-signature.unit.test.ts` | n'existe pas | **CRÉER** : ancre TDD rouge→vert (Task 1) |
| `lib/store/participants-store.tsx:117-135` | `buildScheduleInput(...)` (extrait 5.6) | réutilisé pour calculer la signature courante (aucune modif de la fn) |
| `lib/store/participants-store.tsx:259-273` | init paresseuse schedule (reprise seed 5.6) | + snapshot `signatureAtGenerate` au montage si schedule produit |
| `lib/store/participants-store.tsx:781-801` | `generate()` (nouveau seed) | + re-snapshot `signatureAtGenerate` après `setSchedule` |
| `lib/store/participants-store.tsx:~974` | `recomputeFromSeed` (7ᵉ abo, relance autre poste) | + re-snapshot `signatureAtGenerate` (nouveau planning ⇒ non périmé) |
| `lib/store/participants-store.tsx:169-199 / 1034-1054` | interface `StoreValue` + objet retourné | + `scheduleStale: boolean` (dérivé) |
| `components/ScheduleResult.tsx:85` | map couleurs actives (`buildColorIndexMap`) | réutilisée par les chips (pas de 2ᵉ map) |
| `components/ScheduleResult.tsx:~338-345` | début du bloc `schedule-result` (header + roue) | + `<RerunNudge>` + `<RosterChips>` + `<ConstraintPopover>` (état `openParticipantId` local) |
| `components/RosterChips.tsx` | n'existe pas | **CRÉER** (Task 3) |
| `components/ConstraintPopover.tsx` | n'existe pas | **CRÉER**, wrappe `UnavailabilityPanel` (Task 4) |
| `components/RerunNudge.tsx` | n'existe pas | **CRÉER** (ou inline) (Task 5) |
| `app/globals.css:1-31` | tokens RÉELS | source des noms de tokens (NE PAS inventer) |
| `app/globals.css` (fin) | styles existants + reduced-motion ~1063-1072 | + classes chips/popover/nudge + reduced-motion additif + `@media ≤520px` (Task 6) |

### Déjà conforme / réutilisable — NE PAS réécrire
- **`UnavailabilityPanel`** (`components/UnavailabilityPanel.tsx`, 106 l.) : éditeur jour/plage **déjà découplé**, props `{ participantId }` pures, lit/écrit via `useParticipants()` (`addUnavailability`/`removeUnavailability`). Se **wrappe directement** dans le popover — aucune extraction nécessaire. C'est le **même** éditeur qu'à l'étape Équipe (FR5), exactement ce que demande l'AC-1.
- **Contrat couleur partagé** : `lib/ui/participant-colors.ts` (`colorForIndex`, `buildColorIndexMap`, `initialOf`, `WHEEL_SEGMENT_COLORS`). Les avatars de chips DOIVENT le réutiliser ⇒ une personne garde sa couleur sur la roue, la timeline ET son chip (AC-8, DESIGN.md:99).
- **`generate()`** : action store existante (nouveau seed + reset+auto-spin via pattern `ScheduleResult.tsx:95-110`). Le bouton « Relancer » du nudge **l'appelle tel quel** — pas de nouvelle action.
- **Tokens « jour bloqué »/gold** : `--gold`, `--gold-soft`, `--gold-border`, `--primary-light` déjà définis (`globals.css:27-30,5`).
- **Pattern reduced-motion** : double garde JS (`typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches`, déjà utilisé `ScheduleResult.tsx:208-211`) + CSS `@media`. Réutiliser tel quel.
- **`:focus-visible outline 2px var(--primary)`** global (`globals.css:172`) — couvre déjà le focus des nouveaux boutons/chips ; ne pas désactiver.

### Apprentissages stories précédentes (5.5→5.8)
- **Noms de tokens RÉELS** : `--text-color`/`--text-muted` (PAS `--text`/`--muted`), `--primary` (PAS `--font`). Le **mockup** `spin-rotation.html` utilise `--muted` — c'est le mockup, pas le projet. Erreur déjà commise/corrigée en 5.7 et 5.8 : vérifier chaque token contre `globals.css:1-31`.
- **Police** : `font-family: inherit` (Segoe UI système), aucune variable `--font`.
- **Stories 5.x = surtout UI** : peu/pas de tests composant React. La logique pure isolable est testée (ici : `schedule-signature`) ; le reste (popover, chips, nudge, CSS) = **passe humaine navigateur**. NE PAS inventer de tests de rendu React — ce n'est pas le pattern du projet.
- **`setState` pendant le rendu, pas dans un effet** : `ScheduleResult` ajuste `prevSchedule`/`revealedCount` en cours de rendu (pattern « ajuster l'état pendant le rendu », `:94-110`). Pour `scheduleStale` (dérivé pur, lu du store), aucun effet n'est requis — c'est une valeur calculée, pas un état à synchroniser.

### Approche TDD
- **Seule logique pure neuve = `lib/ui/schedule-signature.ts`** → cycle **rouge/vert** sur `tests/schedule-signature.unit.test.ts` (Task 1). C'est l'ancre test-first.
- Store (`scheduleStale`) : dérivé d'une fn pure déjà testée + d'un snapshot trivial ; couvert indirectement + passe navigateur (multi-onglet). Si tu veux durcir : un test d'intégration léger du store est possible mais hors pattern habituel — ne pas sur-investir.
- Composants (popover/chips/nudge) + CSS : non unitairement testables → audit + passe navigateur (Task 7.4).

### Project Structure Notes
- Tous les chemins sont relatifs à `daily-wheel/` (racine de l'app Next dans le repo).
- **3 nouveaux composants** (`RosterChips`, `ConstraintPopover`, `RerunNudge`) + **1 helper pur** (`schedule-signature.ts`) + **1 test**. Aucune nouvelle arborescence.
- **0 migration SQL, 0 route API, 0 écriture serveur nouvelle.** Story **100 % client/présentation + store** (l'écriture d'indispos réutilise le contrat existant). Les 8 routes API restent inchangées.

### References
- [Source: epics.md#L537-553] — Story 5.9 (user story + ACs verbatim, UX-DR14)
- [Source: epics.md#L80] — UX-DR14 (stepper collant, popover indispos, nudge non destructif)
- [Source: ux-designs/.../EXPERIENCE.md#L80-82] — stepper collant / popover édition rapide / nudge relance non destructive
- [Source: ux-designs/.../EXPERIENCE.md#L143-150] — Flow 3 (Nadia ajoute une indispo en plein tirage, climax = nudge)
- [Source: ux-designs/.../DESIGN.md#L162-169] — `roster-chip` (cliquable, présent à ③), `constraint-popover` (~320px, feuille <520px, voile léger non masquant), `rerun-nudge` (fond `primary-light`, bordure `#bfdbfe`, non modal)
- [Source: ARCHITECTURE-SPINE.md#L48-67] — couches & dépendances descendantes ; [#L69-79] AD-1/AD-2 domaine pur ; [#L96-119] AD-5/AD-6/AD-7 optimiste/Realtime/asymétrie ; [#L157-167] AD-14/AD-15 contrat écriture
- [Source: components/UnavailabilityPanel.tsx] — éditeur jour/plage réutilisable (props `{ participantId }`)
- [Source: lib/ui/participant-colors.ts] — contrat couleur partagé (`colorForIndex`/`buildColorIndexMap`/`initialOf`)
- [Source: lib/store/participants-store.tsx#L117-135] `buildScheduleInput` ; [#L259-273] init reprise seed ; [#L781-801] `generate()` ; [#L969-1024] 7ᵉ abonnement `rotation_state`/`recomputeFromSeed`
- [Source: components/ScheduleResult.tsx#L80-110] map couleurs + pattern reset ; [#L208-211] garde reduced-motion ; [#L313-345] zone d'actions/rendu résultat
- [Source: app/globals.css#L1-31] tokens RÉELS ; [#L172] focus-visible ; [#L~1063-1072] bloc reduced-motion
- [Source: 5-8-...md] — apprentissages tokens/reduced-motion/UI-only

### Hors périmètre (ne PAS faire — anti gold-plating)
- ❌ Toucher le **domaine** (`lib/domain/`), le golden, la persistance 5.6, les exports 5.7, le spin-mode 5.5, la roue/timeline.
- ❌ Nouvelle table / route API / migration / écriture serveur (le popover réutilise `/api/unavailabilities`).
- ❌ Édition d'autres contraintes dans le popover (fériés/off/exclusions) — le popover est l'éditeur **d'indispos d'un participant** (FR5), conformément à l'AC. Ces contraintes restent éditées dans leurs panneaux (étape Contraintes) ; leur changement déclenche quand même le nudge (via la signature).
- ❌ Flèche pointeur ancrée précisément au chip (nice-to-have DESIGN) : un popover proprement positionné/centré suffit ; la flèche est un raffinement optionnel.
- ❌ Calcul « absent aujourd'hui / sur l'horizon » pour l'état du chip : se limiter à `· inactif` (donnée `active` existante) ; le badge de comptage d'indispos est optionnel.
- ❌ Focus-trap complet via librairie : gérer focus à l'ouverture/fermeture + Échap + clic extérieur suffit pour l'AC-6 (« focus géré », « role appropriés »).
- ❌ Rendre le **stepper** collant : il l'est déjà (5.1, `globals.css .stepper position:sticky`) — vérifier seulement, ne pas refaire.

### Questions ouvertes (décisions par défaut prises ; à confirmer avec Solo)
- **Q1 — Portée du nudge** : défaut = le nudge apparaît dès qu'**une** entrée de `buildScheduleInput` change (couvre la liste de l'AC-4 : indispo/férié/off/exclusion/toggle actif/options) **et** les changements venus d'un autre poste (Realtime). Alternative plus restrictive (uniquement si le planning **changerait** réellement) rejetée car plus complexe et non demandée par l'AC.
- **Q2 — Comportement de « Relancer »** : défaut = **nouveau tirage** (`generate()`, nouveau seed) — cohérent avec « relancer la roue » et le CTA « Relancer la rotation ». Alternative = recalcul au même seed (rejouabilité) ; non retenue car l'utilisateur attend une *nouvelle* roue.
- **Q3 — État du chip** : défaut = `· inactif` pour les inactifs (donnée existante), avatar coloré pour les actifs. L'état « · absente » (indispo) du mockup EXPERIENCE.md:129 est laissé optionnel pour éviter d'introduire un calcul de disponibilité à l'étape Spin.
- **Q4 — `aria-modal`** : défaut = `role="dialog"` **sans** `aria-modal=true` (le tirage reste visible/non bloquant, voile non masquant — spec DESIGN:166). À confirmer si une passe a11y exige un focus-trap strict.

## Dev Agent Record

### Agent Model Used

Amelia (Senior Software Engineer) — claude-opus-4-8[1m]

### Debug Log References

- `npx vitest run tests/schedule-signature.unit.test.ts` → RED (module `@/lib/ui/schedule-signature` absent) puis GREEN (8/8) après implémentation.
- `npx tsc --noEmit` → 0 ; `npx eslint .` → 0.
- `npx vitest run` → **354/354** (35 fichiers ; baseline 346 + 8 nouveaux).
- `npm run build` → OK ; 8 routes API + `/icon.svg` ; aucune route nouvelle.

### Completion Notes List

Dernière story d'Epic 5 livrée — les 3 derniers composants du redesign + le passage d'un planning « silencieusement invalidé » à un **choix explicite** (nudge).

- **AC-1/2/3 (popover)** : `ConstraintPopover` wrappe `UnavailabilityPanel` TEL QUEL (même éditeur FR5) ; ouvert depuis un chip ; écriture optimiste via le contrat existant `/api/unavailabilities` (0 code données neuf) ; fermeture Échap / clic extérieur / ✕.
- **AC-4/5 (nudge)** : détection PURE par signature des entrées de `buildScheduleInput` (`lib/ui/schedule-signature.ts`, ancre TDD 8 tests). `signatureAtGenerate` figé à `generate()`/montage/`recomputeFromSeed` ; `scheduleStale` dérivé exposé par le store. `RerunNudge` non modal, ancien planning conservé ; « Relancer » = `generate()`. Capte aussi les changements Realtime d'un autre poste ; auto-correcteur sur rollback optimiste.
- **AC-6 (a11y)** : `role="dialog"`+`aria-labelledby`, focus déplacé puis rendu au chip, Échap, `role="status"` sur le nudge, reduced-motion (CSS). **Bug évité** : `onClose` stabilisé (`useCallback`) + effet focus dissocié de l'effet Échap → pas de saut de focus au ré-rendu.
- **AC-7 (mobile)** : popover en feuille pleine largeur en bas ≤520px ; chips ≥40px.
- **AC-8 (non-régression)** : tsc 0 / eslint 0 / 354 tests / build OK ; domaine/golden/wheel/timeline/spin-mode/rotation-resume/exports INTACTS ; 8 routes API inchangées ; ADN visuel intact (tokens réels, palette, Segoe UI).

**À FAIRE en passe humaine** (non automatisable, stories 5.x = surtout UI) : contrôle navigateur — chip→popover (Échap/clic-extérieur/✕), retour focus au chip, ajout indispo persiste + nudge apparaît, ancien planning conservé, Relancer recalcule, feuille mobile, `prefers-reduced-motion` calme, multi-onglet (changement distant → nudge).

**Décisions par défaut appliquées (questions ouvertes)** : Q1 = nudge sur toute entrée de `buildScheduleInput` (+ Realtime) ; Q2 = Relancer = nouveau tirage (`generate()`) ; Q3 = chip `· inactif` seulement (pas de « absente », pas de badge comptage) ; Q4 = `role="dialog"` sans `aria-modal` (non bloquant, voile non masquant). Réversibles.

### File List

- `daily-wheel/lib/ui/schedule-signature.ts` — **ajouté** (cœur pur de signature, ancre TDD)
- `daily-wheel/tests/schedule-signature.unit.test.ts` — **ajouté** (8 tests)
- `daily-wheel/components/RosterChips.tsx` — **ajouté** (résumé d'équipe cliquable)
- `daily-wheel/components/ConstraintPopover.tsx` — **ajouté** (popover d'indispos, wrappe `UnavailabilityPanel`)
- `daily-wheel/components/RerunNudge.tsx` — **ajouté** (bandeau de relance)
- `daily-wheel/lib/store/participants-store.tsx` — modifié (`signatureAtGenerate` + `scheduleStale` + import ; snapshot dans `generate()`/init/`recomputeFromSeed`)
- `daily-wheel/components/ScheduleResult.tsx` — modifié (imports + `openParticipantId` local + `closePopover` stable + montage nudge/chips/popover)
- `daily-wheel/app/globals.css` — modifié (classes chips/popover/nudge + reduced-motion additif + feuille mobile ≤520px)

## Change Log

- 2026-06-24 — Story 5.9 implémentée (Amelia/dev-story) : in-progress → review (baseline 093960e). DERNIÈRE story d'Epic 5. Cœur pur `lib/ui/schedule-signature.ts` (ancre TDD rouge→vert, 8 tests) ; `scheduleStale` dérivé dans le store (snapshot `signatureAtGenerate` à `generate()`/montage/`recomputeFromSeed`, capte aussi Realtime + auto-correcteur sur rollback) ; 3 composants — `RosterChips` (contrat couleur partagé réutilisé), `ConstraintPopover` (wrappe `UnavailabilityPanel`, Échap/clic-extérieur/✕, focus géré + restauré, effet focus dissocié + `onClose` stable), `RerunNudge` (non modal, Relancer=`generate()`) ; CSS tokens RÉELS + reduced-motion + feuille mobile ≤520px. 100 % client/store : 0 domaine / 0 migration / 0 route / 0 écriture nouvelle (indispos via AD-14). tsc 0 / eslint 0 / 354 tests (35 fichiers) / build OK ; 8 routes API + domaine/golden/wheel/timeline/spin-mode/rotation-resume/exports INTACTS. Passe navigateur à faire ; 4 décisions par défaut sur les questions ouvertes.

- 2026-06-24 — Story 5.9 contextée (Amelia/create-story) : backlog → ready-for-dev (epic-5 déjà in-progress ; **dernière story d'Epic 5**). Livre les 3 derniers composants du redesign : `roster-chip` (résumé d'équipe cliquable à l'étape Spin, réutilise le contrat couleur `participant-colors.ts`), `constraint-popover` (wrappe `UnavailabilityPanel` tel quel — même éditeur FR5, Échap/clic-extérieur/✕, focus géré, feuille pleine largeur ≤520px), `rerun-nudge` (bandeau « Contraintes mises à jour — relancer la roue ? », non modal, ancien planning conservé jusqu'à Relancer=`generate()`). DÉCISION ARCHI CENTRALE : péremption détectée par **signature PURE dérivée** des entrées de `buildScheduleInput` (cœur testable `lib/ui/schedule-signature.ts` = ancre TDD), snapshotée à `generate()`/montage/`recomputeFromSeed` ; `scheduleStale` exposé par le store ⇒ capte aussi les changements Realtime d'un autre poste + auto-correcteur sur rollback optimiste. Rejeté : `markStale` dispersé + recompute-diff. 100 % client/store : 0 domaine / 0 migration / 0 route / 0 écriture nouvelle (indispos via contrat existant AD-14). Domaine/golden/wheel/timeline/spin-mode/rotation-resume/exports INTACTS. 4 questions ouvertes (portée nudge, sémantique Relancer, état chip, aria-modal).
