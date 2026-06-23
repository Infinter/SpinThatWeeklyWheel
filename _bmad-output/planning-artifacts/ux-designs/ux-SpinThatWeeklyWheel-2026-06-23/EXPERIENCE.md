---
title: Daily Wheel — Expérience (redesign rituel)
status: final
updated: 2026-06-23
design: ./DESIGN.md
sources:
  - ../../prd.md
  - ../../planning-artifacts/epics.md
---

# Daily Wheel — Expérience

Spine comportementale du redesign. Possède **comment ça marche** (IA, états, interactions, accessibilité, parcours). L'identité visuelle vit dans [`DESIGN.md`](./DESIGN.md) ; je la référence par `{tokens}`. **Les deux spines gagnent sur tout mock** en cas de conflit.

## Foundation

- **Form-factor** : application web **single-page**, responsive (desktop + mobile ≤ `520px`). Pas d'app native.
- **Stack héritée** : Next.js 16 / React 19, store Context+reducer, file d'écriture optimiste (`useWriteQueue`), Supabase (persistance partagée + Realtime), API protégée par `passphrase d'équipe` (`x-team-passphrase`).
- **Système d'UI** : aucun framework UI tiers — CSS maison + tokens `globals.css`. `DESIGN.md` est la référence visuelle ; ce document spécifie le **delta comportemental** du redesign.
- **Portée** : c'est une **évolution** de l'app livrée (4 epics, 15 stories). On garde le modèle de données et le vocabulaire ; on retravaille l'enchaînement (parcours guidé), le moment de tirage (roue) et la restitution (timeline + exports).
- **Maquette de référence validée** : [`mockups/spin-rotation.html`](./mockups/spin-rotation.html) (interactive). Les spines gagnent sur la maquette en cas de divergence.

## Information Architecture

Une seule page, structurée par le `{components.stepper}` en trois temps. Toutes les surfaces coexistent sur la page ; le stepper sert de repère et d'ancre de défilement, pas de navigation entre pages.

```
Cadre app
├── Barre supérieure : marque + {components.passphrase-banner}
├── Stepper **collant** : 1 Équipe · 2 Contraintes · 3 Spin  (reste visible au défilement → retour en 1 clic)
├── ① Équipe (participants)
│     • saisie multi-noms · liste · actif/inactif · renommer · supprimer
│     • indisponibilités par participant (panneau en ligne)
│     • résumé {components.roster-chip} : dispos / hors-jeu
├── ② Contraintes (réglages d'équipe)
│     • ignorer les week-ends · date de début du planning
│     • exclusions de groupe · jours fériés · jours off d'équipe
├── ③ Spin
│     • {components.wheel} + sélecteur de mode (Rotation complète / Jour le jour)
│     • {components.timeline} (la rotation)
│     • barre d'export → {components.export-preview}
```

**Clôture de l'IA** : chaque besoin a une surface, chaque surface a un parcours qui y mène. Les contraintes (étape 2) sont héritées telles quelles du produit (FR5–FR8) ; le redesign ne touche pas leur modèle, seulement leur regroupement sous l'étape 2.

## Règle de rotation & horizon `[section produit — pilote le dev]`

Règle de génération, **autoritaire**, à implémenter exactement. S'appuie sur l'algo EDF existant (`generateSchedule`, prédicat unique `isTeamNonSessionDay`, AD-3) qu'elle **précise** sur le point de l'horizon.

1. **Disponibles** = participants `actifs` **ET** non couverts par une `indisponibilité` sur leur fenêtre d'échéance. Les inactifs et les absents toute la période sortent du tirage.
2. **Nombre de sessions = nombre de disponibles.** Chaque disponible anime **exactement une fois** (rotation « one-shot »).
3. **Jours-slots** : on avance dans le calendrier depuis la `date de début`. Un jour est un slot **seulement si** `isTeamNonSessionDay` est faux (donc : pas un week-end si `ignorer les week-ends`, pas une exclusion de groupe, pas un `jour férié`, pas un `jour off d'équipe`, pas un jour où **tous** les actifs sont indispo). Les jours bloqués sont **sautés, jamais comptés** comme slot.
4. **Affectation EDF** : pour chaque slot, on attribue le disponible non encore placé dont l'échéance (dernier jour où il reste disponible) ferme le plus tôt ; égalités tranchées par l'ordre du tirage aléatoire initial.
5. **Horizon ÉTENDU** : on continue d'avancer (en sautant les jours bloqués) **jusqu'à ce que tous les disponibles soient placés**, même au-delà de la semaine courante. **Pas de fenêtre fixe de 7 jours.** `[NOTE FOR UX → archi]` valider que `generateSchedule` n'a pas de borne de fin implicite qui couperait l'horizon.
6. **Non-planifié** : un disponible ne reste non planifié que s'il ne peut tenir **aucun** slot de l'horizon (cas rare ; ex. son indispo couvre toute sa fenêtre). Affiché via l'avertissement existant (`schedule-warning`), concis. ⚠ Ne pas confondre avec le panneau « équité » **abandonné** : l'avertissement basique des non-planifiés (FR du produit) **reste**.

## Voice and Tone

Microcopie en français, tutoiement, sobre-joueur. Aligner sur le **vocabulaire produit** : `participants`, `animateur`, `tirage`/`planning`, `jours fériés`, `jours off d'équipe`, `indisponibilités`, `exclusions de groupe`, `ignorer les week-ends`, `date de début`.

| Élément | Texte | Note |
|---|---|---|
| CTA tirage (rotation) | **Lancer la roue** | Remplace « Lancer la sélection » ; un verbe d'action concret (décidé). |
| CTA après fin | **Relancer la rotation** | |
| CTA jour le jour | **Tirer le premier jour** → **Tirer le jour suivant** → **✓ Rotation complète** | L'action garde son nom dans tout le flux. |
| Pré-tirage | « On fait tourner ? » · « Le suspense fait partie du job. » | |
| Révélation | « **{prénom}** animera le standup du {jour} {date} ! » | Nom en `{colors.accent-dark}`. |
| Fin de rotation | « Rotation complète ! **Chacun anime une fois.** » | |
| Bandeau protection | « 🔒 Équipe protégée · déverrouillée / verrouillée » | Annonce **avant** la 1re modif. |
| Export sans tirage | « Lance d'abord la rotation » | Empêche l'export vide, indique l'action. |
| Copie réussie | « Copié dans le presse-papier » | Le bouton dit « Copier » → le toast dit « Copié ». |
| État participant | « · inactif » / « · absente » | Statut factuel, pas de jugement. |
| Nudge contraintes | « Contraintes mises à jour — relancer la roue ? » · action « **Relancer** » | Non destructif ; l'ancien planning reste affiché jusqu'à la relance. |
| Popover indispo | titre « Indispos de {prénom} » | Même éditeur qu'à l'étape Équipe ; ouvrable depuis n'importe quel chip. |

**Empty states** = invitations à agir, jamais des culs-de-sac : équipe vide → « Ajoute ta première personne pour commencer » ; timeline avant tirage → cellules « à tirer ».

## Component Patterns (comportement)

- **`{components.stepper}`** : **collant** (reste fixé en haut au défilement) → retour à n'importe quelle étape en **un clic depuis n'importe où**. Cliquable, fait défiler en douceur vers la surface. Étape complétée quand sa condition est remplie (≥1 participant actif pour ①, toujours satisfaite pour ② car optionnelle, tirage lancé pour ③). **N'est pas un wizard** : aucune étape n'est verrouillée, l'accès aux autres surfaces est toujours libre (progressive, pas séquentielle).
- **`{components.constraint-popover}` — édition rapide** : un clic sur un `{components.roster-chip}` (y compris dans le résumé d'équipe affiché à l'étape ③ Spin) ouvre l'**éditeur d'indisponibilités du participant en popover**, sans quitter la page ni perdre l'état du tirage. C'est le **même** éditeur datée jour/plage qu'à l'étape ① (FR5) ; l'indispo créée est persistée normalement. Fermeture par `Échap`, clic extérieur, ou bouton de fermeture.
- **`{components.rerun-nudge}` — relance non destructive** : toute modification de contrainte (ajout/suppression d'indispo, férié, jour off, exclusion, toggle actif, option) **alors qu'une rotation est affichée** déclenche un bandeau discret « Contraintes mises à jour — relancer la roue ? » avec une action **Relancer**. L'ancien planning **reste affiché** jusqu'à la relance (jamais de réinitialisation silencieuse). Remplace le comportement « changer un réglage invalide le tirage » par un choix explicite de l'utilisateur.
- **`{components.wheel}` (théâtre de révélation)** : la roue **ne tire pas au hasard** — elle **révèle le résultat EDF pré-calculé**. À chaque spin, elle s'oriente vers l'`animateur` que l'algo a affecté au jour courant, puis retire ce segment. Garantit cohérence entre animation et planning réel.
  - *Rotation complète* : calcule tout le planning, puis enchaîne les révélations jour par jour (~0,6 s entre chaque), remplit la timeline au fur et à mesure.
  - *Jour le jour* : révèle un jour par clic (un par matin de standup), dans l'ordre chronologique des slots.
- **`{components.timeline}`** : se remplit dans l'ordre des slots ; week-ends/jours bloqués affichés mais sautés ; pas de scrollbar (grille qui s'enroule).
- **`{components.export-preview}`** : un clic sur un format affiche le **contenu exact** qui sera copié (Slack markdown, ou CSV ISO) avant toute copie. Voir section Exports.
- **`{components.passphrase-banner}` / gate** : la protection est **annoncée d'emblée** (bandeau). La saisie de la phrase de passe reste **paresseuse** (au premier write), via le `.passphrase-prompt` existant, mémorisée en `sessionStorage`.

## State Patterns

| État | Comportement |
|---|---|
| **Vide** (équipe) | Invitation à ajouter ; stepper ① actif, ②③ accessibles mais la roue indique « ajoute des participants ». |
| **Pending** (écriture optimiste) | `opacity .55` sur la ligne concernée ; reprise auto via file d'écriture. |
| **Échec write** | Fond ambre + bouton « Réessayer » (hérité). |
| **Conflit 409 / Realtime** | Re-hydratation silencieuse depuis Supabase (hérité). |
| **Jour bloqué** | Cellule `{colors.gold-soft}` (férié/off) ou hachurée (week-end) + mention « sauté ». |
| **En cours de tirage** | CTA désactivé, révélation « La roue tourne… », `aria-busy`. |
| **Rotation complète** | CTA → « Relancer » ; toast ; message de fin ; exports activés. |
| **Non-planifié** | Avertissement concis listant les participants + raison (hérité). |
| **Reduced-motion** | La roue saute directement au résultat (pas de rotation) ; `pop`/halos désactivés ; révélations instantanées. |

## Interaction Primitives

- **Spin** : clic CTA (ou `Entrée`/`Espace` au focus) → animation déterministe `ease-out` vers le résultat EDF.
- **Bascule de mode** : `role="tablist"` ; changer de mode réinitialise la rotation en cours.
- **Copier** : bouton dans l'aperçu → `navigator.clipboard.writeText` (fallback silencieux) + toast.
- **Naviguer (stepper collant)** : clic → défilement doux vers la surface ; le stepper restant fixé, le retour est toujours à portée de clic.
- **Éditer une indispo en place** : clic sur un chip participant → popover de l'éditeur d'indispos ; l'état du tirage est préservé.
- **Relancer après changement** : le nudge propose **Relancer** ; tant qu'il n'est pas actionné, le planning affiché reste celui d'avant.

## Accessibility Floor

- **Roue (canvas) non lisible par lecteur d'écran** → chaque résultat est annoncé dans une **région live** `role="status" aria-live="polite"` (« {prénom} animera le standup du … »). Le canvas porte un `aria-hidden` + un libellé alternatif décrivant l'état.
- **Couleur jamais seule porteuse de sens** : jours bloqués = couleur **+** badge texte (« WE », « Férié », « sauté ») ; participant hors-jeu = barré **+** libellé.
- **Clavier** : tout actionnable au clavier ; ordre de tabulation logique ; `:focus-visible` `outline 2px {colors.primary}` (hérité).
- **Mouvement** : `prefers-reduced-motion` respecté intégralement (cf. États).
- **Cibles tactiles** ≥ 40px sur mobile ; formulaires empilés ≤ `520px`.
- **Contraste** : porté par `DESIGN.md` (texte `#1e293b` sur blanc/`#eef4fb`).

## Key Flows

### Flow 1 — Nadia lance la rotation de la semaine (Rotation complète)

**Nadia, Scrum Master d'une équipe de 8**, lundi 9h, juste avant le Daily. Karim est en congé longue durée (inactif), Léa absente toute la semaine (indispo).

1. Elle ouvre Daily Wheel (lien partagé) ; le bandeau « 🔒 Équipe protégée » la rassure d'emblée.
2. Étape ① : ses 8 participants sont là ; les chips montrent **6 disponibles**, Karim (inactif) et Léa (absente) grisés.
3. Étape ② : le férié du mercredi et le week-end sont déjà posés ; elle ne touche à rien.
4. Étape ③ : elle clique **Lancer la roue**.
5. **CLIMAX** — la roue tourne, ralentit, s'arrête sur *Alice* : « Alice animera le standup du lundi 23 ! ». Le segment d'Alice disparaît, la cellule lundi se remplit. La roue enchaîne mardi, saute le mercredi férié et le week-end, déborde sur le lundi et mardi suivants. En ~5 s, **6 jours ouvrés** sont remplis, chacun anime une fois.
6. Elle clique **💬 Pour Slack**, voit l'aperçu exact, **📋 Copier**, et colle dans le canal d'équipe. Fini.

### Flow 2 — Tom révèle l'animateur du matin (Jour le jour)

**Tom, dev qui anime le Daily ce sprint.** L'équipe a choisi le rituel quotidien.

1. Chaque matin, Tom partage son écran et clique **Tirer le jour suivant**.
2. **CLIMAX** — un seul spin, un seul nom : suspense partagé, petit rire collectif. Le jour se remplit dans la timeline.
3. Le lendemain, la rotation reprend là où elle s'était arrêtée. `[NOTE FOR UX → archi]` le jour-le-jour suppose que le planning généré (ou sa graine + le curseur de jour) **persiste** entre sessions/recharges — or le `schedule` est aujourd'hui éphémère dans le store. À trancher en archi : persister la rotation ou la regénérer de façon déterministe (graine stockée).

### Flow 3 — Nadia ajoute une indispo en plein tirage (édition rapide)

Reprise du Flow 1 : Nadia vient de lancer la rotation quand un coéquipier lui signale que **David est en RDV client jeudi**.

1. Sans remonter en haut, elle clique sur le **chip de David** dans le résumé d'équipe (le stepper collant lui montre aussi qu'elle peut revenir à ① en un clic).
2. Le **popover des indispos de David** s'ouvre par-dessus : elle ajoute « jeudi » et ferme (`Échap`). L'état du tirage est intact derrière.
3. **CLIMAX** — un bandeau discret apparaît : « Contraintes mises à jour — **relancer la roue ?** ». L'ancien planning **reste là** ; rien n'a sauté.
4. Elle clique **Relancer** : la nouvelle rotation évite jeudi pour David. Deux gestes, zéro perte de contexte.

## Exports `[section produit]`

Deux formats prioritaires (lien public & `.ics` différés). L'aperçu montre le contenu **exact** avant copie.

- **Message Slack** (markdown) :
  ```
  🎡 *Rotation Daily Scrum* — semaine du {date de début}
  _Chacun anime une fois ; jours fériés et week-ends sautés._

  • {jour} {date} → *{animateur}*
  …
  ```
- **CSV** (dates ISO, pour Sheets/Excel) :
  ```
  Date,Jour,Animateur
  2026-06-23,lun,Alice
  …
  ```

Règles : export désactivé tant qu'aucune rotation n'est tirée (« Lance d'abord la rotation ») ; le contenu reflète l'état courant de la timeline ; copie → toast « Copié dans le presse-papier ».

## Open Questions

Décidé : mark `🎡` (roue) ; CTA « Lancer la roue ». Restent pour l'architecture :

- `[NOTE FOR UX → archi]` Borne d'horizon dans `generateSchedule` (point 5 de la règle de rotation).
- `[NOTE FOR UX → archi]` Persistance de la rotation pour le mode « Jour le jour » (Flow 2).
