---
updated: 2026-07-07
confidence: mixed
agents: [onboarder]
---

# Architecture

## Flux de requête

Express (`app/src/server.js`, toutes les routes API + service des pages
statiques) → SQLite via `node:sqlite` (module intégré au runtime Node ≥ 22,
aucune dépendance externe de base de données) → pages front vanilla
HTML/CSS/JS dans `app/src/public/` (aucun framework, aucun build).
`admin.html` est la page par défaut de l'outil (`/` comme `/admin.html`).
`CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:19-27, CLAUDE.md:44-48

## Structure du code

<div class="tree">
app/
├── src/
│   ├── server.js         # toutes les routes API + service des fichiers statiques (929 lignes)
│   ├── db.js             # ouverture SQLite (node:sqlite), schéma + migrations idempotentes, rôles par défaut
│   ├── referentiel.js     # import Excel du référentiel, ré-import non destructif / remplacement total
│   ├── invites.js         # import de la liste d'invités (CSV/Excel), calcul des non-répondants
│   ├── normalisation.js   # rapprochement tolérant des libellés département/équipe (casse, accents, espaces)
│   ├── correcteur.js      # correction orthographique conservatrice du référentiel importé (nspell)
│   ├── radar-svg.js       # génération du radar en SVG (affiché à l'écran et rasterisé pour le PPT)
│   ├── session-utils.js   # formatage d'un libellé de session
│   └── public/            # pages front (vanilla JS/HTML/CSS, aucun build)
│       ├── admin.html      # espace animateur (page par défaut)
│       ├── repondre.html   # parcours répondant
│       ├── resultats.html  # résultats (vue animateur)
│       ├── pilotage.html   # consolidation département (vue sponsor/RH/direction)
│       ├── maquette-question.html
│       └── env-banner.js   # bandeau d'environnement partagé
├── scripts/
│   ├── backup-db.js / restore-db.js         # sauvegarde (VACUUM INTO) / restauration
│   ├── build-artifact.js                     # packaging d'un artefact de déploiement (.tgz)
│   ├── export-restitution-ppt.py / pptx_deck.py   # génération du PPT (python-pptx)
│   ├── capture-screenshots.js                 # captures d'écran (outillage de dev)
│   └── test-*.js / test-export-ppt.py         # tests (voir technical/tests.md)
├── data/                   # bases SQLite par environnement (gitignoré, non versionné)
└── .env.dev / .env.preprod / .env.prod / .env.example
</div>

`CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:129-155

## Modèle de données (SQLite)

