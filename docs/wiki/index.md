---
updated: 2026-07-08
confidence: mixed
agents: [onboarder]
---

# Questionnaire de maturité agile/produit — Vue d'ensemble

Outil web permettant à un animateur (coach agile, manager) de faire passer à
une équipe un questionnaire de maturité agile/produit à partir d'une grille
Excel de référence, de consulter les résultats agrégés (radar, dispersion,
comparaison dans le temps) et d'exporter un support de restitution
PowerPoint. Une vue de consolidation multi-équipes ("pilotage") permet une
lecture au niveau département. `CONFIRMÉ` — onboarder · 2026-07-07 · README.md:3-8

Vocabulaire métier à préserver tel quel dans le code et les échanges :
**pilier** → **sous-catégorie/objectif** → **question** (4 **niveaux** de
réponse, 0 à 3) ; **animateur** vs **répondant** ; **session** (campagne
d'évaluation pour une équipe) ; **pilotage** (vue consolidée par département).
`CONFIRMÉ` — onboarder · 2026-07-07 · CLAUDE.md:10-14

## God nodes

Fichiers concentrant une part disproportionnée de la logique — points de
passage obligés pour toute évolution :

- **`app/src/server.js`** (929 lignes) — la totalité des routes API et le
  service des fichiers statiques dans un seul fichier Express, sans découpage
  en routeurs. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:1-929
- **`app/src/db.js`** — schéma complet (8 tables), migrations idempotentes
  (`ALTER TABLE` conditionnels) et données par défaut (rôles), sans framework
  de migration. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/db.js:11-131
- **`app/src/referentiel.js`** — parsing du fichier Excel source (structure
  peu tabulaire : cellules d'en-tête `PILIER - OBJECTIF`, symboles, texte
  concaténé) et toute la logique de réconciliation ré-import non
  destructif/remplacement total. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:31-253
- **`app/src/radar-svg.js`** — génère un radar SVG dont le rendu est
  volontairement calqué sur celui de `resultats.html` ("Mire le rendu de
  resultats.html") : deux implémentations du même visuel (front web + génération
  serveur pour le PPT) à faire évoluer en parallèle. Un test structurel
  (`app/scripts/test-radar.js`, dans `npm test`) verrouille la structure du SVG
  serveur pour détecter une dérive. `DÉDUIT` — onboarder · 2026-07-07 · app/src/radar-svg.js:1-4,44 ; `CONFIRMÉ` — 2026-07-08 · app/scripts/test-radar.js

## Carte des domaines

| Domaine | Où | Description |
| --- | --- | --- |
| Métier (cadrage) | [`business/index.md`](business/index.md) | Personas, parcours utilisateur, vocabulaire, découpage Epics/US |
| Stack technique | [`technical/stack.md`](technical/stack.md) | Runtime, dépendances, variables d'environnement |
| Architecture | [`technical/architecture.md`](technical/architecture.md) | Structure du code, modèle de données, décisions, fragilités |
| Conventions | [`technical/conventions.md`](technical/conventions.md) | Nommage, git, secrets, patterns d'équipe |
| Tests | [`technical/tests.md`](technical/tests.md) | Organisation des scripts de test, couverture, philosophie |
| Export PPT (kit + charte) | [`../../export/`](../../export/) | Kit agent+skills (`ppt-toolkit.md`), spec template OCTO, design system, backlog qualité |
| Optimisation tokens | [`../../export/optimisation-tokens.md`](../../export/optimisation-tokens.md) | Où les tokens Claude sont dépensés et comment les réduire (RTK, wiki, mémoires) |
| TODO | [`todo.md`](todo.md) | Chantiers en cours/demandés/restants (deck PPT, optimisation tokens) |

## Points critiques

<div class="critical">

**Aucune authentification n'est en place.** L'espace animateur (import du
référentiel, création de session, consultation des résultats, export PPT) et
les routes API associées sont accessibles à quiconque possède l'URL — Epic 10
("Authentification et gestion des accès") est explicitement non implémenté à
ce stade. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:183-184 ; cadrage/epics-us.md:92-94

</div>

- **Le mode `remplacer` de l'import référentiel est une purge totale
  irréversible** (référentiel + sessions + répondants + réponses + invites +
  commentaires), sans sauvegarde automatique préalable au niveau applicatif —
  seule une confirmation UI basée sur `GET /api/referentiel/stats` protège ce
  geste. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:222-253, app/README.md:110-113
- **Saisie libre département/équipe** : la tolérance aux fautes (rapprochement
  par clé normalisée) peut laisser passer de vrais doublons, rattrapables
  seulement a posteriori par fusion manuelle animateur (`POST
  /api/repondants/fusion`). `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/normalisation.js:19-30, cadrage/difficultes-realisation.md:22
- **`CHROME_PATH` par défaut pointe vers un chemin Windows** (`C:/Program
  Files/Google/Chrome/Application/chrome.exe`) : l'export PPT n'est pas
  portable en l'état sur Linux/Mac sans surcharger la variable d'environnement.
  `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:17, app/.env.example:20-21
- **Le référentiel, les rôles et les répondants sont des données globales à
  l'outil** (pas de notion de client/organisation) : une seule grille, un seul
  catalogue de rôles — Epic 11 (multi-clients) couvre ce point mais reste au
  stade réflexion. `CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/epics-us.md:105-116, .roadmap/roadmap.json:194-204

## Zones d'ombre

<ul class="shadow-list">
<li><strong>Limitation acceptée</strong> — le <code>.roadmap/roadmap.json</code> est présenté comme source de vérité versionnée de l'avancement, mais le README racine avertit lui-même qu'il "peut être en avance ou en retard sur le code réel". Inhérent à un artefact tenu à la main, non corrigeable par le code : <code>git log</code> et l'état réel du code font foi, à recouper avant toute décision. `CONFIRMÉ` — onboarder · 2026-07-07 · CLAUDE.md:17-20</li>
</ul>

**Résolues le 2026-07-08** : l'incohérence documentation/tests (README aligné
sur les deux styles d'assertion réels) ; l'absence de test sur `radar-svg.js`
(ajout de `test-radar.js`) ; l'absence de CI (`.github/workflows/ci.yml` —
`npm install`, lint, puis `npm test` sur push/PR) ; l'outillage de style
(ESLint flat config `app/eslint.config.js` + `.editorconfig`, script
`npm run lint`, intégré à la CI) ; le risque de chargement ESM du correcteur,
désormais gardé par `test-correcteur.js`. Prettier n'est volontairement pas
ajouté — un reformatage global du dépôt serait trop invasif pour un premier pas.

## Roadmap

Statut d'après `.roadmap/roadmap.json` (source déclarée comme pouvant dériver
du code réel — voir zones d'ombre). Intégrée ici directement (plus de lien
vers `.roadmap/roadmap.svg`, qui reste régénérable à la demande via le skill
`roadmap-keeper` mais n'est plus la voie de consultation par défaut).
`DÉDUIT` — onboarder · 2026-07-07 · .roadmap/roadmap.json:1-206

**Réflexion** (terminé) → **Conception** (terminé) → **Réalisation** : Epics 1
à 7 livrés (Epic 7, hors MVP initial, livré en avance) → **Backlog** : Epics 8
à 11, non démarrés, phase réflexion.

Avancement global : **63 %** (39 US livrées sur 62), 7 Epics livrés sur 11.

Le graphique complet (grille Epic × phase Réflexion/Conception/Réalisation,
détail des US par colonne, ligne "aujourd'hui") est intégré directement dans
[`docs/wiki.html`](../wiki.html#roadmap) — c'est la version graphique de
référence, à consulter en priorité. Le tableau ci-dessous en est l'équivalent
texte pour cette source Markdown.

| Epic | US livrées | Statut |
| --- | --- | --- |
| Epic 1 — Référentiel de questions (import Excel) | 7/7 | Livré |
| Epic 2 — Lancement et gestion d'une session | 6/6 | Livré |
| Epic 3 — Identification du répondant | 7/7 | Livré |
| Epic 4 — Parcours de réponse au questionnaire | 7/7 | Livré |
| Epic 5 — Agrégation et consultation des résultats | 4/4 | Livré |
| Epic 6 — Analyse et restitution | 5/5 | Livré |
| Epic 7 — Consolidation multi-équipes (hors MVP initial, livré en avance) | 3/3 | Livré |
| Epic 8 — Packaging et déploiement | 0/6 | Réflexion |
| Epic 9 — Environnements DEV / PRE-PROD / PROD | 0/5 | Réflexion |
| Epic 10 — Authentification et gestion des accès | 0/6 | Réflexion |
| Epic 11 — Gestion de plusieurs clients (organisations) | 0/6 | Réflexion |

`DÉDUIT` — onboarder · 2026-07-07 · calcul (US livrées / US totales) par Epic
depuis .roadmap/roadmap.json:86-205

## Inventaire des agents projet (`.claude/agents/`)

17 agents versionnés. `CONFIRMÉ` — onboarder · 2026-07-07 · liste de fichiers .claude/agents/*.md

<div class="agent-grid">
  <div class="agent-card"><strong>orchestrator</strong> / <strong>orchestrator-dev</strong> / <strong>planner</strong> — pilotage de feature, découpage en tickets, routage vers <code>developer</code>.</div>
  <div class="agent-card"><strong>developer</strong> / <strong>developer-refactor</strong> / <strong>developer-migrator</strong> — implémentation générique, refactoring, migrations.</div>
  <div class="agent-card"><strong>reviewer</strong> / <strong>qa-engineer</strong> / <strong>debugger</strong> — review de diff, tests manquants, diagnostic de bug.</div>
  <div class="agent-card"><strong>auditor</strong> / <strong>auditor-subagent</strong> — audit multi-domaine (sécurité, performance, architecture...).</div>
  <div class="agent-card"><strong>onboarder</strong> / <strong>documentarian</strong> / <strong>pathfinder</strong> — découverte de projet, wiki vivant, reconnaissance rapide.</div>
  <div class="agent-card"><strong>ux-designer</strong> / <strong>ui-designer</strong> — flows et systèmes visuels, ne codent jamais.</div>
  <div class="agent-card"><strong>ppt-designer</strong> — génération/amélioration du support PPT de restitution (US6.4). S'appuie sur un stack de skills : <code>pptx-deck</code> (mise en page + garde-fou géométrie), <code>pptx-verify</code> (rendu réel), <code>restitution-deck-design</code> (système de design), <code>pptx-framed-image</code> (image encadrée), <code>slide-text-polish</code> (qualité rédactionnelle + linter) et le skill projet <code>restitution-ppt</code>. Kit portable : <a href="../../export/ppt-toolkit.md"><code>export/ppt-toolkit.md</code></a>.</div>
</div>

### Agents recommandés pour la suite du projet

**Prioritaires** — l'absence d'authentification (Epic 10) et le stade
"réflexion" des Epics 8-11 sont les points structurants du backlog actuel :

- **`auditor`** (domaine sécurité) — auditer l'exposition actuelle avant tout
  déploiement au-delà du poste de développement, vu l'absence totale
  d'authentification sur les routes API sensibles.
- **`planner`** — décomposer les Epics 8 (packaging), 9 (environnements), 10
  (auth) et 11 (multi-clients) en tickets structurés ; ils sont aujourd'hui au
  stade brouillon (`cadrage/epics-us.md` signale plusieurs "points ouverts").
- **`qa-engineer`** — formaliser une stratégie de test (couverture, style
  homogène) avant le packaging, vu l'incohérence documentée entre le README et
  les scripts de test réels.

**Recommandés** :

- **`documentarian`** — maintenir ce wiki à jour au fil de l'avancement des
  Epics 8-11 (enrichissement incrémental avec tags de confiance).
- **`orchestrator-dev`** — une fois les tickets Epic 8-11 planifiés, piloter
  leur implémentation ticket par ticket.

**Optionnels** :

- **`ux-designer`** — si les Epics 10 (écrans d'authentification) et 11
  (sélecteur de client actif) se concrétisent, ces nouveaux parcours
  mériteraient une spécification UX dédiée.
- **`developer-migrator`** — pour l'US11.6 (migration des données existantes
  vers un client par défaut), qui est une migration de schéma/données classique.

<!-- TODO-AGENTS:START — section générée par .claude/supervision/scan_transcripts.py, ne pas éditer à la main -->
## TODO agents 🤖

Constats automatiques du superviseur d'agents (usage mesuré dans les transcripts de session) :

- **Trier les skills BMAD** : 46 installés, 0 invocation à ce jour — décider lesquels garder, customiser ou désinstaller.
- **`revue-increment` jamais invoquée** malgré le rappel SessionStart à chaque session — revoir son déclencheur (l'ancrer au flux de commit ?) ou la simplifier.
- **Skills projet sans usage** : `agent-orchestrator`, `agent-supervisor`, `pptx-framed-image`, `restitution-ppt`, `slide-text-polish` — vérifier pertinence et déclencheurs.

Tableau de bord complet : [technical/agents-supervision.md](technical/agents-supervision.md) — régénéré à chaque session.
<!-- TODO-AGENTS:END -->
