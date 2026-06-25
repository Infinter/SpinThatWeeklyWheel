---
baseline_commit: d10e4ff
---

# Story 5.16: Persistance de la rotation en best-effort (plus de « Échec temporaire » au spin)

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : changement réalisé en quick-flow à la demande de Solo, puis
     documenté ici a posteriori. Livré au commit e2b8f3e. -->

## Story

As a utilisateur de Daily Wheel,
I want que lancer la roue ne fasse pas surgir un message « Échec temporaire » quand la sauvegarde de la rotation échoue,
so that je ne sois pas alarmé par un échec d'une sauvegarde best-effort alors que la roue et le planning fonctionnent.

## Contexte & décisions (échange Solo 2026-06-24)

- **Problème signalé** : « quand je lance la roue j'ai un message "échec temporaire" qui arrive dans l'onglet Équipe. Pourquoi ? Si c'est injustifié retire-le. »
- **Diagnostic** : lancer la roue appelle `generate()` qui **persiste la graine dans `rotation_state`** (story 5.6) via la file d'écriture partagée. Cette écriture échoue (transitoire/5xx) — cause la plus probable : la **migration `rotation_state` n'est pas appliquée** à la base Supabase (TODO manuel de la 5.6). La roue fonctionne (planning calculé côté client) ; seule la *persistance pour reprise après reload* échoue.
- **Où** : le bandeau d'erreur global est rendu dans `ParticipantsCard` (onglet Équipe) → avec le commutateur de stepper (5.14), une erreur déclenchée depuis l'onglet Spin n'apparaît que sur Équipe.
- **Décision Solo** : option « **Silencieux seulement** » — rendre la persistance `rotation_state` **best-effort** (un échec ne lève plus le bandeau). Conforme à la « **dégradation gracieuse** » promise par la 5.6. Les erreurs d'édition (participants, contraintes) restent affichées.
- **Non retenu** : déplacer le bandeau global hors de l'onglet Équipe (proposé, non demandé) ; appliquer la migration reste le vrai correctif pour activer la reprise après reload (action Solo, hors code).

## Acceptance Criteria

1. **AC-1** — Un échec d'écriture de `rotation_state` (au lancement de la roue / persistance curseur/mode) **ne lève plus** le bandeau d'erreur global (« Échec temporaire » et autres).
2. **AC-2** — La mécanique optimiste/rollback/retry reste appliquée (best-effort ≠ ignorer) ; seule la **remontée d'erreur visible** est supprimée pour cette écriture.
3. **AC-3** — Les écritures d'**édition** (participants, indisponibilités, contraintes, settings) continuent d'afficher leurs erreurs normalement (comportement inchangé).
4. **AC-4** — La roue et l'affichage du planning fonctionnent indépendamment de la réussite de la persistance.
5. **AC-5** — Aucune régression : tsc/eslint/tests/build verts.

## Tasks / Subtasks

- [x] **Task 1 — Drapeau best-effort (AC-1, AC-2, AC-3)**
  - [x] `lib/store/use-write-queue.ts` : ajout de `WriteSpec.silent?: boolean` ; les 5 appels `setError(...)` (inattendu/validation/conflict/transient×2) gardés par `if (!spec.silent)`.
- [x] **Task 2 — Activation sur rotation_state (AC-1)**
  - [x] `lib/store/participants-store.tsx` : `updateRotationState` passe `silent: true` dans son `WriteSpec`.
- [x] **Task 3 — Gates (AC-5)**
  - [x] tsc 0 / eslint 0 / **354 tests** / build OK. Pas de test de hook ajouté (le projet ne teste pas les hooks React ; la logique pure `write-error.ts` est inchangée) → vérifié en passe navigateur.

## Dev Notes

- **Pourquoi pas de test unitaire** : exercer `runWrite` exigerait de rendre le hook React, pattern absent du projet (stories 5.x = « pas de tests de hook/composant »). La classification d'erreur pure (`write-error.ts`) n'est pas touchée. Garde conditionnelle simple → passe navigateur.
- **Prompt passphrase inchangé** : seule la remontée d'erreur est supprimée ; le prompt passphrase (légitime, AD-8) reste actif.
- **Vrai correctif de la reprise** : appliquer la migration `rotation_state` (`supabase db push`) — alors les écritures réussissent et la reprise après reload fonctionne, sans rien changer au code.
- **Masquage assumé** : c'est un vrai échec masqué côté UI ; justifié car la persistance est best-effort par design (5.6).

### References

- [Source: daily-wheel/lib/store/use-write-queue.ts#WriteSpec.silent + gardes !spec.silent]
- [Source: daily-wheel/lib/store/participants-store.tsx#updateRotationState (silent: true)]
- [Source: architecture ARCHITECTURE-SPINE.md#AD-17 (taxonomie d'erreurs) ; story 5.6 (dégradation gracieuse)]
- [Source: échange Solo 2026-06-24]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1→4 : `WriteSpec.silent` + `updateRotationState` en `silent: true` ; édition inchangée ; roue/planning indépendants.
- ✅ AC-5 : tsc 0 / eslint 0 / 354 tests / build OK.
- Livré et poussé : commit `e2b8f3e` (`fix(rotation): persistance best-effort — l'échec de sauvegarde ne nagge plus`).
- **Rappel** : reprise après reload = appliquer la migration `rotation_state` (action Solo, hors code).

### Change Log

- 2026-06-24 — Persistance rotation best-effort (drapeau WriteSpec.silent) — « Échec temporaire » supprimé au spin. 2 fichiers, +14/-5. Commit `e2b8f3e`.
- 2026-06-25 — Story rétroactive rédigée a posteriori (Amelia) à la demande de Solo.

### File List

- `daily-wheel/lib/store/use-write-queue.ts` (MODIFIED — WriteSpec.silent + gardes !spec.silent)
- `daily-wheel/lib/store/participants-store.tsx` (MODIFIED — updateRotationState silent: true)
