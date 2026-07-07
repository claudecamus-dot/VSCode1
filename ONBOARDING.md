# Onboarding

Ce dépôt dispose d'un wiki documentaire vivant, tagué par niveau de confiance
(`CONFIRMÉ` / `DÉDUIT` / `INCERTAIN`), maintenu au fil des explorations et
enrichissements successifs :

- **Sources Markdown** : [`docs/wiki/`](docs/wiki/index.md)
  - [`index.md`](docs/wiki/index.md) — vue d'ensemble, god nodes, points critiques, zones d'ombre, roadmap, agents recommandés
  - [`business/index.md`](docs/wiki/business/index.md) — domaine métier, personas, parcours
  - [`technical/stack.md`](docs/wiki/technical/stack.md) — dépendances, variables d'environnement
  - [`technical/architecture.md`](docs/wiki/technical/architecture.md) — structure, modèle de données, décisions, fragilités
  - [`technical/conventions.md`](docs/wiki/technical/conventions.md) — nommage, git, secrets, patterns d'équipe
  - [`technical/tests.md`](docs/wiki/technical/tests.md) — organisation des tests, philosophie
- **Rendu HTML autonome** (thème clair/sombre, zéro dépendance) : [`docs/wiki.html`](docs/wiki.html) — à ouvrir directement dans un navigateur (`file://`).

Pour le contexte fonctionnel de premier niveau, voir aussi
[`README.md`](README.md) et [`cadrage/`](cadrage/) ; pour le détail technique
exhaustif (API, environnements, export PPT), voir [`app/README.md`](app/README.md).
