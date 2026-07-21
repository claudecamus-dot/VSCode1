# Questionnaire de maturité agile/produit

Outil web permettant à un animateur (coach agile, manager) de faire passer à
une équipe un questionnaire de maturité agile/produit (à partir d'une grille
Excel de référence), de consulter les résultats agrégés (radar, dispersion,
comparaison dans le temps) et d'exporter un support de restitution
PowerPoint. Une vue de consolidation multi-équipes ("pilotage") existe pour
une lecture au niveau département.

Vocabulaire métier à préserver tel quel dans le code et les échanges :
**pilier** (axe du référentiel) → **sous-catégorie/objectif** → **question**,
avec 4 **niveaux** de réponse (0 à 3) ; **animateur** (celui qui pilote une
session) vs **répondant** ; **session** (une campagne d'évaluation pour une
équipe) ; **pilotage** (vue consolidée par département).

Documentation de cadrage fonctionnel (personas, parcours, découpage
Epics/US) : voir [`cadrage/`](cadrage/). Vue d'ensemble consultable par
défaut (métier, technique, roadmap) : [`docs/wiki.html`](docs/wiki.html) —
la roadmap y est intégrée directement (graphique + détail par Epic), source
éditable `.roadmap/roadmap.json`. **Peut être en avance ou en retard sur le
code réel**, vérifier contre `git log`/`git status` avant de lui faire
confiance.

## Commandes

Toute la partie applicative vit dans `app/` :

```bash
cd app
npm install

npm run start:dev       # http://localhost:3000, base ./data/dev/app.db
npm run start:preprod   # http://localhost:3001, base ./data/preprod/app.db
npm run start:prod      # http://localhost:3002, base ./data/prod/app.db

npm test                 # enchaîne les scripts scripts/test-*.js (node:assert/strict + helper check())
npm run lint              # ESLint (flat config eslint.config.js) — tourne aussi en CI
npm run backup            # sauvegarde SQLite (VACUUM INTO)
npm run build:artifact     # packaging d'un .tgz de déploiement
```

Détails complets (variables d'environnement, API HTTP, export PPT,
sauvegarde/restauration) : voir [`app/README.md`](app/README.md).

## Architecture

Flux de requête : Express (`app/src/server.js`, toutes les routes API +
service des pages statiques) → SQLite via `node:sqlite` (module intégré au
runtime Node ≥ 22, aucune dépendance externe de base de données) → pages
front vanilla HTML/CSS/JS dans `app/src/public/` (aucun framework, aucun
build).

Modèle de données : `piliers` / `sous_categories` / `questions` / `niveaux`
(le référentiel, avec colonne `archive` pour un ré-import non destructif) →
`sessions` (+ `session_questions` pour un périmètre restreint) →
`repondants` → `reponses`. Support : `roles`, `invites`, `commentaires`.
Schéma créé/migré automatiquement au démarrage (`app/src/db.js`,
`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` idempotents).

Décisions non redérivables du code :

- **Ré-import du référentiel non destructif par défaut** (`mode=conserver`) :
  les questions inchangées gardent le même identifiant pour que les réponses
  déjà collectées restent valides ; les entrées disparues sont archivées
  (pas supprimées) si elles portent des réponses. Le mode `remplacer` est une
  purge totale irréversible, à confirmer côté UI avec les compteurs de
  `GET /api/referentiel/stats`.
- **Export PPT — un seul script Python** : un script Python (`python-pptx`)
  construit le `.pptx` à partir du template OCTO (`template ppt/template.pptx`),
  **radar compris, dessiné en vectoriel natif** (plus de rasterisation). Depuis le
  2026-07-21 l'export **ne dépend plus de Chrome/Puppeteer** : le module serveur
  `radar-svg.js` et sa rasterisation (`rasteriserRadars`), devenus morts après le
  passage au radar vectoriel, ont été retirés, ainsi que la dépendance
  `puppeteer-core` devenue inutile (désinstallée). Sans
  Python (`python-pptx`) configuré, le reste de l'application fonctionne
  normalement — seul cet export échoue.
