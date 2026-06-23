---
title: Daily Wheel — Identité visuelle (redesign rituel)
status: final
updated: 2026-06-23
sources:
  - ../../prd.md
  - ../../planning-artifacts/epics.md
  - daily-wheel/app/globals.css
colors:
  primary: "#0078d4"
  primary-dark: "#005ea2"
  primary-light: "#e8f4ff"
  accent: "#38b2ac"
  accent-dark: "#2c908a"
  gold: "#f59e0b"
  gold-soft: "#fef3c7"
  gold-border: "#fcd34d"
  background: "#eef4fb"
  card-bg: "#ffffff"
  text: "#1e293b"
  text-muted: "#64748b"
  border: "#e2e8f0"
  blocked-bg: "#fef3c7"
  wheel-segments:
    - "#0078d4"
    - "#38b2ac"
    - "#7c5cff"
    - "#e8618c"
    - "#f59e0b"
    - "#10b981"
    - "#3b82f6"
    - "#ef4444"
typography:
  font-family: "'Segoe UI', system-ui, -apple-system, sans-serif"
  display-weight: 800
  heading-weight: 700
  emphasis-weight: 600
  body-weight: 400
  eyebrow: "0.7em / uppercase / 700 / letter-spacing .1em"
rounded:
  card: "12px"
  control: "7px"
  pill: "999px"
  wheel: "50%"
spacing:
  card-padding: "1.8em"
  panel-padding: "0.9em 1.1em"
  grid-gap: "8px"
components:
  - stepper
  - wheel
  - timeline
  - day-cell
  - export-preview
  - passphrase-banner
  - roster-chip
  - constraint-popover
  - rerun-nudge
  - toast
  - card
  - button
  - tag
  - toggle
breakpoint: "520px"
---

# Daily Wheel — Identité visuelle

Spine visuelle du redesign « rituel ». Elle **gagne sur tout mock** en cas de conflit. `EXPERIENCE.md` référence ces tokens par `{colors.x}`, `{components.y}`. C'est une **évolution** de la charte existante (`daily-wheel/app/globals.css`), pas une réécriture : tout token déjà défini en prod est repris à l'identique ; les ajouts servent les trois nouveautés (roue, timeline, parcours guidé).

## Brand & Style

Daily Wheel est un **outil d'équipe interne** qui désigne l'animateur du Daily Scrum. Le ton est **léger mais sobre** : on assume le côté « jeu » (faire tourner la roue, le suspense du tirage) sans tomber dans le gadget. Propre, fonctionnel, bleu Microsoft, **sans dégradés lourds ni ornement gratuit** — fidèle à la charte d'origine.

- **Voix de marque** : tutoiement complice, phrases courtes, un brin joueur (« On fait tourner ? », « Le suspense fait partie du job »). Jamais corporate.
- **Émotion cible** : transformer une micro-corvée hebdomadaire (désigner qui anime) en petit rituel attendu, perçu comme **équitable** parce que mécanique.
- **Mark** : l'icône applicative passe à la **roue `🎡`** (décidé) — cohérence avec le nom « Wheel » et le nouveau motif d'interaction. Remplace le dé `🎲`.
- **Une seule audace, concentrée** : la roue animée. Tout le reste (cartes, formulaires, panneaux) reste calme et discipliné.

## Colors

