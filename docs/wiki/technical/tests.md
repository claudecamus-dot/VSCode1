---
updated: 2026-07-07
confidence: mixed
agents: [onboarder]
---

# Tests

## Frameworks

Aucun framework de test tiers (pas de Jest/Mocha/Vitest dans les
dépendances) : les tests JS s'appuient sur le module natif Node
`node:assert/strict`, mais **de façon inégale** — voir "Incohérence
documentation/code" ci-dessous. `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json (absence de devDependencies), app/README.md:244-245

Côté PPT, `scripts/test-export-ppt.py` est un script Python indépendant, sans
framework non plus (assertions manuelles + vérification de géométrie).
`CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:255-256, .claude/skills/restitution-ppt/SKILL.md:16, 50

## Organisation

```
npm test
  → node scripts/test-reimport.js
  → node scripts/test-rappel.js
  → node scripts/test-normalisation.js
  → node scripts/test-sessions.js
  → node scripts/test-admin-ui.js
```

`CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json:16, app/README.md:246-252

Chaque script est exécutable individuellement (`node scripts/test-xxx.js`) et
se termine par un code de sortie non nul en cas d'échec
(`process.exit(echecs === 0 ? 0 : 1)` pour les scripts à helper maison).
`CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:163-164

Style constaté par script :

<div class="table-wrap">

| Script | Style | Ce qu'il couvre |
|---|---|---|
| `test-reimport.js` | Helper maison `check(condition, message)`, base SQLite temporaire (`DB_PATH` surchargé vers `os.tmpdir()`) | Ré-import non destructif / remplacement total du référentiel (US1.2/US1.6) |
| `test-rappel.js` | Non relu en détail lors de l'exploration ; absent des résultats de recherche `assert` | Rappel des non-répondants (US2.5), à confirmer |
| `test-normalisation.js` | Idem — absent des résultats `assert` | Rapprochement tolérant département/équipe (US3.3) |
| `test-sessions.js` | `node:assert/strict` (`assert.match`) | Formatage de libellé de session (`session-utils.js`) |
| `test-admin-ui.js` | `node:assert/strict` (`assert.match` / `assert.doesNotMatch`) sur le **contenu texte brut** des fichiers `admin.html`/`resultats.html` | Présence de certains sélecteurs/scripts, absence de bandeau OCTO résiduel — test de régression sur chaîne, pas d'exécution DOM/navigateur réelle |

</div>

`CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:1-22, app/scripts/test-sessions.js:1-14, app/scripts/test-admin-ui.js:1-13 ; `DÉDUIT` pour test-rappel.js/test-normalisation.js (non lus intégralement, mais absents des fichiers matchant "assert" lors d'une recherche sur app/scripts)

Chaque script isole ses effets de bord : `test-reimport.js` pointe
`DB_PATH` vers un fichier temporaire unique (`crypto.randomUUID()`) avant de
charger `../src/db`, pour ne jamais toucher la vraie base de développement.
`CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:1-11

## Incohérence documentation/code

Le `app/README.md` décrit `npm test` comme enchaînant des "assertions Node
natives `node:assert/strict`", mais **seuls 2 des 5 scripts** (`test-sessions.js`,
`test-admin-ui.js`) utilisent réellement `assert` ; les 3 autres s'appuient
sur un helper `check()` maison qui logge `ok`/`FAIL` sans lever d'exception —
un `console.error` seul, avec compteur d'échecs et code de sortie final.
Fonctionnellement équivalent pour l'usage `npm test`, mais la documentation
sur-généralise le style réel des tests. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:244-245 vs recherche du motif `assert` dans app/scripts (2 fichiers sur 5)

## Seuil de couverture

Aucun seuil de couverture de code n'est défini ni mesuré (pas d'outil de
coverage — `c8`, `istanbul` — dans les dépendances). `CONFIRMÉ` — onboarder · 2026-07-07 · app/package.json (absence de devDependencies)

## Philosophie

- **Tests d'intégration fonctionnels plutôt qu'unitaires isolés** : les
  scripts font tourner de vrais modules contre une vraie base SQLite
  temporaire (pas de mock de la couche DB), ce qui teste le comportement réel
  de bout en bout d'un scénario métier (ex. ré-import préservant les
  réponses). `DÉDUIT` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:1-27
- **Tests de régression sur contenu HTML brut** (`test-admin-ui.js`) plutôt
  que tests d'interface pilotés par un vrai navigateur — détecte une
  régression de texte/sélecteur mais ne valide pas le comportement JS
  interactif réel des pages. `CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-admin-ui.js:1-13
- **Vérification visuelle humaine obligatoire pour le PPT** : le skill
  `restitution-ppt` est explicite — la vérification géométrique automatisée
  (`test-export-ppt.py`) ne suffit pas à déclarer un design correct, un rendu
  réel via PowerPoint COM et une relecture à l'œil sont requis. `CONFIRMÉ` — onboarder · 2026-07-07 · .claude/skills/restitution-ppt/SKILL.md:51, 100
- **Aucun test n'exerce `radar-svg.js` directement**, ni les routes HTTP de
  `server.js` via de vraies requêtes (pas de `supertest`/équivalent observé) —
  les tests présents couvrent des modules internes ciblés
  (`referentiel.js`, `session-utils.js`) plutôt que la surface API complète.
  `CONFIRMÉ` — onboarder · 2026-07-07 · absence de dépendance de test HTTP dans app/package.json, absence de fichier `test-radar*`/`test-server*` dans app/scripts
- **`capture-screenshots.js`** est un outil de développement (captures
  d'écran), pas un test — n'est pas invoqué par `npm test`. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:151, absence dans la chaîne `npm test` (app/package.json:16)
