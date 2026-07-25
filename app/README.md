# app — Questionnaire de maturité agile/produit (MVP)

Documentation technique de l'application. Pour le contexte fonctionnel (personas,
parcours, epics/US), voir [`../cadrage/`](../cadrage/).

## Sommaire

- [Stack technique](#stack-technique)
- [Prérequis](#prérequis)
- [Installation et démarrage](#installation-et-démarrage)
- [Les 3 environnements (DEV / PRE-PROD / PROD)](#les-3-environnements-dev--pre-prod--prod)
- [Variables d'environnement](#variables-denvironnement)
- [Utiliser l'outil : importer un référentiel, créer une session](#utiliser-loutil--importer-un-référentiel-créer-une-session)
- [Structure du code](#structure-du-code)
- [Modèle de données (SQLite)](#modèle-de-données-sqlite)
- [API HTTP](#api-http)
- [Tests](#tests)
- [Export PowerPoint (dépendance Python)](#export-powerpoint-dépendance-python)
- [Sauvegarde / restauration de la base](#sauvegarde--restauration-de-la-base)
- [Packaging d'un artefact de déploiement](#packaging-dun-artefact-de-déploiement)

## Stack technique

- **Runtime** : Node.js ≥ 22 (voir `engines` dans `package.json`).
- **Serveur HTTP** : [Express](https://expressjs.com/) 4 (`src/server.js`, toutes les routes API + fichiers statiques).
- **Base de données** : [`node:sqlite`](https://nodejs.org/api/sqlite.html) — module intégré au runtime Node ≥ 22, **aucune dépendance de base de données externe à installer**. Un fichier `.db` par environnement (voir plus bas).
- **Front-end** : pages HTML/CSS/JS **vanilla** (aucun framework, aucun build) dans `src/public/` :
  - `admin.html` — espace animateur (page par défaut de l'outil), import du référentiel, création/gestion de session, rôles, invitations.
  - `repondre.html` — parcours de réponse au questionnaire (répondant).
  - `resultats.html` — vue animateur des résultats (radar, dispersion, comparaison, export PPT).
  - `pilotage.html` — vue de consolidation multi-équipes par département (sponsor/RH/direction).
- **Import du référentiel** : [ExcelJS](https://github.com/exceljs/exceljs) (lecture du fichier Excel de la grille de maturité).
- **Upload de fichiers** : [Multer](https://github.com/expressjs/multer) (stockage en mémoire, limite 10 Mo).
- **Correction orthographique du référentiel importé** : [`nspell`](https://github.com/wooorm/nspell) + dictionnaire français (`dictionary-fr`), avec une liste blanche de vocabulaire agile/produit (`src/correcteur.js`).
- **Export PPT** : un script **Python** (`python-pptx`) génère le fichier `.pptx` à partir du template OCTO, **radar compris (vectoriel natif)**. Depuis le 2026-07-21 l'export ne dépend plus de Chrome/Puppeteer — la rasterisation a été retirée (voir [Export PowerPoint](#export-powerpoint-dépendance-python)).

## Prérequis

- Node.js ≥ 22 (`node:sqlite` n'existe pas avant).
- Pour l'**export PPT** uniquement : Python 3 avec `python-pptx` installé (version épinglée dans `requirements.txt` : `pip install -r requirements.txt`). Chrome/Chromium **n'est plus requis** depuis le 2026-07-21 (radar vectoriel, rasterisation retirée).
- Aucun autre service externe (pas de serveur de base de données à installer, pas de dépendance réseau tierce en fonctionnement normal).

## Installation et démarrage

```bash
cd app
npm install
```

Puis, selon l'environnement souhaité (voir section suivante) :

```bash
npm run start:dev       # http://localhost:3000, base ./data/dev/app.db
npm run start:preprod   # http://localhost:3001, base ./data/preprod/app.db
npm run start:prod      # http://localhost:3002, base ./data/prod/app.db
npm start                # démarrage "brut" sans fichier .env (valeurs par défaut du code : port 3000, ./data/app.db)

npm run seed:demo        # peuple le MODE DÉMO (données fictives : département + équipes + 2 sessions), DEV par défaut ; ne touche pas le réel
```

Ces scripts (`package.json`) utilisent `node --env-file=.env.<env> src/server.js` : le
fichier `.env.<env>` est chargé nativement par Node (`--env-file`, disponible à
partir de Node 20.6), sans dépendance type `dotenv`.

Le dossier de la base SQLite (`DB_PATH`) est créé automatiquement au premier
démarrage s'il n'existe pas (`src/db.js`), de même que le schéma des tables.

La page par défaut de l'outil (`/` comme `/admin.html`) est l'espace animateur.

## Les 3 environnements (DEV / PRE-PROD / PROD)

Trois environnements isolés peuvent tourner **en parallèle sur le même poste**,
chacun avec son port et sa propre base SQLite (fichiers `.env.dev` / `.env.preprod`
/ `.env.prod`, versionnés) :

| Environnement | Commande | Port | Base de données |
|---|---|---|---|
| DEV | `npm run start:dev` | 3000 | `./data/dev/app.db` |
| PRE-PROD | `npm run start:preprod` | 3001 | `./data/preprod/app.db` |
| PROD | `npm run start:prod` | 3002 | `./data/prod/app.db` |

L'environnement courant (`APP_ENV`) est exposé via `GET /api/env` et alimente un
bandeau visible dans l'interface pour éviter toute confusion entre environnements.

Le dossier `data/` est gitignoré (`data/**/*.db`) : ces bases ne sont pas des
livrables versionnés, elles sont propres à chaque poste/déploiement.

## Variables d'environnement

Documentées et commentées dans [`.env.example`](.env.example) (à copier/adapter,
ne jamais committer un vrai `.env` avec des chemins/données machine) :

| Variable | Défaut (code) | Rôle |
|---|---|---|
| `APP_ENV` | `''` | Libellé affiché dans le bandeau d'environnement de l'UI (`DEV` / `PRE-PROD` / `PROD`). |
| `PORT` | `3000` | Port HTTP d'écoute du serveur Express. |
| `DB_PATH` | `./data/app.db` | Chemin du fichier SQLite (toutes les données persistantes). Créé au premier démarrage si absent. |
| `BACKUP_DIR` | `<dossier de DB_PATH>/backups` | Dossier de sortie des sauvegardes (`scripts/backup-db.js`). |
| `PYTHON` | `python` | Interpréteur Python invoqué pour générer le PPT (`scripts/export-restitution-ppt.py`). |

## Utiliser l'outil : importer un référentiel, créer une session

1. **Importer le référentiel** (espace animateur, `admin.html`) : upload d'un
   fichier Excel (voir les fichiers d'exemple dans [`../reference grille/`](../reference%20grille/)),
   1 onglet = 1 pilier. Deux modes d'import (`POST /api/referentiel/import`,
   champ `mode`) :
   - `conserver` (défaut) — ré-import non destructif : les questions inchangées
     gardent le même identifiant (les réponses déjà collectées restent
     valides) ; les questions/objectifs/piliers disparus de la nouvelle grille
     sont archivés s'ils portent des réponses, sinon supprimés.
   - `remplacer` — purge totale (référentiel **et** toutes les données
     collectées : sessions, répondants, réponses, invitations, commentaires)
     avant de charger la nouvelle grille à neuf. Irréversible : `GET
     /api/referentiel/stats` renvoie les compteurs à afficher dans la
     confirmation avant ce geste.
2. **Créer une session** pour une équipe (`POST /api/sessions`) : date
   d'ouverture/fermeture, périmètre de questions actives (par défaut : tout le
   référentiel), texte d'accueil optionnel. La réponse contient le lien à
   partager aux répondants : `/repondre.html?session=<id>`.
3. **Inviter des participants** (optionnel, pour le rappel automatique) : upload
   d'une liste d'emails (CSV ou Excel) via `POST /api/sessions/:id/invites`.
4. **Suivre/consulter les résultats** dans `resultats.html` (radar, dispersion,
   comparaison avec une session précédente de la même équipe) et exporter un
   support PPT depuis cet écran.
5. **Vue pilotage** (`pilotage.html`) : consolidation par département, avec
   zoom sur une équipe.

## Structure du code

```
app/
├── src/
│   ├── server.js         # toutes les routes API + service des fichiers statiques
│   ├── db.js             # ouverture SQLite (node:sqlite), schéma + migrations idempotentes, rôles par défaut
│   ├── referentiel.js     # import Excel du référentiel, ré-import non destructif / remplacement total
│   ├── invites.js         # import de la liste d'invités (CSV/Excel), calcul des non-répondants
│   ├── normalisation.js   # rapprochement tolérant des libellés département/équipe (casse, accents, espaces)
│   ├── correcteur.js      # correction orthographique conservatrice du référentiel importé (nspell)
│   ├── mode.js            # mode démo/réel courant (lu du cookie) — garde-fou de séparation des données
│   ├── session-utils.js   # formatage d'un libellé de session
│   └── public/            # pages front (vanilla JS/HTML/CSS, aucun build)
│       ├── admin.html      # espace animateur (page par défaut)
│       ├── repondre.html   # parcours répondant
│       ├── resultats.html  # résultats (vue animateur)
│       ├── pilotage.html   # consolidation département (vue sponsor/RH/direction)
│       └── env-banner.js   # bandeau d'environnement partagé
├── scripts/
│   ├── backup-db.js         # sauvegarde SQLite (VACUUM INTO), voir plus bas
│   ├── restore-db.js        # restauration depuis une sauvegarde
│   ├── build-artifact.js    # packaging d'un artefact de déploiement (.tgz)
│   ├── export-restitution-ppt.py / pptx_deck.py   # génération du PPT (python-pptx)
│   ├── capture-screenshots.js                       # captures d'écran (outillage de dev)
│   └── test-*.js            # tests (voir section Tests)
├── data/                   # bases SQLite par environnement (gitignoré, non versionné)
└── .env.dev / .env.preprod / .env.prod / .env.example
```

## Modèle de données (SQLite)

Schéma créé/migré automatiquement au démarrage (`src/db.js`, `CREATE TABLE IF
NOT EXISTS` + `ALTER TABLE` idempotents pour les colonnes ajoutées après coup) :

- `piliers` / `sous_categories` / `questions` / `niveaux` — le référentiel de
  maturité (1 pilier a des sous-catégories/objectifs, qui ont des questions,
  qui ont 4 niveaux de réponse 0 à 3 avec une valeur numérique). Colonne
  `archive` sur les 3 premières tables : une entrée disparue lors d'un
  ré-import est archivée (pas supprimée) si elle porte des réponses.
- `sessions` — une campagne d'évaluation (dates d'ouverture/fermeture, texte
  d'accueil optionnel).
- `session_questions` — périmètre de questions actives pour une session donnée
  (une session sans ligne ici = tout le référentiel actif, rétrocompatibilité).
- `repondants` — une personne ayant répondu dans une session (identité,
  département/équipe/rôle, `est_manager`/`dans_equipe`, `soumis_at` = date de
  soumission finale, non modifiable ensuite).
- `reponses` — une réponse (`niveau` 0-3) d'un répondant à une question.
- `roles` — catalogue global (non lié à une session) de rôles suggérés.
- `invites` — liste d'emails invités à une session, pour le rappel ciblé sur
  les non-répondants.
- `commentaires` — commentaire libre par équipe et par session, restitué à
  l'écran et dans l'export PPT.

## API HTTP

Toutes les routes sont préfixées `/api`. Aucune authentification n'est en place
à ce stade (voir `../cadrage/epics-us.md`, Epic 10 — non implémenté).

### Référentiel

- `POST /api/referentiel/import` — upload multipart (`fichier`, `mode` = `conserver`|`remplacer`).
- `GET /api/referentiel/stats` — compteurs sessions/réponses/piliers/questions actifs (pour la confirmation avant `remplacer`).
- `GET /api/referentiel` — référentiel actif (piliers → sous-catégories → questions → niveaux).
- `GET /api/texte-intro-defaut` — texte d'accueil par défaut du parcours répondant.

### Rôles, départements, équipes

- `GET /api/roles` / `POST /api/roles` / `DELETE /api/roles/:nom`
- `GET /api/departements` / `GET /api/equipes` — valeurs distinctes déjà saisies par des répondants.
- `GET /api/repondants/valeurs/:champ` (`departement`|`equipe`) — valeurs + effectifs.
- `POST /api/repondants/fusion` — fusion de doublons résiduels (`{ champ, source, cible }`), réaffectation globale.

### Sessions

- `GET /api/sessions` — liste (id, dates).
- `POST /api/sessions` — création (`ouverture_at`, `fermeture_at`, `questions_actives?`, `texte_intro?`).
- `GET /api/sessions/:id` / `GET /api/sessions/:id/summary`
- `GET /api/sessions/:id/referentiel` — référentiel restreint au périmètre actif de la session.

### Invitations

- `POST /api/sessions/:id/invites` — upload multipart (CSV ou Excel).
- `GET /api/sessions/:id/invites`
- `GET /api/sessions/:id/invites/non-repondants` — cible du rappel.

### Répondants et parcours de réponse

- `POST /api/sessions/:id/repondants` — identification (nom, prénom, email, département, équipe, rôle, `est_manager`, `dans_equipe`).
- `GET /api/repondants/:id`
- `PUT /api/repondants/:id/piliers/:pilierId/reponses` — sauvegarde des réponses d'un pilier complet.
- `POST /api/repondants/:id/soumission` — soumission finale (bloque toute modification ultérieure).

### Résultats et consolidation

- `GET /api/sessions/:id/equipes` / `GET /api/sessions/:id/departements` — listes avec effectifs (`?manager=sans` pour exclure les managers).
- `GET /api/sessions/:id/participation` — taux de réponse (soumis / invités).
- `GET /api/sessions/:id/commentaire` (`?equipe=`) / `PUT /api/sessions/:id/commentaire`
- `GET /api/sessions/:id/resultats?equipe=...&manager=sans` — agrégation par pilier/objectif/question (moyenne, min, max, écart-type) + détail nominatif des réponses.
- `GET /api/sessions/:id/consolidation?departement=...` — radar consolidé d'un département + répartition par équipe.
- `GET /api/sessions/:id/comparaison?equipe=...` — comparaison avec la session précédente de la même équipe (axes radar + delta par pilier).

### Export PPT

- `GET /api/sessions/:id/export-ppt?scope=equipe&equipe=...` ou `?scope=departement&departement=...` (`&manager=sans` optionnel) — génère et télécharge le fichier `.pptx`.

### Divers

- `GET /api/env` — environnement courant (`APP_ENV`), pour le bandeau UI.

## Tests

```bash
npm test
```

Enchaîne (`package.json`) les scripts suivants (aucun framework de test) :

```
node scripts/test-reimport.js
node scripts/test-rappel.js
node scripts/test-normalisation.js
node scripts/test-scores.js
node scripts/test-sessions.js
node scripts/test-mode.js
node scripts/test-admin-ui.js
node scripts/test-contraste-radar.js
node scripts/test-correcteur.js
node scripts/test-export-ppt-si-dispo.js
node scripts/test-smoke-http.js
```

Deux styles d'assertion cohabitent, tous deux sans dépendance externe :
`test-sessions.js`, `test-admin-ui.js`, `test-mode.js` et `test-correcteur.js`
utilisent les assertions Node natives (`node:assert/strict`) ; `test-reimport.js`,
`test-rappel.js` et `test-normalisation.js` s'appuient sur un petit helper
maison `check()`. Une harmonisation vers `node:assert/strict` (voire
`node:test`) est souhaitable mais non bloquante. `test-correcteur.js` charge le
dictionnaire français complet et dure ~6 s.

`test-smoke-http.js` est le test fonctionnel bout-en-bout : il démarre le vrai
serveur (`src/server.js`) sur un port libre avec une base SQLite temporaire, puis
vérifie en HTTP réel la page d'accueil, la console animateur et `/api/env`.

Chaque script peut aussi être lancé individuellement (`node scripts/test-xxx.js`).
Il existe également `scripts/test-export-ppt.py`, indépendant de `npm test`, pour
vérifier la génération du PPT côté Python (géométrie des slides).

### Lint

```bash
npm run lint            # ESLint (flat config eslint.config.js)
```

ESLint (règles recommandées) est la seule `devDependency` : globals Node pour
`src/`+`scripts/`, navigateur pour `src/public/`. Il tourne aussi en CI
(`.github/workflows/ci.yml`, avant `npm test`). Le formatage pur (Prettier)
n'est pas verrouillé ; un `.editorconfig` (racine) couvre indentation, fins de
ligne et encodage.

## Export PowerPoint (dépendance Python)

L'export (`GET /api/sessions/:id/export-ppt`) :
1. écrit un JSON temporaire décrivant le contenu du support ;
2. invoque `scripts/export-restitution-ppt.py` (Python, `python-pptx`, `PYTHON`)
   qui construit le fichier `.pptx` à partir du template
   [`../template ppt/template.pptx`](../template%20ppt/template.pptx), **radar compris,
   dessiné en vectoriel natif** (python-pptx) ;
3. renvoie le fichier au téléchargement puis nettoie les fichiers temporaires.

Depuis le 2026-07-21 l'export **ne dépend plus de Chrome/Puppeteer** : le radar est
vectoriel, et la rasterisation (`rasteriserRadars`) + le module serveur `radar-svg.js`
ont été retirés, ainsi que la dépendance `puppeteer-core` devenue inutile (désinstallée).
Sans Python (`python-pptx`) configuré, le reste de l'application fonctionne
normalement ; seul cet export échoue.

## Sauvegarde / restauration de la base

```bash
npm run backup                                    # écrit une sauvegarde horodatée dans BACKUP_DIR
node scripts/restore-db.js <fichier-sauvegarde.db>  # restaure (app arrêtée), garde un filet de sécurité de l'état courant
```

`backup-db.js` utilise `VACUUM INTO` (cohérent même si l'app tourne, produit une
base SQLite autonome). `restore-db.js` doit être lancé application arrêtée (il
écrase `DB_PATH`) ; il copie automatiquement l'état courant avant d'écraser, et
supprime les fichiers `-wal`/`-shm` résiduels.

## Packaging d'un artefact de déploiement

```bash
npm run build:artifact
```

Produit `dist/<nom>-<version>-<horodatage>.tgz` : archive autoportante (sources
`src/`, scripts strictement runtime, `node_modules` de production, template PPT,
`package.json`/`package-lock.json`, `.env.example`, un `README-deploy.txt` avec
la procédure minimale de démarrage). Ne nécessite aucun accès réseau pour être
déployée (dépendances déjà copiées).
