# VSCode1

Questionnaire de maturité agile/produit (app web) — un animateur fait passer un
questionnaire à une équipe, consulte les résultats agrégés, et exporte un support
de restitution PowerPoint. Livrable principal : l'export `.pptx` produit depuis
`app/` avec le template `template ppt/`.

## Commandes

```bash
cd app
npm install
npm run start:dev        # http://localhost:3000
npm test                 # suite complète : scripts Node sans framework, ~enchaînés par package.json
node scripts/test-scores.js   # un test unique (chaque script est aussi lançable seul)
npm run lint              # ESLint (flat config)
```

`scripts/test-export-ppt.py` (indépendant de `npm test`) vérifie la génération PPT
côté Python (géométrie des slides). Jamais un deck « vérifié » sans rendu réel
inspecté (skill `pptx-verify`, agent `ppt-designer`) — pratique déjà en place
(voir `docs/wiki/todo.md`), à respecter dès qu'une modif touche l'export PPT.

## Claude Code — configuration du projet

- `.claude/settings.json` (versionné) : garde-fou git destructif, rappel de vérif
  réelle avant commit (adapter `_WATCHED_PREFIXES`/`_VERIF_BASH` dans
  `.claude/hooks/warn_verif_before_commit.py` au canal de CE projet), gate
  orchestrateur, scan supervision en SessionStart, deny rules secrets.
- `.claude/skills/` : orchestrateur (compose et exécute les plans multi-étapes),
  superviseur (diagnostic étage 2), revue-increment (definition of done),
  veille-agentic (état de l'art), audit-technique.
- `.claude/agents/` : les sous-agents porteurs que l'orchestrateur dispatche.
- `.claude/supervision/` + `.claude/orchestration/` : dispositif de supervision.
  Journal des orchestrations : `log_run.py` (`--solde` pour requalifier un run en
  attente). Arbitrages humains : `arbitrages.json`.

Le dispositif vient du hub de supervision : **corriger là-bas puis régénérer
l'export**, jamais localement — les copies locales divergent (leçon P1).

## Règles de travail

- Propose → arbitre → applique : aucun correctif auto-appliqué sans arbitrage humain.
- Jamais `succes` au journal sur un livrable que l'utilisateur doit encore valider.
- Tout chiffre écrit s'appuie sur la commande qui l'a produit.
