---
updated: 2026-07-08
confidence: mixed
agents: [onboarder]
---

# Conventions de code

## Linting / formatage

Une configuration **ESLint** (flat config `app/eslint.config.js`) est
versionnée depuis le 2026-07-08 : règles recommandées ESLint (détecte les
vrais problèmes — variables non utilisées/non définies, redéclarations,
assignations mortes…), avec les globals Node (CommonJS) pour `src/`+`scripts/`
et navigateur pour `src/public/`. Lancement via `npm run lint` (dans `app/`),
exécuté aussi en CI. Un `.editorconfig` (racine) fixe l'indentation, les fins
de ligne et l'encodage. Le **formatage pur** (Prettier) n'est volontairement
pas verrouillé — un reformatage global du dépôt serait trop invasif ;
`.editorconfig` + ESLint suffisent pour l'instant. Les conventions ci-dessous
restent en partie **observées dans le code réel** au-delà de ce que le linter
impose. `CONFIRMÉ` — 2026-07-08 · app/eslint.config.js, .editorconfig, app/package.json (script `lint`, devDependencies)

## Nommage

- **Vocabulaire métier français préservé tel quel** dans les identifiants de
  code : tables et colonnes SQL en `snake_case` français (`sous_categories`,
  `ouverture_at`, `fermeture_at`, `est_manager`, `dans_equipe`, `soumis_at`),
  fonctions/variables JS en `camelCase` français (`getReferentiel`,
  `reconcileReferentiel`, `activeQuestionIds`, `agregerResultats`).
  `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/db.js:45-73, app/src/server.js:58-79, 521-581
- **Pas de classes** : tous les modules `src/*.js` exportent des fonctions
  (`module.exports = { ... }`), style purement fonctionnel/procédural, aucune
  hiérarchie d'objets observée. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:302, app/src/normalisation.js:32, app/src/invites.js:89
- **Commentaires en français, orientés "pourquoi" plutôt que "quoi"** :
  systématiquement placés au-dessus d'une fonction ou d'un bloc pour expliquer
  une décision non triviale (ex. pourquoi le mode `remplacer` est transactionnel,
  pourquoi la clé de comparaison ignore les accents). `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/normalisation.js:1-9, app/src/referentiel.js:93-102, 222-227
- **Modules CommonJS** (`"type": "commonjs"` dans `package.json`), `require`/
  `module.exports` partout, malgré un `import()` dynamique ponctuel pour
  charger `dictionary-fr` (module ESM-only). `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:7, app/src/correcteur.js:16-19

## Gestion d'erreurs et validation

- **Validation manuelle en tête de route**, sans librairie de schéma (pas de
  `zod`/`joi`/`ajv` observé) : chaque route vérifie ses champs requis à la
  main et renvoie `res.status(400).json({ error: '...' })` avec un message en
  français explicite. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:192-226, 289-309
- **Transactions SQLite explicites** (`db.exec('BEGIN')` / `COMMIT` /
  `ROLLBACK` dans un `try/catch`) pour les opérations multi-tables sensibles
  (réconciliation du référentiel, remplacement total). `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/referentiel.js:210-253
- **Listes blanches pour les entrées qui construisent du SQL dynamique** (ex.
  `CHAMPS_FUSIONNABLES` pour restreindre les colonnes fusionnables à
  `departement`/`equipe`) plutôt qu'une validation ad hoc — pattern explicite
  de prévention d'injection SQL. `CONFIRMÉ` — onboarder · 2026-07-07 · app/src/server.js:163-176

## Git

- Historique court à ce stade (2 commits observés : commit initial du MVP,
  puis ajout de la documentation technique), messages de commit en français.
  `CONFIRMÉ` — onboarder · 2026-07-07 · git log (voir gitStatus fourni en contexte) : "Initial commit: questionnaire de maturité agile/produit (MVP)", "Ajoute la documentation technique (README racine + app/README.md)"
- Hook `PreToolUse` (`.claude/hooks/guard_destructive_git.py`) bloque `git
  push --force` (sans `--force-with-lease`) et `git reset --hard` — garde-fou
  déterministe, fail-open en cas d'erreur de parsing. `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/settings.json:2-16, CLAUDE.md:87-89

## Secrets et fichiers sensibles

- `.env` (le vrai fichier, pas `.env.example`), `secrets/**` et
  `config/credentials.json` sont explicitement refusés en lecture par
  `.claude/settings.json` (`permissions.deny`). `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/settings.json:17-24
- `data/**/*.db` (bases SQLite par environnement) est gitignoré — ces bases
  ne sont pas des livrables versionnés. `CONFIRMÉ` — onboarder · 2026-07-07 · app/.gitignore:1-2
- `.roadmap/*.svg` est gitignoré (régénéré à la demande), seul
  `.roadmap/roadmap.json` est la source versionnée. `CONFIRMÉ` — onboarder · 2026-07-07 · .gitignore:12-14

## Patterns d'équipe / outillage projet

- **Stack de skills PPT réutilisable** piloté par l'agent `ppt-designer` —
  global : `pptx-deck` (mise en page + garde-fou géométrie), `pptx-verify`
  (rendu réel), `restitution-deck-design` (système de design) ; projet :
  `pptx-framed-image` (image encadrée aux coins presets), `slide-text-polish`
  (qualité rédactionnelle + linter), `restitution-ppt` (deck concret). Regroupé
  en kit portable `export/ppt-toolkit.md` pour réemploi sur d'autres projets.
  `CONFIRMÉ` — 2026-07-08 · .claude/agents/ppt-designer.md, .claude/skills/, ~/.claude/skills/
- **Skill projet dédié** `.claude/skills/restitution-ppt/` pour la génération/
  amélioration du PPT (US6.4), avec invariants de mise en page documentés
  (ex. bord droit "safe" pour ne pas chevaucher le numéro de page du template
  OCTO) découverts par rendu réel plutôt que par la seule vérification de
  géométrie. `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/skills/restitution-ppt/SKILL.md:53-79
- **Vérification par rendu réel plutôt que déclarative** : le skill
  `restitution-ppt` insiste explicitement sur le fait de ne jamais déclarer un
  design "bon" sur la seule base d'une vérification géométrique — il faut
  rendre le `.pptx` via PowerPoint COM et regarder. `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/skills/restitution-ppt/SKILL.md:51, 100
- **Libellés en clair, sans abréviation cryptique** dans les livrables client
  (ex. "écart-type" et non "é-t") — règle explicitement documentée dans le
  skill projet. `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/skills/restitution-ppt/SKILL.md:77-79