Palette héritée de `globals.css` (reprise à l'identique) + ajouts pour les jours bloqués et la roue.

| Token | Hex | Usage |
|---|---|---|
| `{colors.primary}` | `#0078d4` | Action principale, liens, étape active, accent CTA |
| `{colors.primary-dark}` | `#005ea2` | Hover des boutons primaires, texte sur fond clair |
| `{colors.primary-light}` | `#e8f4ff` | Fonds doux (étape active, panneaux d'info, bandeau) |
| `{colors.accent}` | `#38b2ac` | Étapes complétées, révélation positive du tirage |
| `{colors.accent-dark}` | `#2c908a` | Texte de révélation (nom tiré) |
| `{colors.gold}` | `#f59e0b` | Jours bloqués (férié/off), pointeur de la roue, célébration |
| `{colors.gold-soft}` | `#fef3c7` | Fond des jours bloqués dans la timeline |
| `{colors.gold-border}` | `#fcd34d` | Bordure des jours bloqués |
| `{colors.background}` | `#eef4fb` | Fond de page |
| `{colors.card-bg}` | `#ffffff` | Cartes, cellules de jour |
| `{colors.text}` | `#1e293b` | Texte principal |
| `{colors.text-muted}` | `#64748b` | Libellés secondaires, états |
| `{colors.border}` | `#e2e8f0` | Bordures, séparateurs |
| `{colors.wheel-segments}` | (8 teintes) | Couleurs des segments de roue + avatars participants. Attribuées par index stable (participant i → segment i % 8) pour que **chaque personne garde sa couleur** sur la roue et dans la timeline. |

**Filigrane week-end** : hachures `repeating-linear-gradient(45deg, #f8fafc, #f8fafc 6px, #f1f5f9 6px, #f1f5f9 12px)`.

## Typography

Police unique **Segoe UI** (système), reprise de la prod. La hiérarchie passe par le poids et la taille, pas par une seconde fonte.

| Rôle | Spéc |
|---|---|
| Titre de doc / hero | `clamp(1.9rem, 4vw, 2.7rem)` · `{typography.display-weight}` 800 · letter-spacing -.02em |
| Eyebrow / titre de carte | `0.7–0.76em` · UPPERCASE · 700 · letter-spacing .1em · `{colors.text-muted}` |
| Titre de section spin | `1.45rem` · 800 · letter-spacing -.02em |
| Révélation du tirage | `1.05rem` · 600 · nom en `{colors.accent-dark}` 700 |
| Corps | `0.92–0.95em` · 400 |
| Libellé/état discret | `0.68–0.85em` · 600/700 · `{colors.text-muted}` |
| Données export (aperçu) | monospace `ui-monospace, Menlo, Consolas` · `0.82em` |

## Layout & Spacing

- **Conteneur** : `max-width: 920px`, centré, padding `28px 20px`.
- **Cadre app** : carte enveloppante `border-radius: 22px`, ombre douce ; barre supérieure + stepper + panneaux séparés par `1px solid {colors.border}`.
- **Panneaux** : padding `20px 22px`, séparés par un filet supérieur.
- **Rythme** : `grid-gap` `8px` (timeline), `gap` `10–12px` (groupes de boutons).
- **Rayons** : carte `12px` (`{rounded.card}`), contrôle `7px` (`{rounded.control}`), pilule `999px`, roue `50%`.

## Elevation & Depth

Reprise de la prod, parcimonieuse.

- `--shadow-card` : `0 4px 24px rgba(0,120,212,.10), 0 1px 4px rgba(0,0,0,.06)`
- CTA primaire : `0 8px 20px -8px rgba(0,120,212,.7)`
- Roue : `0 18px 40px -18px rgba(0,120,212,.6), inset 0 0 0 8px #ffffff`
- Toast : `0 10px 30px -8px rgba(15,23,42,.5)`

## Shapes

Coins arrondis partout (12px cartes, 7px contrôles, pilules pour chips/tags). **Aucune arête vive.** La roue est le seul cercle parfait ; le pointeur est un triangle `{colors.gold}` au sommet (12h).

## Components

Comportement détaillé → `EXPERIENCE.md`. Ici, l'apparence.

### `{components.stepper}` — parcours guidé (collant)
Trois étapes horizontales : `1 Équipe` · `2 Contraintes` · `3 Spin`. **Collant** : `position: sticky; top: 0`, fond `{colors.card-bg}` opaque + filet inférieur, léger surcroît d'ombre à l'état épinglé pour le détacher du contenu qui défile dessous. Pastille `30px` : à faire = bordure grise/texte muted ; complétée = `{colors.accent}` plein + `✓` ; active = `{colors.primary}` plein + halo `0 0 0 4px {colors.primary-light}`. Filet de liaison gris entre pastilles.

### `{components.wheel}` — la roue (hero)
`<canvas>` circulaire 280px (backing 560px, DPR 2). N segments égaux colorés via `{colors.wheel-segments}`, nom du participant en blanc 700/26px aligné radialement. Pointeur or fixe à 12h. Moyeu blanc central 64px avec `🎡`. Ralentissement `ease-out` cubique, ~2,1 s. La roue **retire** le segment tiré (rétrécit à chaque tour).

### `{components.timeline}` + `{components.day-cell}` — la rotation
Grille `repeat(auto-fit, minmax(96px, 1fr))`, gap `8px`, **multi-lignes, sans scrollbar**. Cellule jour : en-tête (jour abrégé `lun` · numéro 800 · mois muted), corps. États visuels :
- **ouvré non tiré** : « à tirer » gris clair.
- **ouvré tiré** : avatar `40px` (couleur du participant) + prénom 700, animation `pop`.
- **week-end** : fond hachuré + badge `WE`.
- **bloqué (férié/off)** : fond `{colors.gold-soft}`, bordure `{colors.gold-border}`, badge libellé + mention « sauté ».
- **vient d'être tiré** : halo `0 0 0 3px {colors.gold}` + translation -3px (900ms).

### `{components.export-preview}` — aperçu d'export
Panneau dépliable sous la barre d'export. En-tête `#f8fafc` : nom du format + indice « exactement ce qui est copié » + bouton `📋 Copier` + `✕`. Corps `<pre>` monospace `0.82em`, `white-space: pre-wrap`. Le bouton d'export actif prend l'état `{colors.primary-light}`.

### `{components.passphrase-banner}` — protection annoncée
Pilule discrète dans la barre supérieure : `🔒 Équipe protégée · <état>`. Fond `#f8fafc`. Évolution du `.passphrase-prompt` existant (`{colors.primary-light}`) qui reste le formulaire de saisie effective.

### `{components.roster-chip}` — résumé d'équipe
Pilule par participant : avatar initiale (couleur stable) + prénom. Indisponible/inactif = `opacity .6` + prénom barré + état muted (`· inactif`, `· absente`). **Cliquable** (affordance hover : bordure `{colors.primary}` + curseur pointer) → ouvre le `{components.constraint-popover}`. Présent aussi à l'étape ③ Spin.

### `{components.constraint-popover}` — édition rapide d'indispos
Popover ancré au chip cliqué (flèche pointant vers lui), carte blanche `border-radius {rounded.card}`, ombre `--shadow-card`, largeur ~320px (plein écran en bas de page sous `{breakpoint}`). En-tête « Indispos de {prénom} » + fermeture `✕`. Contenu = **l'éditeur jour/plage existant** (mêmes champs, tags, badge de comptage) repris tel quel. Voile léger `rgba(15,23,42,.08)` derrière pour le focus, sans masquer le tirage.

### `{components.rerun-nudge}` — bandeau de relance
Bandeau discret (non modal) ancré près de la roue / haut de la timeline. Fond `{colors.primary-light}`, bordure `#bfdbfe`, `border-radius {rounded.control}`, texte `{colors.text}`. Format : « Contraintes mises à jour — relancer la roue ? » + bouton primaire compact **Relancer**. Apparition douce (slide/fade) ; respecte `prefers-reduced-motion`. Ne recouvre jamais le planning affiché.

### `{components.toast}`
Bandeau bas-centre, fond `{colors.text}`, texte blanc, `✓` vert `#6ee7b7`, auto-disparition ~2,2 s.

### Composants hérités (inchangés)
`{components.card}`, `{components.button}` (primaire/secondaire/lien), `{components.tag}`, `{components.toggle}` — repris tels quels de `globals.css`.

## Do's and Don'ts

- ✅ Concentrer l'animation sur **la roue** (un moment orchestré) ; garder le reste calme.
- ✅ Couleur de participant **stable** entre roue, avatars et timeline.
- ✅ Respecter `prefers-reduced-motion` : roue → résultat direct sans rotation, `pop`/halos désactivés.
- ✅ Garder le bleu `{colors.primary}` comme ancre ; l'or `{colors.gold}` réservé aux contraintes/célébration.
- ❌ Pas de dégradés lourds, pas de seconde fonte, pas d'ombres dramatiques ailleurs que la roue/CTA.
- ❌ Pas de scrollbar horizontale sur la timeline (grille qui s'enroule).
- ❌ Ne pas réintroduire de panneau « pourquoi c'est juste » (abandonné, jugé superficiel).
