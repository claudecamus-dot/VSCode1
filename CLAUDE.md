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
- **Export PPT en deux étapes** : Puppeteer (Chrome/Chromium headless, pas
  Puppeteer complet) rasterise le radar SVG en PNG, puis un script Python
  (`python-pptx`) construit le `.pptx` à partir du template OCTO
  (`template ppt/template.pptx`). Sans Chrome/Python correctement
  configurés, le reste de l'application fonctionne normalement — seul cet
  export échoue.
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
  fail-open en cas d'erreur de parsing.
- `.claude/skills/restitution-ppt/` : skill projet pour la génération/
  amélioration du PPT de restitution (US6.4), voir son `SKILL.md`.
- `.claude/agents/` : agents projet disponibles (orchestrateurs, developer,
  onboarder, reviewer, etc.) — voir chaque fichier pour son rôle exact.
