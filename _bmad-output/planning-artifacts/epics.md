# Epics et stories — VSCode1 (questionnaire de maturité agile/produit)

Amorçage story-obligatoire, 2026-10-28, à compléter avec le PO. Ce fichier décrit
uniquement du travail observable dans le dépôt (README.md, CLAUDE.md, `app/package.json`,
`docs/wiki/todo.md`) ; tout ce qui est une hypothèse est marqué « à confirmer par le PO ».

## Epic 1 : Socle existant et travaux en cours

Objectif : garder fiable l'outil existant (app Node dans `app/`, export PowerPoint de
restitution) et tracer le travail ouvert déjà noté dans `docs/wiki/todo.md`.

### Story 1.1: Garder la suite de tests de l'application verte

En tant que mainteneur de l'outil de questionnaire,
je veux que la suite `npm test` passe intégralement,
afin de pouvoir modifier l'application sans régression silencieuse.

**Statut : en place, non revérifié ce jour** (la suite est un enchaînement de scripts Node sans framework défini par `app/package.json` ; `npm test` non exécuté lors de cet amorçage)

**Acceptance Criteria [3 critères]:** (sources : `app/package.json`, `app/scripts/test-*.js`)

- AC1.1.1 — **Given** les dépendances installées (`cd app && npm install`), **When** on lance `npm test`, **Then** la commande sort en code 0 (non exécuté).
- AC1.1.2 — **Given** un script de test isolé, **When** on lance `node scripts/test-scores.js` depuis `app/`, **Then** il sort en code 0 (non exécuté).
- AC1.1.3 — **Given** le code de `app/`, **When** on lance `npm run lint`, **Then** ESLint ne remonte aucune erreur (non exécuté ; à confirmer par le PO comme critère de livraison).

### Story 1.2: Vérifier l'export PowerPoint de restitution par un rendu réel

En tant qu'animateur qui présente les résultats d'une équipe,
je veux que l'export `.pptx` soit géométriquement correct et regardé sur un rendu réel,
afin de livrer un support de restitution exploitable.

**Statut : pratique en place, à rejouer à chaque modification de l'export** (CLAUDE.md la prescrit ; `scripts/test-export-ppt.py` est indépendant de `npm test` ; non exécuté)

**Acceptance Criteria [2 critères]:** (sources : `CLAUDE.md`, `app/scripts/export-restitution-ppt.py`)

- AC1.2.1 — **Given** une modification de l'export PPT, **When** on lance `scripts/test-export-ppt.py` (chemin à confirmer, CLAUDE.md le cite sans préfixe `app/`), **Then** la vérification de géométrie des slides réussit (non exécuté).
- AC1.2.2 — **Given** un deck généré, **When** il est rendu en images (skill `pptx-verify`) et inspecté, **Then** aucun débordement ni collision n'est visible ; la preuve est la revue du rendu, pas la seule géométrie.

### Story 1.3: Traiter les évolutions de design PPT débloquées du TODO

En tant que PO du support de restitution,
je veux traiter les trois évolutions listées « débloqué, à reprendre » dans le TODO,
afin de faire progresser la qualité visuelle du deck.

**Statut : ouvert** (liste lue dans `docs/wiki/todo.md`, section « TODO — débloqué, à reprendre » ; priorité et périmètre à confirmer par le PO)

**Acceptance Criteria [3 critères]:** (source : `docs/wiki/todo.md`)

- AC1.3.1 — **Given** le TODO, **When** on traite « #4 icônes outline par pilier », **Then** les icônes apparaissent sur un rendu réel du deck et `docs/wiki/todo.md` est mis à jour (à confirmer par le PO).
- AC1.3.2 — **Given** le TODO, **When** on traite « #6 cadres `round2DiagRect` sur la couverture » (skill `pptx-framed-image`), **Then** l'image prend la forme exacte du cadre sur un rendu réel (à confirmer par le PO).
- AC1.3.3 — **Given** le TODO, **When** on traite « #7 nouveaux patterns de slide » (`KPI_GRID`, `MATRICE_CONTEXTE_CARDS`, `COMPARAISON_2_OPTIONS`), **Then** chaque pattern retenu est rendu et inspecté ; le choix de ceux à réaliser reste à confirmer par le PO (c'est une idée).
