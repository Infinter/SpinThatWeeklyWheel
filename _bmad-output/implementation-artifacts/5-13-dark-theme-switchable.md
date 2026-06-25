---
baseline_commit: e2b8f3e
---

# Story 5.13: Dark theme switchable (bouton clair/sombre)

Status: done

<!-- Story rétroactive (Amelia, 2026-06-25) : feature réalisée en quick-flow à la demande de Solo (« go
     dev un dark theme avec un bouton de switch white/dark »), puis documentée ici a posteriori. Livrée au
     commit b61cf4d — chronologiquement AVANT les stories 5.10→5.12 (qui ont ce commit pour ancêtre) ; le
     numéro 5.13 est simplement le prochain identifiant libre (5.10→5.12 déjà attribués). -->

## Story

As a utilisateur de Daily Wheel,
I want pouvoir basculer l'interface entre thème clair et sombre via un bouton, mon choix étant mémorisé,
so that je peux utiliser l'app confortablement selon mon environnement lumineux et ma préférence.

## Contexte & décisions (échange Solo 2026-06-24)

- **Demande** : « go dev un dark theme avec un bouton de switch white/dark ». La 5.8 avait explicitement mis le mode sombre **hors-périmètre** → c'est donc une nouvelle feature, pas une finition.
- **Archi favorable** : ~25 tokens CSS centralisés dans `:root` (`app/globals.css`) → le dark theme est surtout un **jeu de tokens sombres** + la plomberie du switch, pas une réécriture.
- **Décision 1 — Mécanisme** : `data-theme="dark"` sur `<html>` ; surcharge des tokens via `[data-theme='dark'] { … }`. Le store client (`components/theme.tsx`) lit/écrit cet attribut comme **source de vérité** (pas de provider — `useSyncExternalStore`, même patron que la passphrase).
- **Décision 2 — Persistance** : choix mémorisé en **`localStorage`** (clé `daily-wheel-theme`), pas en base. Une préférence d'affichage est **personnelle** (≠ état d'équipe partagé Supabase) → ne se synchronise pas entre appareils, par design.
- **Décision 3 — Choix initial** : un choix explicite mémorisé **prime** ; sinon on suit `prefers-color-scheme`. Logique isolée dans le helper PUR testé `resolveInitialTheme`.
- **Décision 4 — Anti-flash (FOUC)** : script inline synchrone dans `<head>` (`app/layout.tsx`) qui pose `data-theme` **avant le 1er paint** ; `suppressHydrationWarning` sur `<html>`.
- **Décision 5 — Roue (canvas)** : seul point non-CSS. `SpinWheel` lit `--background` pour le disque vide et **redessine au changement de thème**. La **palette d'identité** (segments de roue / avatars, `participant-colors.ts`) reste **inchangée** en sombre — c'est l'identité des personnes, pas du chrome.
- **Décision 6 — Première passe de teintes** : palette slate (#0f172a/#1e293b/…) + bleu/teal éclaircis pour le contraste sur fond sombre. Teintes à affiner en passe visuelle (le rendu réel/contraste AA n'est pas jugeable hors navigateur).

## Acceptance Criteria

1. **AC-1** — Un **bouton de bascule** (🌙 en clair / ☀️ en sombre) dans le header permet de passer de clair à sombre et inversement (`aria-pressed`, libellés explicites).
2. **AC-2** — Le choix est **persisté en `localStorage`** (clé `daily-wheel-theme`) et restauré au rechargement.
3. **AC-3** — Au 1er chargement sans choix mémorisé, le thème suit **`prefers-color-scheme`** ; un choix explicite mémorisé est **prioritaire** (helper pur `resolveInitialTheme`, testé).
4. **AC-4** — **Aucun flash** de thème au chargement : un script inline applique `data-theme` avant le 1er paint.
5. **AC-5** — Toutes les surfaces s'adaptent via la surcharge des tokens `[data-theme='dark']` ; les contrôles natifs (date picker, scrollbars) suivent via `color-scheme`.
6. **AC-6** — La **roue** s'adapte : disque vide en couleur de page (`--background`) et **redessin au changement de thème**.
7. **AC-7** — La **palette d'identité** (segments de roue / avatars) est **inchangée** en sombre.
8. **AC-8** — `prefers-reduced-motion` respecté (pas de fondu de couleurs) ; aucune régression (tsc/eslint/tests/build verts).

## Tasks / Subtasks

- [x] **Task 1 — Cœur pur + tests (AC-3) — ANCRE TDD**
  - [x] `lib/ui/theme.ts` : `type Theme`, `THEME_STORAGE_KEY`, `resolveInitialTheme(stored, prefersDark)` (choix mémorisé > préférence système).
  - [x] `tests/theme.unit.test.ts` : 5 cas (dark/light mémorisé prime ; null→prefers ; valeur invalide→repli). Rouge→vert.
- [x] **Task 2 — Store client + hook (AC-1, AC-2)**
  - [x] `components/theme.tsx` : `useTheme`/`setTheme` via `useSyncExternalStore` ; `data-theme` sur `<html>` = source de vérité ; `localStorage.setItem` en try/catch (mode privé safe).
- [x] **Task 3 — Bouton de bascule (AC-1)**
  - [x] `components/ThemeToggle.tsx` : 🌙/☀️, `aria-pressed`, `aria-label`/`title` ; monté dans le header (`app/page.tsx`).
- [x] **Task 4 — Anti-flash (AC-4)**
  - [x] `app/layout.tsx` : script inline dans `<head>` (lit `localStorage` puis `prefers-color-scheme`, pose `data-theme`) + `suppressHydrationWarning` sur `<html>`.
- [x] **Task 5 — Jeu de tokens sombres + audit littéraux (AC-5)**
  - [x] `app/globals.css` : bloc `[data-theme='dark']` (surcharge des ~25 tokens) ; `color-scheme: light|dark` ; 2 nouveaux tokens (`--gold-text`, `--subtle-bg`) ; littéraux casseurs tokenisés (`#92400e` ×3, `#f8fafc` ×2) ; hachure week-end + voile popover sombres ; transition douce au switch.
- [x] **Task 6 — Roue adaptée (AC-6, AC-7)**
  - [x] `components/SpinWheel.tsx` : `useTheme()` ajouté aux deps du redraw ; disque vide lit `--background` (repli `#eef4fb`) ; texte des segments laissé `#fff` (lisible sur couleurs saturées dans les 2 thèmes) ; palette d'identité inchangée.
- [x] **Task 7 — reduced-motion + gates (AC-8)**
  - [x] Transition de couleurs neutralisée sous `@media (prefers-reduced-motion: reduce)`.
  - [x] `tsc` 0 / `eslint` 0 / **359 tests** (+5 theme) / `npm run build` OK. Contrôle visuel + contraste = passe humaine.

## Dev Notes

- **Pas de provider** : le thème est un état UI simple ; un store-module + `useSyncExternalStore` (DOM comme source de vérité) évite d'imbiquer un provider de plus et rend `useTheme()` lisible partout (toggle dans le header, roue au fond de l'arbre).
- **Pas de mismatch d'hydratation** : SSR rend `light` par défaut ; le script anti-flash corrige `data-theme` avant le paint et avant l'hydratation ; le snapshot client lit l'attribut réel. `suppressHydrationWarning` couvre l'attribut muté par le script.
- **Canvas** : seul endroit qui ne lit pas les CSS vars nativement → `getComputedStyle(...).getPropertyValue('--background')` au dessin du disque vide + `theme` ajouté aux deps de l'effet de redraw.
- **Littéraux casseurs en sombre** : `#92400e` (texte ambre des libellés/badges, illisible sur fond ambre sombre) → token `--gold-text` (clair en sombre) ; `#f8fafc` (fonds subtils `.lock`/`.ep-head`) → token `--subtle-bg` ; hachure week-end (deux gris en dur) → override `[data-theme='dark'] .day.weekend`.
- **Persistance locale assumée** : `localStorage` par navigateur, pas Supabase — préférence personnelle, pas état partagé.
- **Première passe de teintes** : 1 à 2 retouches visuelles à prévoir avec Solo (le rendu réel/contraste AA n'est pas jugeable hors navigateur).

### References

- [Source: daily-wheel/lib/ui/theme.ts#resolveInitialTheme + THEME_STORAGE_KEY]
- [Source: daily-wheel/components/theme.tsx#useTheme/setTheme (useSyncExternalStore)]
- [Source: daily-wheel/components/ThemeToggle.tsx]
- [Source: daily-wheel/app/layout.tsx#script anti-flash + suppressHydrationWarning]
- [Source: daily-wheel/app/globals.css#[data-theme='dark'] + color-scheme + --gold-text/--subtle-bg]
- [Source: daily-wheel/components/SpinWheel.tsx#disque vide --background + redraw au thème]
- [Source: échange Solo 2026-06-24 ; 5.8 avait listé le mode sombre hors-périmètre]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / quick-flow)

### Completion Notes List

- ✅ AC-1→2 : bouton 🌙/☀️ dans le header + persistance `localStorage` (clé `daily-wheel-theme`).
- ✅ AC-3 : `resolveInitialTheme` (choix mémorisé > `prefers-color-scheme`), 5 tests.
- ✅ AC-4 : script anti-flash dans `<head>` avant 1er paint + `suppressHydrationWarning`.
- ✅ AC-5 : bloc `[data-theme='dark']` (surcharge tokens) + `color-scheme` ; littéraux casseurs tokenisés.
- ✅ AC-6/7 : roue lit `--background` + redraw au switch ; palette d'identité inchangée.
- ✅ AC-8 : transition de couleurs neutralisée sous reduced-motion ; tsc 0 / eslint 0 / 359 tests / build OK.
- Livré et poussé : commit `b61cf4d` (`feat(theme): dark theme switchable avec bouton clair/sombre`).
- **Reste** : passe visuelle Solo pour affiner les teintes/contrastes (1-2 retouches attendues).

### Change Log

- 2026-06-24 — Dark theme switchable (bouton clair/sombre, persistance localStorage, anti-flash, tokens `[data-theme=dark]`, roue adaptée). 8 fichiers, +185/-8. Commit `b61cf4d`.
- 2026-06-25 — Story rétroactive rédigée a posteriori (Amelia) à la demande de Solo.

### File List

- `daily-wheel/lib/ui/theme.ts` (ADDED — helper pur resolveInitialTheme + THEME_STORAGE_KEY)
- `daily-wheel/tests/theme.unit.test.ts` (ADDED — 5 tests)
- `daily-wheel/components/theme.tsx` (ADDED — store client useTheme/setTheme)
- `daily-wheel/components/ThemeToggle.tsx` (ADDED — bouton 🌙/☀️)
- `daily-wheel/components/SpinWheel.tsx` (MODIFIED — --background + redraw au thème)
- `daily-wheel/app/layout.tsx` (MODIFIED — script anti-flash + suppressHydrationWarning)
- `daily-wheel/app/page.tsx` (MODIFIED — <ThemeToggle/> dans le header)
- `daily-wheel/app/globals.css` (MODIFIED — bloc dark + color-scheme + tokens + littéraux tokenisés)
