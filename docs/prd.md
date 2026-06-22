# Daily Wheel — Product Requirements Document (PRD)

> Format BMAD-METHOD · Projet : migration de « Spin That Wheel v2.html » vers une application Next.js + Supabase hébergée sur Vercel.

---

## 1. Goals and Background Context

### Goals

- Conserver à 100 % les fonctionnalités actuelles du planificateur de Daily Scrum (tirage aléatoire de l'animateur, contraintes respectées, algorithme EDF).
- Remplacer le stockage `localStorage` (mono-poste, non partagé) par une **base de données Supabase** partagée par toute l'équipe.
- **Héberger l'application en ligne** (Next.js sur Vercel) pour qu'elle soit accessible via une simple URL, sans installation.
- Ajouter la gestion des **jours fériés** (saisis manuellement, valables pour toute l'équipe).
- Ajouter la gestion des **jours « off » d'équipe** (jour isolé ou plage), évitant de devoir renseigner une absence individuellement pour chaque personne.
- Garantir que les données saisies par un membre soient immédiatement visibles par les autres (état partagé unique).

### Background Context

L'outil existant (`Spin That Wheel v2.html`) est une page HTML/JS autonome qui désigne aléatoirement, chaque jour ouvré, l'animateur du Daily Scrum. Il gère déjà les participants (actif/inactif, renommage, suppression), les indisponibilités individuelles (jour ou plage), les exclusions de groupe récurrentes (ex. chaque 2ᵉ mardi), l'option « ignorer les week-ends » et une date de début. L'algorithme de placement utilise une stratégie *Earliest Deadline First* (EDF) afin de placer en priorité les personnes dont la fenêtre de disponibilité se ferme le plus tôt, sans créer de « trou » dans le planning.

Sa limite principale : **toutes les données vivent dans le `localStorage` du navigateur d'une seule personne**. Impossible de partager, de collaborer, ou de retrouver ses données depuis un autre poste. Par ailleurs, deux contraintes fréquentes manquent : les **jours fériés** et les **jours de fermeture/off communs à toute l'équipe**, qu'il faut aujourd'hui ressaisir personne par personne.

Ce PRD couvre la réécriture sur une stack moderne (Next.js / Vercel / Supabase) tout en ajoutant ces deux contraintes d'équipe, pour une application partagée, en ligne et sans configuration côté utilisateur.

### Change Log

| Date       | Version | Description                          | Auteur |
| ---------- | ------- | ------------------------------------ | ------ |
| 2026-06-22 | 1.0     | Création initiale du PRD             | PM     |
| 2026-06-22 | 1.1     | Divergences reportées depuis l'architecture (spine `architecture-SpinThatWeeklyWheel-2026-06-22`) : sécurité par passphrase + proxy d'écriture serveur (NFR3, §4) ; ajout de `updated_at` au modèle de données ; `settings.id` fixe. | Architecte (Winston) |

---

## 2. Requirements

### Functional (FR)

- **FR1 :** L'utilisateur peut ajouter un ou plusieurs participants en une saisie (noms séparés par virgule ou point-virgule).
- **FR2 :** Chaque participant peut être marqué actif/inactif ; seuls les actifs entrent dans le tirage.
- **FR3 :** L'utilisateur peut renommer un participant.
- **FR4 :** L'utilisateur peut supprimer un participant (avec confirmation), ce qui supprime aussi ses indisponibilités associées.
- **FR5 :** L'utilisateur peut gérer les **indisponibilités individuelles** d'un participant, en jour isolé ou en plage de dates, avec ajout et suppression unitaires.
- **FR6 :** L'utilisateur peut définir des **exclusions de groupe récurrentes** : un jour de la semaine, toutes les N semaines, à partir d'une date de référence (ex. « 1 mardi sur 2 »).
- **FR7 :** *(Nouveau)* L'utilisateur peut saisir manuellement des **jours fériés** (date + libellé), valables pour toute l'équipe ; aucun animateur n'y est planifié.
- **FR8 :** *(Nouveau)* L'utilisateur peut saisir des **jours « off » d'équipe** (jour isolé ou plage + libellé optionnel), appliqués à tout le groupe sans avoir à les renseigner individuellement.
- **FR9 :** L'utilisateur peut activer/désactiver l'option « ignorer les week-ends ».
- **FR10 :** L'utilisateur peut choisir la date de début du planning (défaut : aujourd'hui).
- **FR11 :** L'application génère un planning en désignant un animateur unique par jour ouvré valide, en respectant **toutes** les contraintes (week-ends, exclusions de groupe, jours fériés, jours off d'équipe, indisponibilités individuelles) selon la stratégie EDF, sans créer de trou.
- **FR12 :** L'application affiche le planning généré (date longue en français → animateur) ainsi que la liste des participants **non planifiés** (indispo, ou dont le placement créerait un trou).
- **FR13 :** Toutes les données (participants, indisponibilités, exclusions de groupe, jours fériés, jours off, options) sont **persistées dans Supabase** et partagées : tout client qui ouvre l'URL voit le même état.
- **FR14 :** Le tirage de base reste **aléatoire** (l'ordre initial change à chaque lancement), l'EDF servant uniquement à départager selon les fenêtres de disponibilité.

### Non Functional (NFR)

- **NFR1 :** L'application est développée en **Next.js (App Router, React)** et déployée sur **Vercel** via intégration Git continue.
- **NFR2 :** La persistance utilise **Supabase (PostgreSQL)**, accédé via le client `@supabase/supabase-js`.
- **NFR3 :** **Mono-équipe, sans login par comptes**, mais **écritures gardées par une passphrase d'équipe partagée** (décision d'architecture B2). L'accès en **lecture** se fait directement par l'URL via la clé publique low-privilege de Supabase ; les politiques RLS autorisent le `SELECT`. Les **écritures** (`INSERT`/`UPDATE`/`DELETE`) sont **refusées** par RLS à la clé publique et passent obligatoirement par un **proxy d'écriture serveur** (Route Handlers Next.js) qui valide la passphrase puis écrit via la clé secrète. *(Voir risque sécurité en §4 ; détail dans l'architecture, AD-7/8/9/10/14/17.)*
- **NFR4 :** Interface et formats de dates **entièrement en français** (libellés, jours de la semaine, dates longues).
- **NFR5 :** Interface **responsive** (utilisable sur mobile, ≤ 520 px) — la mise en page actuelle (cartes, tableau participants, panneaux repliables) est conservée.
- **NFR6 :** Le rendu initial et la génération du planning doivent rester quasi instantanés pour une équipe typique (≤ 50 participants, horizon ≤ 1 an).
- **NFR7 :** L'algorithme de génération reste **déterministe à seed donné** : pour un même ordre tiré au sort et un même jeu de contraintes, le planning produit est identique.
- **NFR8 :** Les secrets (URL Supabase, clé anon) sont fournis via variables d'environnement Vercel ; aucune clé `service_role` n'est exposée côté client.
- **NFR9 :** Aucune régression fonctionnelle par rapport à `Spin That Wheel v2.html` : parité confirmée avant mise hors service de l'ancienne page.

