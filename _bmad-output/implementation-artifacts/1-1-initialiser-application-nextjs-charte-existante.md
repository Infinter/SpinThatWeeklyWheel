---
baseline_commit: 0d781d4307294e13f26d082d5bd8397fbc6de996
---

# Story 1.1: Initialiser l'application Next.js avec la charte existante

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a développeur,
I want un projet Next.js (App Router, TypeScript) versionné, lançable en local et reprenant la charte visuelle de l'ancienne page,
so that je dispose d'une base de travail propre et fidèle à l'identité actuelle.

## Acceptance Criteria

1. **Scaffold Next.js conforme au Stack.** Le projet est initialisé via `create-next-app` en **App Router + TypeScript + ESLint**, **sans Tailwind** et **sans dossier `src/`**. `package.json` épingle Next.js `16.2.x` et React `19.2` (cf. spine §Stack). Node `20.9+`. [Source: ARCHITECTURE-SPINE.md#Stack ; epics.md#Story-1.1]
2. **Démarrage local.** `npm install` puis `npm run dev` démarrent l'app sans erreur ; `http://localhost:3000` affiche la page d'accueil Daily Wheel : un **header** (icône 🎲 + titre « Daily Wheel ») suivi de **trois cartes vides** titrées « Participants », « Options », « Résultat ». [Source: epics.md#Story-1.1 (AC Then) ; UX-DR1]
3. **Charte visuelle appliquée en CSS.** La charte de l'ancienne page est portée dans `app/globals.css` : variables `:root` (primaire `#0078d4`, fond `#eef4fb`, cartes blanches `#ffffff`, `--border-radius: 12px`), police `'Segoe UI', system-ui, -apple-system, sans-serif`, et les classes de base `.app-header`, `.container` (max-width 780px), `.card`, `.card-title`, `button`. **Aucun dégradé** (`linear-gradient`/`radial-gradient` interdits). [Source: historique/Spin That Wheel v2.html#<style> ; UX-DR1, UX-DR2 ; epics.md#Story-1.1]
4. **Arborescence = graine structurelle (AD-11).** L'arborescence contient `app/`, `components/`, `lib/domain/`, `lib/data/`, `lib/supabase/`, `lib/store/`, et `supabase/migrations/`. Les répertoires encore vides sont versionnés (`.gitkeep`) pour fixer la structure. [Source: ARCHITECTURE-SPINE.md#Structural-Seed ; AD-11]
5. **Build vert + français.** `npm run build` réussit sans erreur ni warning bloquant ; `npm run lint` passe. Tout le texte visible et `<html lang="fr">` sont en français, la metadata (`title`, `description`) aussi (NFR4). [Source: epics.md#Story-1.1 ; NFR4]
6. **Boilerplate démo supprimé.** Aucun reste du template `create-next-app` (page de démo, logos `next.svg`/`vercel.svg`, CSS demo, `app/page.module.css` inutilisé) ne subsiste : la page d'accueil est uniquement l'écran Daily Wheel. [Source: déduction qualité — propreté du scaffold]

## Tasks / Subtasks

- [x] **Tâche 1 — Scaffolder le projet Next.js sans polluer le repo existant** (AC: 1)
  - [x] ⚠️ `create-next-app .` **refuse un répertoire non vide** ; or le repo contient déjà `_bmad/`, `_bmad-output/`, `docs/`, `historique/`, `.agents/`, `.claude/`. Scaffold lancé dans un dossier temporaire (pas à la racine).
  - [x] Scaffold via `npx create-next-app@16 next-init-tmp --app --ts --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes` (nom temp sans underscore — npm refuse les noms commençant par `_`).
  - [x] Contenu généré rapatrié, puis **isolé dans `daily-wheel/`** (voir Project Structure Notes — décision de séparer l'app des fichiers BMad/Claude) ; `next-init-tmp/` supprimé ; boilerplate `AGENTS.md`/`CLAUDE.md`/`.next` du starter écarté.
  - [x] `.gitignore` Next placé dans `daily-wheel/` ; `.gitignore` racine réduit au bruit général (macOS, logs, env, node_modules défensif).
  - [x] `package.json` vérifié : `next` = `16.2.9`, `react`/`react-dom` = `19.2.4` ; champ `name` renommé `daily-wheel`.
- [x] **Tâche 2 — Créer la graine structurelle (AD-11)** (AC: 4)
  - [x] Créés sous `daily-wheel/` : `components/`, `lib/domain/`, `lib/data/`, `lib/supabase/`, `lib/store/`, `supabase/migrations/`.
  - [x] `.gitkeep` ajouté dans chaque répertoire vide pour figer la structure.
- [x] **Tâche 3 — Porter la charte CSS dans `daily-wheel/app/globals.css`** (AC: 3, 6)
  - [x] `globals.css` réécrit : variables `:root`, reset, `body` (police `Segoe UI`), `.app-header*`, `.container`, `.card`/`.card-title`/`.card-empty`, `button`, media query ≤520px — repris de `historique/Spin That Wheel v2.html`.
  - [x] Tokens d'indispo/exclusion conservés pour les stories suivantes ; **aucun dégradé** (vérifié : 0 occurrence de `gradient` dans le HTML rendu).
  - [x] `app/page.module.css` supprimé ; assets démo de `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) supprimés.
- [x] **Tâche 4 — Écran d'accueil dans `daily-wheel/app/page.tsx` + layout français** (AC: 2, 5, 6)
  - [x] `app/layout.tsx` : `<html lang="fr">`, `metadata` FR (`title: 'Daily Wheel'`), import `globals.css`. Polices démo `next/font` (Geist) retirées au profit de la pile `Segoe UI`.
  - [x] `app/page.tsx` : composant serveur statique — `header` (icône 🎲 + `h1` « Daily Wheel » + sous-titre) puis `.container` avec **trois `.card`** (« Participants », « Options », « Résultat »), chacune avec état vide FR. Aucune logique métier.
  - [x] Aucun texte anglais résiduel du template (vérifié dans le HTML rendu).
- [x] **Tâche 5 — Vérification finale** (AC: 2, 5)
  - [x] Serveur prod (`npm run start`) + `curl localhost:3000` : header + 3 cartes présents, `lang="fr"`, 🎲 présent, 0 `gradient`.
  - [x] `npm run lint` passe (0 erreur).
  - [x] `npm run build` réussit (Next 16.2.9, TypeScript OK, `/` prérendu statiquement).

## Dev Notes

### Contexte & périmètre
- Story **fondatrice** d'Epic 1 (aucune story précédente). Objectif : poser l'ossature visuelle et structurelle, **sans** logique métier, **sans** Supabase, **sans** tests de domaine (ceux-ci arrivent dès qu'il y a du `lib/domain/` — Epic 4 ; la CI Vitest est cadrée en Story 1.5 / AD-13).
- Ne **pas** anticiper : pas de client Supabase (Story 1.3), pas de Route Handler (Story 1.4), pas de store/Realtime (Story 1.5). Se limiter strictement aux AC.

### Garde-fous techniques (à respecter)
- **Stack épinglé** : Next.js `16.2.x` (App Router), React `19.2`, TypeScript `5.1+`, Node `20.9+`. [Source: ARCHITECTURE-SPINE.md#Stack]
- **Sans Tailwind, sans `src/`** : la charte CSS existante est ratifiée ; le CSS vit dans `app/globals.css`. [Source: ARCHITECTURE-SPINE.md#Stack ; epics.md#Additional-Requirements (Starter template)]
- **Règle de dépendance (AD-11)** : la structure `lib/{domain,data,supabase,store}/` est posée maintenant pour ancrer la règle « les dépendances descendent UI → state → data → (supabase) ; `lib/domain/` ne dépend de personne ». Aucun code de couplage à écrire ici, juste les dossiers.
- **Français (NFR4)** : `lang="fr"`, tous libellés et metadata en français.
- **Sans dégradés (UX-DR2)** : la charte utilise des aplats + ombres (`box-shadow`), jamais de `gradient`.

### Charte — valeurs concrètes (source : `historique/Spin That Wheel v2.html`, bloc `<style>`)
```css
:root{
  --primary:#0078d4; --primary-dark:#005ea2; --primary-light:#e8f4ff;
  --accent:#38b2ac; --background:#eef4fb; --card-bg:#ffffff;
  --text-color:#1e293b; --text-muted:#64748b; --border:#e2e8f0;
  --border-radius:12px; --radius-sm:7px;
  --shadow-card:0 4px 24px rgba(0,120,212,.10),0 1px 4px rgba(0,0,0,.06);
  --shadow-btn:0 2px 8px rgba(0,120,212,.25);
}
body{ font-family:'Segoe UI',system-ui,-apple-system,sans-serif; background:var(--background); color:var(--text-color); }
/* .app-header (icône 52px arrondie fond --primary, h1 1.55em, sous-titre muted) ;
   .container max-width:780px ; .card (fond blanc, --border-radius, --shadow-card, padding 1.8em) ;
   .card-title (uppercase, letter-spacing, --text-muted) ; button (fond --primary, --radius-sm, --shadow-btn) */
```
Reprendre le bloc `<style>` complet de l'ancienne page comme référence ; ne porter que ce qui sert l'écran d'accueil + tokens réutilisables. Responsive (≤520px, NFR5/UX-DR7) sera affiné au fil des cartes ; ici, conserver le `max-width:780px` centré.

### Piège majeur — scaffold dans un repo déjà peuplé
`create-next-app` **échoue** si le dossier cible contient des fichiers autres que ceux qu'il tolère (`.git`, `.gitignore`, `README`, `LICENSE`…). Le repo contient déjà `_bmad/`, `docs/`, etc. → **scaffolder dans `_next-init/` puis rapatrier** (cf. Tâche 1). Bien **fusionner** (et non écraser) le `.gitignore` racine existant.

### Project Structure Notes
- **Variance assumée (décision Solo, 2026-06-22) : l'app vit dans `daily-wheel/`**, et non à la racine comme le supposait la graine d'architecture. Motif : séparer nettement le code applicatif des fichiers d'outillage BMad/Claude (`_bmad/`, `_bmad-output/`, `.agents/`, `.claude/`, `docs/`, `historique/`) qui peuplent déjà le dépôt. La graine `app/ components/ lib/{domain,data,supabase,store}/ supabase/migrations/` est respectée **à l'intérieur** de `daily-wheel/`. [Source: ARCHITECTURE-SPINE.md#Structural-Seed — adapté]
  ```
  daily-wheel/
    app/            page.tsx, layout.tsx, globals.css, favicon.ico  (api/ viendra en Story 1.4)
    components/     (.gitkeep)
    lib/domain/     (.gitkeep)   lib/data/ (.gitkeep)   lib/supabase/ (.gitkeep)   lib/store/ (.gitkeep)
    supabase/migrations/  (.gitkeep)
    public/         (vidé des assets démo)
    package.json, tsconfig.json, next.config.ts, eslint.config.mjs, .gitignore, node_modules/
  ```
- **Impact pour les stories suivantes & CI** : toutes les commandes npm (`dev`/`build`/`lint`/`test`) s'exécutent depuis `daily-wheel/` ; la racine de déploiement Vercel (Story 1.5) devra pointer sur `daily-wheel/` (« Root Directory »). À répercuter dans le pipeline CI (AD-13) et la config Vercel.
- Autres variances : pas de `src/` (décision Stack) ; `import-alias "@/*"` conservé pour les imports internes futurs.

### Testing standards (pour cette story)
- Pas de logique de domaine → **pas de test unitaire requis** ici. Le harnais Vitest et la CI sont établis en Story 1.5 (AD-13). [Source: ARCHITECTURE-SPINE.md#AD-13]
- Critères de vérification de la story = `npm run lint` vert + `npm run build` vert + contrôle visuel `npm run dev` (header + 3 cartes, charte appliquée, FR, sans dégradé).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-1 ; #Story-1.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-SpinThatWeeklyWheel-2026-06-22/ARCHITECTURE-SPINE.md#Stack ; #Structural-Seed ; #AD-11 ; #AD-13]
- [Source: docs/prd.md §3 (exigences UI) — UX-DR1, UX-DR2, NFR4, NFR5]
- [Source: historique/Spin That Wheel v2.html — bloc `<style>` (charte de référence)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / dev-story)

### Debug Log References

- `npm run lint` → 0 erreur (après scoping ESLint à l'app).
- `npm run build` → ✓ compiled, TypeScript OK, `/` + `/_not-found` prérendus statiquement.
- Smoke test : `npm run start` + `curl localhost:3000` → HTML 7,3 ko contenant « Daily Wheel », « Participants », « Options », « Résultat », `lang="fr"`, 🎲 ; 0 occurrence de `gradient`.

### Completion Notes List

- Story implémentée intégralement ; les 6 AC sont satisfaits et vérifiés (lint + build + rendu HTML).
- **Décision structurelle** : app isolée dans `daily-wheel/` (séparation code applicatif / outillage BMad) — variance documentée dans Project Structure Notes. À répercuter sur la config CI et la « Root Directory » Vercel en Story 1.5.
- **Gotcha rencontré** : `create-next-app` refuse un dossier non vide **et** un nom de projet commençant par `_` → scaffold dans `next-init-tmp/` puis rapatriement.
- Versions tirées par le starter : `next@16.2.9`, `react`/`react-dom@19.2.4` (conformes au Stack 16.2.x / 19.2). Node v26 / npm 11 en local (≥ 20.9 requis).
- Pas de test unitaire pour cette story (aucune logique de domaine) — conforme aux Testing standards ; le harnais Vitest/CI est cadré en Story 1.5.

### File List

**Nouveaux / générés (scaffold puis personnalisés) :**
- `daily-wheel/app/layout.tsx` (réécrit — `lang="fr"`, metadata FR, sans Geist)
- `daily-wheel/app/page.tsx` (réécrit — header + 3 cartes)
- `daily-wheel/app/globals.css` (réécrit — charte legacy, sans dégradés)
- `daily-wheel/app/favicon.ico`
- `daily-wheel/package.json` (`name: daily-wheel`, deps épinglées)
- `daily-wheel/package-lock.json`
- `daily-wheel/tsconfig.json`
- `daily-wheel/next.config.ts`
- `daily-wheel/next-env.d.ts`
- `daily-wheel/eslint.config.mjs` (ignores ramenés à `.next`/`out`/`build`/`next-env.d.ts`/`node_modules`)
- `daily-wheel/README.md`
- `daily-wheel/.gitignore` (ignores Next)
- `daily-wheel/components/.gitkeep`
- `daily-wheel/lib/domain/.gitkeep`, `daily-wheel/lib/data/.gitkeep`, `daily-wheel/lib/supabase/.gitkeep`, `daily-wheel/lib/store/.gitkeep`
- `daily-wheel/supabase/migrations/.gitkeep`

**Modifiés (racine) :**
- `.gitignore` (réduit au bruit général)

**Supprimés (boilerplate démo) :**
- `app/page.module.css`, `public/{next,vercel,file,globe,window}.svg`, et les `AGENTS.md`/`CLAUDE.md`/`.next` du starter (non rapatriés)

### Review Findings

- [x] [Review][Defer] AC2 — « Cartes vides » : placeholder text vs strictement vide — sera probablement retiré via une prochaine US ; on attend que tout soit développé avant de trancher. — deferred
- [x] [Review][Patch] `next-env.d.ts` commité alors qu'il devrait être ignoré — déjà ignoré par `daily-wheel/.gitignore:43`, aucun fichier non voulu à retirer. [daily-wheel/next-env.d.ts:1]
- [x] [Review][Patch] `viewport` export manquant dans `layout.tsx` — ajout de `export const viewport: Viewport` dans `layout.tsx`. [daily-wheel/app/layout.tsx:4]
- [x] [Review][Patch] Pas de `button:focus-visible` (WCAG 2.4.7) — ajout de `button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }`. [daily-wheel/app/globals.css:106]
- [x] [Review][Patch] `<section>` sans heading sémantique ni `aria-labelledby` — `.card-title` convertis en `<h2>` avec `id` + `aria-labelledby` sur chaque section. [daily-wheel/app/page.tsx:18]
- [x] [Review][Patch] Pas de `@media (prefers-reduced-motion: reduce)` — ajout de `@media (prefers-reduced-motion: reduce) { button { transition: none; } }`. [daily-wheel/app/globals.css:119]
- [x] [Review][Defer] Script lint `"eslint"` sans cible explicite [daily-wheel/package.json:9] — deferred, pre-existing
- [x] [Review][Defer] Reset lien global trop large : `a { color: inherit; text-decoration: none }` supprime tout affordance lien [daily-wheel/app/globals.css:42] — deferred, pre-existing
- [x] [Review][Defer] `.gitignore` inner : `.env*` trop large, masquerait `.env.example` [daily-wheel/.gitignore:34] — deferred, pre-existing
- [x] [Review][Defer] Pas de style `button:disabled` (aucun bouton dans le markup actuel) [daily-wheel/app/globals.css:106] — deferred, pre-existing
- [x] [Review][Defer] Breakpoints responsives manquants entre 521–780px [daily-wheel/app/globals.css:126] — deferred, pre-existing
- [x] [Review][Defer] Pas de `prefers-color-scheme: dark` [daily-wheel/app/globals.css:1] — deferred, pre-existing
- [x] [Review][Defer] Pas de headers de sécurité dans `next.config.ts` [daily-wheel/next.config.ts:3] — deferred, pre-existing

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-06-22 | 0.1.0 | Implémentation Story 1.1 : scaffold Next.js 16.2.9 + React 19.2.4 dans `daily-wheel/`, charte CSS legacy portée (sans dégradés), écran d'accueil FR (header + 3 cartes), graine structurelle AD-11. Lint + build verts. |
