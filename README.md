# Questionnaire de maturité agile/produit

Outil web permettant à un animateur (coach agile, manager) de faire passer à une
équipe un questionnaire de maturité agile/produit (à partir d'une grille
Excel de référence), de consulter les résultats agrégés (radar, dispersion,
comparaison dans le temps) et d'exporter un support de restitution PowerPoint.
Une vue de consolidation multi-équipes ("pilotage") existe pour une lecture au
niveau département.

## Contenu du dépôt

| Dossier | Contenu |
|---|---|
| `app/` | Application Node.js (serveur + pages web) — voir [`app/README.md`](app/README.md) pour tout ce qui est technique (installation, environnements, API, tests). |
| `cadrage/` | Documentation fonctionnelle de cadrage : [personas](cadrage/personas.md), [parcours utilisateur](cadrage/experience-map.md), [difficultés/besoins](cadrage/difficultes-realisation.md), [découpage Epics/US](cadrage/epics-us.md). |
| `reference grille/` | Fichiers Excel sources du référentiel de maturité (grille V3.2 et variante "IA-Agentic-Complet"), à importer dans l'outil (voir `app/README.md`). |
| `template ppt/` | Template PowerPoint OCTO utilisé par l'export de restitution. |
| `docs/` | Wiki technique et fonctionnel consultable — voir [`docs/wiki.html`](docs/wiki.html), la page par défaut pour consulter le projet (métier, stack, architecture, conventions, tests, roadmap). Sources Markdown dans `docs/wiki/`. |
| `.roadmap/` | Source de vérité de la roadmap (`roadmap.json`) — intégrée et tenue à jour dans `docs/wiki.html` (section Roadmap) ; `roadmap.svg` reste régénérable à la demande via le skill `roadmap-keeper` mais n'est plus la voie de consultation par défaut. |

## Démarrage rapide

```bash
cd app
npm install
npm run start:dev
```

Puis ouvrir http://localhost:3000 (page d'accueil animateur). Détails complets
(prérequis, les 3 environnements DEV/PRE-PROD/PROD, import du référentiel,
création d'une session, tests, sauvegarde/restauration) : voir
[`app/README.md`](app/README.md).

## Où trouver quoi

- **Vue d'ensemble consultable par défaut (métier + technique + roadmap) ?** → [`docs/wiki.html`](docs/wiki.html) (ouvrir directement dans un navigateur, aucune dépendance)
- **Pourquoi cet outil, pour qui, quel parcours ?** → `cadrage/`
- **Comment c'est construit, comment l'installer/l'exploiter, quelles routes API ?** → `app/README.md`
- **Où en est le projet, prochaines étapes ?** → [`docs/wiki.html`](docs/wiki.html) (section Roadmap) — source éditable : `.roadmap/roadmap.json`