---

## 3. User Interface Design Goals

### Overall UX Vision

Conserver la sobriété et la lisibilité de l'outil actuel : une page unique, organisée en cartes (Participants, Options, Résultat), action principale claire (« 🎲 Lancer la sélection »). L'ajout des contraintes d'équipe (jours fériés, jours off) doit s'intégrer dans la carte « Options » via des panneaux repliables, dans la même logique visuelle que le panneau « Jours exclus (groupe) » existant.

### Key Interaction Paradigms

- Édition inline et immédiate, avec persistance automatique (pas de bouton « Enregistrer » global).
- Panneaux repliables pour les réglages avancés (exclusions de groupe, jours fériés, jours off) afin de ne pas surcharger l'écran.
- Retour visuel via badges (nombre d'indispos, nombre de règles) et messages d'avertissement sur les non-planifiés.

### Core Screens and Views

- **Écran principal unique** comprenant : carte Participants (+ panneaux indispos par personne), carte Options (week-ends, date de début, exclusions de groupe, **jours fériés**, **jours off d'équipe**), et zone Résultat (planning + avertissements).

### Accessibility

- Cible : **WCAG AA** raisonnable (contrastes, focus visibles, navigation clavier sur les champs et boutons). À confirmer avec l'UX Expert.

### Branding

- Reprendre la charte actuelle : couleur primaire `#0078d4`, fond clair `#eef4fb`, cartes blanches, coins arrondis, icône 🎲. Pas de dégradés (cohérent avec le dernier commit « suppression des dégradés »).

### Target Device and Platforms

- **Web Responsive** : desktop en priorité, mobile pleinement supporté.

---

## 4. Technical Assumptions

### Repository Structure

- **Monorepo léger / single app** : un seul dépôt Next.js. Pas de packages séparés nécessaires à ce stade.

### Service Architecture

- **Application Next.js (App Router)** déployée sur Vercel.
- **Supabase** comme backend de données (PostgreSQL + API auto-générée + client JS).
- Logique métier (génération EDF du planning) exécutée **côté client**, mais extraite en **module de domaine pur** `generateSchedule(input, rng)` (sans dépendance DOM/React/Supabase, aléa injecté seedable) afin d'être testable et déterministe — NFR7 (architecture AD-1/2/3).
- **Lectures** via le client Supabase directement (clé publique low-privilege), avec **abonnement Realtime** maintenant l'état partagé à jour entre clients.
- **Écritures** via un **proxy serveur** : des Route Handlers Next.js (une par table) valident la passphrase d'équipe et écrivent via la clé secrète. Ce n'est donc **pas** un déploiement « sans API routes » — un minimum de routes serveur d'écriture est requis par la posture de sécurité B2 (architecture AD-7/14).

### Data Model (schéma Supabase proposé)

- `participants` : `id` (uuid, pk), `name` (text), `active` (bool, défaut true), `created_at`.
- `unavailabilities` : `id` (uuid, pk), `participant_id` (fk → participants, on delete cascade), `kind` (`'day' | 'range'`), `date1` (date), `date2` (date, nullable).
- `group_exclusions` : `id` (uuid, pk), `day_of_week` (int 0-6), `every_n` (int ≥ 1), `ref_date` (date).
- `holidays` *(jours fériés)* : `id` (uuid, pk), `date` (date, unique), `label` (text).
- `team_off_days` *(jours off d'équipe)* : `id` (uuid, pk), `kind` (`'day' | 'range'`), `date1` (date), `date2` (date, nullable), `label` (text, nullable).
- `settings` : ligne unique de configuration — `id` (text, pk, constante fixe `'singleton'`), `skip_weekends` (bool), `start_date` (date, nullable).

> Note : `holidays` et `team_off_days` traitent un cas commun (jour neutralisé pour tout le monde) ; ils sont séparés pour préserver la distinction métier demandée (férié vs fermeture d'équipe). Ils peuvent être fusionnés ultérieurement via une colonne `category` si besoin.

> **Ajout architecture (v1.1) :** toutes les tables écrivables portent une colonne `updated_at` (`timestamptz`, mise à jour côté serveur). Elle est requise par la réconciliation Realtime/optimiste (déduplication des échos + Last-Write-Wins par ligne) — architecture AD-15/16.

### Testing Requirements

- **Unit + Integration** : tests unitaires sur la logique de génération du planning (cas EDF, contraintes combinées, jours fériés/off, absence de trou) — c'est le cœur critique. Tests d'intégration sur les opérations CRUD Supabase. Vérification manuelle de parité avec l'ancienne page avant bascule.

### Additional Technical Assumptions and Requests

- **Stack confirmée :** Next.js + React, déploiement Vercel, base Supabase.
- **Auth :** pas de login par comptes, mais **passphrase d'équipe partagée** gardant les écritures (décision d'architecture B2, retenue par l'utilisateur). ⚠️ **Risque sécurité résiduel acté :** toute personne disposant de l'URL peut **lire** les données (lecture publique). Les **écritures** exigent la passphrase et passent par le proxy serveur (la clé publique ne peut pas écrire — RLS). Risque restant : si la passphrase fuite, l'écriture redevient possible ; pas de traçabilité par personne. Atténuations en place : URL non indexée, RLS refusant les écritures publiques, secrets server-only. Évolution future possible : login réel (la surface RLS est déjà prête — architecture AD-9).
- **Jours fériés :** saisie manuelle (pas d'appel à une API externe en v1). Une évolution future pourra pré-remplir depuis l'API officielle française.
- **Migration :** prévoir un import ponctuel des données `localStorage` existantes vers Supabase (script ou écran d'import one-shot), optionnel.
- **Realtime :** l'abonnement temps réel Supabase est optionnel en v1 (un simple re-fetch au chargement / après mutation suffit).

---

## 5. Epic List

1. **Epic 1 — Fondations & déploiement en ligne :** initialiser le projet Next.js, configurer Supabase et le schéma, déployer sur Vercel, et livrer une première tranche verticale (lecture/écriture des participants depuis la base) accessible par URL.
2. **Epic 2 — Participants & contraintes individuelles :** CRUD complet des participants et gestion des indisponibilités individuelles, persistés dans Supabase, à parité avec l'existant.
3. **Epic 3 — Contraintes d'équipe :** exclusions de groupe récurrentes (migrées) + **nouveaux** jours fériés et jours off d'équipe, avec leurs panneaux dédiés.
4. **Epic 4 — Génération du planning & affichage :** algorithme EDF intégrant toutes les contraintes, options (week-ends, date de début), rendu du planning et des non-planifiés.

---

## 6. Epic Details

### Epic 1 — Fondations & déploiement en ligne

**Goal :** Mettre en place l'ossature technique complète (Next.js, Supabase, Vercel) et prouver le bout-en-bout avec une fonctionnalité minimale mais réelle : afficher et ajouter des participants stockés en base, accessible publiquement par URL.

- **Story 1.1 — Initialiser l'application Next.js**
  - *As a* développeur, *I want* un projet Next.js (App Router) versionné et lançable en local, *so that* je dispose d'une base de travail propre.
  - **AC :**
    1. Le dépôt contient une app Next.js qui démarre en local (`npm run dev`) et affiche la page d'accueil Daily Wheel (header + cartes vides).
    2. La charte visuelle de base (couleurs, typographie, layout en cartes) est reprise de la page existante.
    3. Le projet build sans erreur (`npm run build`).

- **Story 1.2 — Provisionner Supabase et le schéma**
  - *As a* développeur, *I want* un projet Supabase avec les tables du modèle de données et les politiques RLS, *so that* les données puissent être persistées et partagées.
  - **AC :**
    1. Les tables `participants`, `unavailabilities`, `group_exclusions`, `holidays`, `team_off_days`, `settings` sont créées conformément au §4.
    2. Les politiques RLS autorisent le `SELECT` via la clé publique et **refusent** les écritures à cette clé ; les écritures passeront par le proxy serveur (cf. NFR3 / architecture AD-9/14). Les tables portent `updated_at` et sont ajoutées à la publication Realtime.
    3. Un script SQL de migration (création des tables) est versionné dans le dépôt.

- **Story 1.3 — Connecter l'app à Supabase**
  - *As a* développeur, *I want* le client Supabase configuré via variables d'environnement, *so that* l'app communique avec la base sans exposer de secret sensible.
  - **AC :**
    1. Le client `@supabase/supabase-js` est initialisé à partir de `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    2. Aucune clé `service_role` n'est présente côté client.
    3. Une lecture de test sur une table renvoie un résultat sans erreur.

- **Story 1.4 — Tranche verticale « participants » + déploiement Vercel**
  - *As a* membre de l'équipe, *I want* ajouter et voir la liste des participants depuis n'importe quel poste via l'URL en ligne, *so that* l'état est réellement partagé.
  - **AC :**
    1. Ajouter un participant l'enregistre dans Supabase ; rechargement et autre navigateur voient le même participant.
    2. L'application est déployée sur Vercel et accessible par une URL publique.
    3. Les variables d'environnement Supabase sont configurées sur Vercel.

### Epic 2 — Participants & contraintes individuelles

**Goal :** Atteindre la parité avec l'existant sur la gestion des participants et de leurs indisponibilités, le tout persisté dans Supabase.

- **Story 2.1 — Ajout multiple et liste des participants**
  - *As a* utilisateur, *I want* ajouter plusieurs participants en une saisie (séparés par `,` ou `;`) et les voir dans un tableau, *so that* je configure l'équipe rapidement.
  - **AC :** (1) Les noms multiples sont scindés et créés ; (2) le tableau affiche Nom / Actif / Actions ; (3) état vide explicite si aucun participant ; (4) entrée clavier « Entrée » valide l'ajout.

- **Story 2.2 — Activer/désactiver, renommer, supprimer**
  - *As a* utilisateur, *I want* basculer l'état actif, renommer et supprimer un participant, *so that* je maintiens la liste à jour.
  - **AC :** (1) Le toggle Actif persiste en base ; (2) le renommage persiste ; (3) la suppression demande confirmation et supprime aussi les indispos liées ; (4) un participant inactif est visuellement distinct (grisé/barré) et exclu du tirage.

- **Story 2.3 — Indisponibilités individuelles (jour / plage)**
  - *As a* utilisateur, *I want* ajouter à un participant des indisponibilités en jour isolé ou en plage, *so that* le planning évite de le désigner ces jours-là.
  - **AC :** (1) Panneau repliable par participant ; (2) ajout d'un jour isolé (refus des doublons) ou d'une plage (date fin ≥ date début) ; (3) suppression unitaire d'une indispo ; (4) un badge indique le nombre d'indispos ; (5) tout est persisté en base.

### Epic 3 — Contraintes d'équipe

**Goal :** Offrir les contraintes communes à toute l'équipe, en migrant les exclusions de groupe et en ajoutant jours fériés et jours off.

- **Story 3.1 — Exclusions de groupe récurrentes**
  - *As a* utilisateur, *I want* définir des jours récurrents ignorés pour tout le groupe (jour de semaine, toutes les N semaines, à partir d'une date de référence), *so that* je modélise un Daily qui ne se tient pas certaines semaines.
  - **AC :** (1) Formulaire jour/fréquence/date de référence avec validation (la date de référence doit tomber le bon jour de semaine) ; (2) liste des règles sous forme de tags supprimables ; (3) badge de comptage ; (4) persistance en base.

- **Story 3.2 — Jours fériés (nouveau)**
  - *As a* utilisateur, *I want* saisir manuellement des jours fériés (date + libellé) communs à toute l'équipe, *so that* aucun animateur n'y soit planifié sans avoir à le renseigner par personne.
  - **AC :** (1) Panneau dédié dans la carte Options ; (2) ajout d'une date + libellé, refus des doublons de date ; (3) liste triée par date, suppression unitaire ; (4) persistance en base ; (5) ces dates sont neutralisées lors de la génération (aucun animateur, pas de trou).

- **Story 3.3 — Jours off d'équipe (nouveau)**
  - *As a* utilisateur, *I want* saisir des jours « off » d'équipe en jour isolé ou en plage (avec libellé optionnel), *so that* je gère une fermeture/un pont pour tout le monde en une seule saisie.
  - **AC :** (1) Panneau dédié ; (2) ajout jour isolé ou plage (date fin ≥ date début) ; (3) liste avec suppression unitaire ; (4) persistance en base ; (5) ces jours sont neutralisés à la génération comme les jours fériés.

### Epic 4 — Génération du planning & affichage

**Goal :** Reproduire et fiabiliser l'algorithme de génération en intégrant l'ensemble des contraintes, puis afficher le résultat.

- **Story 4.1 — Options de génération**
  - *As a* utilisateur, *I want* régler « ignorer les week-ends » et la date de début, *so that* je cadre la période du planning.
  - **AC :** (1) Case « ignorer les week-ends » (défaut activée) persistée ; (2) date de début par défaut = aujourd'hui, modifiable et persistée ; (3) ces réglages sont pris en compte à la génération.

- **Story 4.2 — Algorithme EDF avec toutes les contraintes**
  - *As a* utilisateur, *I want* lancer la génération et obtenir un animateur unique par jour ouvré valide, *so that* l'ordre est équitable et toutes les contraintes respectées.
  - **AC :**
    1. L'ordre initial est tiré au sort (aléatoire à chaque lancement).
    2. Un jour est ignoré s'il est week-end (option active), exclusion de groupe, jour férié, ou jour off d'équipe.
    3. Un jour où **tous** les actifs sont indisponibles est ignoré (pas un trou).
    4. La priorité EDF place d'abord la personne dont la fenêtre de disponibilité se ferme le plus tôt ; en cas d'égalité, l'ordre du tirage initial départage.
    5. Aucun trou n'est créé : si placer un participant impose un jour sans candidat dispo derrière, il reste non planifié.
    6. Résultats identiques à l'ancienne page pour des jeux de données équivalents (parité, NFR9).

- **Story 4.3 — Affichage du planning et des non-planifiés**
  - *As a* utilisateur, *I want* voir le planning (date longue FR → animateur) et la liste des non-planifiés, *so that* je comprends le résultat et les éventuels écarts.
  - **AC :** (1) Tableau résultat Date/Animateur avec dates en français ; (2) compteur de sessions dans l'en-tête ; (3) avertissement listant les participants non planifiés et la raison générique (indispo / placerait un trou) ; (4) message explicite si aucun participant planifiable.

---

## 7. Checklist Results Report

*(À compléter après exécution du `pm-checklist` BMAD : complétude des exigences, cohérence des epics/stories, dimensionnement MVP, prêt-pour-architecte.)*

---

## 8. Next Steps

### UX Expert Prompt

> À partir de ce PRD, produis la spécification UI/UX de Daily Wheel : reprends la charte existante (primaire `#0078d4`, fond clair, cartes, sans dégradés), intègre les nouveaux panneaux « Jours fériés » et « Jours off d'équipe » dans la carte Options sur le modèle du panneau « Exclusions de groupe », et valide l'accessibilité (focus, contrastes, clavier) et le responsive ≤ 520 px.

### Architect Prompt

> À partir de ce PRD, conçois l'architecture front-end Next.js (App Router) + Supabase déployée sur Vercel : structure du projet, configuration du client Supabase via variables d'environnement, schéma SQL et politiques RLS pour un accès mono-équipe sans auth (en documentant le risque de sécurité associé), couche d'accès aux données, et emplacement de la logique de génération EDF (côté client, réutilisée de la page existante). Prévois la stratégie de tests sur l'algorithme et le plan de migration des données `localStorage`.
