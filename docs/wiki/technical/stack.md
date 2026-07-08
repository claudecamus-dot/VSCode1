---
updated: 2026-07-07
confidence: confirmed
agents: [onboarder]
---

# Stack technique

## Runtime et serveur

| Composant | Détail |
|---|---|
| Runtime | Node.js ≥ 22 (`engines.node` du `package.json`) — requis car `node:sqlite` (module intégré) n'existe pas avant. `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:18-20, app/README.md:39 |
| Serveur HTTP | Express 4 (`^4.21.2`) — toutes les routes API + fichiers statiques dans `app/src/server.js`. `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:24 |
| Base de données | `node:sqlite` (`DatabaseSync`) — module intégré au runtime, **aucune dépendance externe de base de données**. Un fichier `.db` par environnement. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/db.js:3-9 |
| Chargement de configuration | `node --env-file=.env.<env>` (natif Node ≥ 20.6), pas de dépendance type `dotenv`. `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:10-12 |
| Front-end | Pages HTML/CSS/JS **vanilla**, aucun framework, aucun build (`app/src/public/`). `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:27-31 |

## Dépendances npm (`app/package.json`)

<div class="table-wrap">

| Package | Version | Rôle |
|---|---|---|
| `express` | `^4.21.2` | Serveur HTTP, routage API |
| `exceljs` | `^4.4.0` | Lecture du fichier Excel du référentiel de maturité |
| `multer` | `^2.0.1` | Upload de fichiers (stockage mémoire, limite 10 Mo) |
| `nspell` | `^2.1.5` | Correction orthographique conservatrice du référentiel importé |
| `dictionary-fr` | `^3.0.0` | Dictionnaire français utilisé par `nspell` |
| `puppeteer-core` | `^25.1.0` | Pilote un Chrome/Chromium déjà installé pour rasteriser le radar SVG en PNG (export PPT) |

</div>

`CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:21-28

Côté `devDependencies`, seul **ESLint** est déclaré (`eslint`, `@eslint/js`,
`globals` — ajoutés le 2026-07-08 pour outiller les conventions) : toujours pas
de framework de test (les tests s'appuient sur les modules natifs Node), pas de
bundler, pas de transpileur. `CONFIRMÉ` — 2026-07-08 · app/package.json (bloc `devDependencies`)

## Dépendances hors npm (contrat externe, non versionnées dans le projet)

- **Chrome/Chromium** installé sur la machine (chemin configurable via
  `CHROME_PATH`), piloté en headless par `puppeteer-core` pour rasteriser le
  radar SVG en PNG avant l'export PPT.
- **Python 3** avec `python-pptx` (`pip install python-pptx`) — génère le
  fichier `.pptx` final (`app/scripts/export-restitution-ppt.py`) à partir du
  template `template ppt/template.pptx`.

Sans ces deux dépendances correctement configurées, le reste de l'application
fonctionne normalement ; seul l'export PPT échoue. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:37-41, 258-269

La version de `python-pptx` est désormais épinglée dans `app/requirements.txt`
(`python-pptx==1.0.2`, alignée sur la version installée sur ce poste) :
`pip install -r requirements.txt`. Résout la zone d'ombre précédente (absence
de fichier de verrouillage). Python 3 lui-même reste sans version épinglée
(dépendance système, hors du périmètre d'un `requirements.txt`).
`CONFIRMÉ` — 2026-07-08 · app/requirements.txt

## Variables d'environnement

<div class="table-wrap">

| Variable | Défaut (code) | Rôle |
|---|---|---|
| `APP_ENV` | `''` | Libellé affiché dans le bandeau d'environnement de l'UI (`DEV` / `PRE-PROD` / `PROD`) |
| `PORT` | `3000` | Port HTTP d'écoute du serveur Express |
| `DB_PATH` | `./data/app.db` | Chemin du fichier SQLite — créé au premier démarrage si absent |
| `BACKUP_DIR` | `<dossier de DB_PATH>/backups` | Dossier de sortie des sauvegardes (`scripts/backup-db.js`) |
| `CHROME_PATH` | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Exécutable Chrome/Chromium headless (export PPT) |
| `PYTHON` | `python` | Interpréteur Python invoqué pour générer le PPT |

</div>

`CONFIRMÉ` — onboarder · 2026-07-07 · app/.env.example:1-25, app/README.md:91-98

Documentées et versionnées : `.env.dev`, `.env.preprod`, `.env.prod`,
`.env.example`. Un vrai `.env` ne doit jamais être committé (chemins/données
machine) ; `.env` est aussi explicitement refusé en lecture par
`.claude/settings.json` (`permissions.deny`). `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:88-89, .claude/settings.json:17-24

## Les 3 environnements (DEV / PRE-PROD / PROD)

<div class="table-wrap">

| Environnement | Commande | Port | Base de données |
|---|---|---|---|
| DEV | `npm run start:dev` | 3000 | `./data/dev/app.db` |
| PRE-PROD | `npm run start:preprod` | 3001 | `./data/preprod/app.db` |
| PROD | `npm run start:prod` | 3002 | `./data/prod/app.db` |

</div>

Les trois environnements peuvent tourner en parallèle sur le même poste,
chacun avec son port et sa propre base SQLite. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:68-84