Schéma créé/migré automatiquement au démarrage (`CREATE TABLE IF NOT EXISTS`
+ `ALTER TABLE` idempotents pour les colonnes ajoutées après coup, sans
framework de migration dédié). `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/db.js:11-123

<div class="table-wrap">

| Table | Rôle |
|---|---|
| `piliers` / `sous_categories` / `questions` / `niveaux` | Le référentiel de maturité. Colonne `archive` sur les 3 premières : une entrée disparue lors d'un ré-import est archivée (pas supprimée) si elle porte des réponses |
| `sessions` | Une campagne d'évaluation (dates d'ouverture/fermeture, texte d'accueil optionnel) |
| `session_questions` | Périmètre de questions actives pour une session (absence de ligne = tout le référentiel actif, rétrocompatibilité) |
| `repondants` | Identité, département/équipe/rôle, `est_manager`/`dans_equipe`, `soumis_at` (verrouillage définitif une fois soumis) |
| `reponses` | Une réponse (`niveau` 0-3) d'un répondant à une question, `UNIQUE(repondant_id, question_id)` |
| `roles` | Catalogue global de rôles suggérés (non lié à une session) |
| `invites` | Emails invités à une session, pour le rappel ciblé sur les non-répondants |
| `commentaires` | Commentaire libre par équipe et par session, restitué à l'écran et dans le PPT |

</div>

`CONFIRMÉ` — onboarder · 2026-07-07 · app/src/db.js:14-100, app/README.md:157-179

## Décisions notables

- **Ré-import non destructif par défaut (`mode=conserver`)** : la
  réconciliation rapproche la nouvelle grille de l'existante par clé de
  contenu (nom de pilier, nom d'objectif, texte de question) pour réutiliser
  le même `question_id` sur une question inchangée — les réponses déjà
  collectées restent valides. Une entrée disparue est archivée si elle porte
  des réponses, supprimée sinon. Le mode `remplacer` est une purge totale
  irréversible (référentiel + toutes les données collectées), atomique (une
  seule transaction), à réserver à un repart de zéro. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:93-253
- **Export PPT — un seul script Python** : un script Python (`python-pptx`)
  construit le `.pptx` à partir du template OCTO, **radar compris, en vectoriel
  natif** (formes python-pptx). Depuis le 2026-07-21 l'export ne dépend plus de
  Chrome/Puppeteer : le module `radar-svg.js` et la rasterisation
  (`rasteriserRadars`), devenus morts après le passage au radar vectoriel, ont été
  retirés. `CONFIRMÉ` — 2026-07-21 · app/src/server.js (route export-ppt) + app/scripts/export-restitution-ppt.py
- **Deck construit SUR le template, pas de zéro** : le générateur ouvre le
  `.pptx` OCTO et dessine par-dessus ses masters/layouts ; il **détecte la
  police de marque** (Outfit) et **lit les couleurs du thème** (= charte OCTO
  navy/cyan/slate) au lieu de les coder en dur — donc s'adapte à un autre
  template fourni. Décision 2026-07-08 : le `.pptx` OCTO **fait foi**,
  `PptxGenJS` écarté (ne charge pas un template existant). Références versionnées
  dans `export/` : [`template-octo.md`](../../../export/template-octo.md) (spec
  fidèle — 1 template = 1 md compagnon), [`design-system-octo.md`](../../../export/design-system-octo.md)
  (principes visuels), [`points-amelioration-ppt.md`](../../../export/points-amelioration-ppt.md)
  (backlog qualité). `CONFIRMÉ` — 2026-07-08 · app/scripts/pptx_deck.py (police_marque, theme_colors), app/scripts/export-restitution-ppt.py:construire
- **Recalcul des agrégats à la demande, pas en batch** : `agregerResultats`
  interroge la base à chaque appel d'API résultats/consolidation/comparaison
  plutôt que de maintenir une table d'agrégats précalculés — cohérent avec
  l'exigence produit de "temps réel dès qu'un questionnaire est soumis" (US5.4),
  mais chaque question réagrège l'ensemble de ses réponses à chaque requête.
  `DÉDUIT` — onboarder · 2026-07-07 · app/src/server.js:521-581
- **Comparaison historique par libellé d'équipe** : la session précédente
  d'une équipe est retrouvée par égalité de chaîne sur `equipe` (pas par un
  identifiant d'équipe stable) — dépend donc entièrement de la cohérence
  apportée par la saisie tolérante (`normalisation.js`) et la fusion manuelle
  de doublons. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:638-649
- **Aucune authentification à ce stade** (Epic 10 non implémenté) : ne pas
  supposer de contrôle d'accès dans le code existant — toute route `/api/*`
  lue lors de l'exploration est accessible sans vérification d'identité.
  `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:183-184, absence de middleware d'authentification observée sur l'ensemble de app/src/server.js
- **3 environnements isolés en parallèle sur le même poste** (DEV/PRE-PROD/PROD),
  chacun avec son port et sa propre base SQLite, chargés via `node --env-file`.
  `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:68-84

## Fragilités connues

- **Parsing Excel dépendant d'une structure implicite** : le parseur
  reconnaît les piliers/objectifs via un motif de texte (`"PILIER - OBJECTIF"`
  en colonne A, ligne `"Question"`, ligne `"1 choix possible"` avec les 4
  niveaux en colonnes fixes 4/6/8/10) — une variation de mise en forme du
  fichier source peut faire échouer silencieusement la détection d'un
  pilier/objectif/question (pas de validation stricte de structure au-delà du
  test "aucun pilier détecté"). `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:23-79, 256-260
- **`server.js` en monolithe unique** (929 lignes, ~25 routes) sans découpage
  en routeurs Express — toute nouvelle route s'ajoute au même fichier, ce qui
  augmente le risque de conflit et complique la navigation à mesure que
  l'Epic 7+ s'ajoute. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:1-929
- **Double implémentation du rendu radar** (SVG serveur pour le PPT vs rendu
  JS du radar dans `resultats.html`) — le commentaire de `radar-svg.js`
  indique explicitement viser la parité visuelle avec le front, sans test
  automatisé qui la garantisse. `DÉDUIT` — onboarder · 2026-07-07 · app/src/radar-svg.js:1-4
- **Aucune notion de client/organisation** : référentiel, rôles et
  répondants sont des données globales à l'installation — un déploiement
  multi-organisations mélangerait les données sans l'Epic 11 (à l'état
  réflexion). `CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/epics-us.md:105-116
- **`CHROME_PATH` par défaut non portable** (chemin Windows en dur) —
  nécessite une surcharge explicite de la variable d'environnement sur
  Linux/Mac. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:17