- **Aucune authentification** à ce stade (voir `cadrage/epics-us.md`, Epic
  10 — non implémenté) : ne pas supposer de contrôle d'accès dans le code
  existant.
- **3 environnements isolés en parallèle sur le même poste** (DEV/PRE-PROD/
  PROD), chacun avec son port et sa propre base SQLite, chargés via
  `node --env-file` (natif Node ≥ 20.6, pas de dépendance `dotenv`).

## Claude Code — configuration du projet

- `.claude/settings.json` est **versionné** : mécanisme de hook
  (`PreToolUse` sur `Bash|PowerShell`) + `permissions.deny` sur les secrets
  (`.env`, `secrets/**`, `config/credentials.json`). Ne pas y accumuler de
  règles `permissions.allow` one-off.
- `.claude/settings.local.json` est **local, non versionné** (ignoré via
  `.gitignore`) : c'est là que s'accumulent naturellement les autorisations
  au fil des sessions.
- `.claude/hooks/guard_destructive_git.py` bloque `git push --force` (sans
  `--force-with-lease`) et `git reset --hard` — garde-fou déterministe,
  fail-open en cas d'erreur de parsing. Parsing `shlex` (gère `VAR=value git
  push --force`), tests versionnés dans `.claude/hooks/tests/`.
- `.claude/hooks/warn_verif_before_commit.py` **avertit sans bloquer** avant un
  `git commit` touchant `app/**` si aucune vérif réelle (`npm test`, rendu
  `pptx-verify`, ou `revue-increment`) n'a tourné dans la session — ancre la
  discipline « definition of done » au bon instant. Fail-open, détection de
  vérif par le transcript. Issu du constat #1 du superviseur d'agents (voir
  `.claude/supervision/`, tests dans `.claude/hooks/tests/`).
- `.claude/hooks/orchestrator_gate.py` (`UserPromptSubmit`, **branché le
  2026-07-21**) injecte une grille de qualification (~50 tokens) rappelant de
  passer par `agent-orchestrator` pour une demande multi-étapes/multi-agents ;
  silencieux sur les slash-commands, fail-open. Voir « Skills & agents » pour la
  décision de flotte qui a acté ce branchement.
- `.claude/skills/restitution-ppt/` : skill projet pour la génération/
  amélioration du PPT de restitution (US6.4), voir son `SKILL.md`.
- `.claude/agents/` : agents projet disponibles (orchestrateurs, developer,
  onboarder, reviewer, etc.) — voir chaque fichier pour son rôle exact.

## Skills & agents — comment ça se lance (post-BMAD, 2026-07-16 ; flotte arbitrée 2026-07-21)

Depuis l'install de **BMAD-METHOD v6.10.0** (`_bmad/`), `.claude/skills/` contient ~46 skills `bmad-*` en plus des skills projet. **Flotte canonique tranchée le 2026-07-21** (voir « Décision » ci-dessous) : `.claude/agents/` piloté par l'orchestrateur, BMAD conservé pour son cycle produit, `.opencode/agents/` retiré (doublon ; `.opencode/skills/` **conservé**, c'est la bibliothèque de protocoles que chargent les agents `.claude/agents/`). Ce qui reste :

- **Agents projet `.claude/agents/`** (orchestrator, developer, reviewer, auditor, planner, ux/ui-designer, ppt-designer…) : **la flotte de rôles canonique**, lancée comme sous-agents (Task), orchestrée par `agent-orchestrator` (gate `UserPromptSubmit` **branché**).
- **Agents BMAD** (skills `bmad-agent-*`, lancés par persona : « Amelia » dev, « John » PM, « Winston » architecte, « Sally » UX, « Mary » analyste, « Paige » tech-writer). Conservés pour leur **valeur cycle produit→dev** (`bmad-product-brief`/`bmad-prd`/`bmad-architecture`/`bmad-create-story`/`bmad-dev-story` ; routeur **`bmad-help`**), pas comme fleet de rôles concurrente de `.claude/agents/`.
- **Skills projet** (non-`bmad-`) : `restitution-ppt`, `pptx-framed-image`, `slide-text-polish`, `revue-increment` (definition-of-done — délègue à `bmad-code-review`/`bmad-retrospective`), plus le couple orchestration/supervision importé de VSCode2 le 2026-07-21 : **`agent-orchestrator`** (qualifie une demande de travail multi-étapes, compose et exécute un plan — cascade/parallèle/async, modèle par étape — puis journalise le run via `.claude/orchestration/`) et **`agent-supervisor`** (superviseur étage 2 : diagnostic LLM des KO répétés, agents morts, vérifs manquantes, alimenté par `.claude/supervision/`).

**Décision (2026-07-21)** : `.opencode/agents/` (16 définitions, doublon de `.claude/agents/` utilisé seulement par la CLI externe `opencode`) **supprimé** — mais `.opencode/skills/` (137 fichiers) **conservé** : c'est la bibliothèque de protocoles que les 16 agents `.claude/agents/` chargent (`skills:` → `.opencode/skills/…`), donc pas redondante. `.claude/agents/` retenu comme flotte de rôles canonique et le gate `agent-orchestrator` (`.claude/hooks/orchestrator_gate.py`) **branché** en `UserPromptSubmit` (grille de qualification ~50 tokens, silencieuse sur les slash-commands). BMAD **conservé volontairement** : ses personas recouvrent les rôles de `.claude/agents/` mais son apport réel est le cycle produit (prd/architecture/story) — utiliser `.claude/agents/` + `agent-orchestrator` pour le travail de dev orchestré, BMAD pour le cadrage produit. Le hook SessionStart route vers `bmad-help` en cas de doute.

## Hiérarchie de modèles pour les sous-agents (2026-07-16)

`.claude/agents/*.md` supporte un champ `model:` en frontmatter, appliqué par agent. Déjà en place : `orchestrator`/`orchestrator-dev`/`pathfinder`/`planner` en `sonnet`, `reviewer` en `opus` (scrutinie la plus exigeante). Ajouté cette fois : `auditor-subagent` en `haiku` — sous-agent générique lecture-seule qui produit un rapport structuré selon un protocole fixe (`audit-protocol-light`), sans jugement créatif requis, exactement le profil « subagent d'exploration » que le playbook recommande en tier léger. Les autres agents (`developer*`, `qa-engineer`, `documentarian`, `debugger`, `onboarder`, `ui/ux-designer`, `ppt-designer`) restent sans `model:` (hérite du thread principal) : leur tâche exige un jugement de qualité (diagnostic de bug, écriture de tests, refactoring sans casser la logique métier, décisions de design) où un modèle plus léger risquerait de dégrader le résultat — pas de bascule automatique là où la qualité prime sur le coût.

## Discipline de gestion des tokens (2026-07-16, cf. `docs/wiki/todo.md` et `export/optimisation-tokens.md`)

Le contexte est un cache actif facturé à chaque tour, pas une mémoire gratuite — le laisser croître sans discipline pénalise coût, qualité (« lost in the middle ») et latence (source : OCTO Playbook Agentique, partie « Optimiser la consommation Tokens »). Règles concrètes, pas de changement de ton/style de réponse :

- **Ne pas parcourir** `_bmad/`, `_bmad-output/`, `node_modules/`, `dist/`, `.git/`, `__pycache__/` sauf demande explicite.
- **Lire avant d'écrire, grep les appelants avant de modifier** une fonction/un champ partagé.
- **Préférer un grep/read ciblé à un dump récursif** — surtout sur `.claude/skills/bmad-*` (flotte de skills volumineuse) et sur `_bmad/` (framework versionné).
- **Sous-agent pour toute sortie volumineuse** (exploration large, longs logs de test) plutôt que de la laisser polluer le contexte principal.
- **`/compact` dès ~40 %** de fenêtre de contexte utilisée si la conversation doit continuer longtemps sur le même sujet.
