---
updated: 2026-07-08
confidence: mixed
agents: [onboarder]
---

# Tests

## Frameworks

Aucun framework de test tiers (pas de Jest/Mocha/Vitest dans les
dépendances). Deux styles d'assertion cohabitent, tous deux natifs et sans
dépendance : le module Node `node:assert/strict` (`test-sessions.js`,
`test-admin-ui.js`) et un helper maison `check()`
(`test-reimport.js`, `test-rappel.js`, `test-normalisation.js`). Le README
décrit désormais correctement cette cohabitation (auparavant sur-généralisée à
`node:assert/strict`). `CONFIRMÉ` — 2026-07-08 · app/package.json (absence de devDependencies), app/README.md:243-256

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
  → node scripts/test-mode.js
  → node scripts/test-admin-ui.js
  → node scripts/test-contraste-radar.js
  → node scripts/test-correcteur.js
```

`CONFIRMÉ` — 2026-07-08 · app/package.json:16, app/README.md:246-252

Chaque script est exécutable individuellement (`node scripts/test-xxx.js`) et
se termine par un code de sortie non nul en cas d'échec
(`process.exit(echecs === 0 ? 0 : 1)` pour les scripts à helper maison).
`CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:163-164

Style constaté par script :

<div class="table-wrap">

| Script | Style | Ce qu'il couvre |
|---|---|---|
| `test-reimport.js` | Helper maison `check(condition, message)`, base SQLite temporaire (`DB_PATH` surchargé vers `os.tmpdir()`) | Ré-import non destructif / remplacement total du référentiel (US1.2/US1.6) |
| `test-rappel.js` | Helper maison `check()` | Rappel des non-répondants (US2.5) |
| `test-normalisation.js` | Helper maison `check()` | Rapprochement tolérant département/équipe (US3.3) |
| `test-sessions.js` | `node:assert/strict` (`assert.match`) | Formatage de libellé de session (`session-utils.js`) |
| `test-admin-ui.js` | `node:assert/strict` (`assert.match` / `assert.doesNotMatch`) sur le **contenu texte brut** des fichiers `admin.html`/`resultats.html` | Présence de certains sélecteurs/scripts, absence de bandeau OCTO résiduel — test de régression sur chaîne, pas d'exécution DOM/navigateur réelle |
| `test-contraste-radar.js` | Helper maison `check()` + formule de luminance/contraste WCAG | Contraste WCAG des couleurs du radar sur les DEUX surfaces (web `resultats.html`/`pilotage.html` + PPT `pptx_deck.py`), palette pilier lue comme **source unique** : libellés d'axe en foncé neutre ≥ 4.5:1 (texte), 6 pastilles pilier ≥ 3:1 (objet graphique), et les 3 palettes identiques. Ajouté 2026-07-21 (constat superviseur `verification-manquante`) |
| `test-correcteur.js` | `node:assert/strict` (asynchrone) | Chargement du dictionnaire ESM `dictionary-fr` via `import()` depuis CommonJS (`correcteur.js`) + corrections conservatrices (majuscules/acronymes/vocabulaire métier préservés). Assertions déterministes, indépendantes des suggestions du dictionnaire. Charge le dico complet → ~6 s |

</div>

`CONFIRMÉ` — 2026-07-08 · app/scripts/test-reimport.js:1-22, test-rappel.js, test-normalisation.js (helper `check()`), test-sessions.js:1-14, test-admin-ui.js:1-13

Chaque script isole ses effets de bord : `test-reimport.js` pointe
`DB_PATH` vers un fichier temporaire unique (`crypto.randomUUID()`) avant de
charger `../src/db`, pour ne jamais toucher la vraie base de développement.
`CONFIRMÉ` — onboarder · 2026-07-07 · app/scripts/test-reimport.js:1-11

## Intégration continue

Un workflow GitHub Actions (`.github/workflows/ci.yml`) exécute `npm install`,
puis `npm run lint` (ESLint), puis `npm test` (Node 22, `working-directory:
app`) à chaque push sur `main` et sur chaque pull request. Il couvre la partie
JS ; l'export PPT (Python + rendu Chrome/PowerPoint) n'est pas testable en CI
et reste vérifié manuellement. `CONFIRMÉ` — 2026-07-08 · .github/workflows/ci.yml

## Cohérence documentation/code

L'ancienne incohérence — le README annonçait des "assertions Node natives
`node:assert/strict`" alors que 3 scripts sur 5 utilisaient un helper `check()`
maison — a été corrigée : le README décrit maintenant la cohabitation des deux
styles. Une harmonisation future vers `node:assert/strict` (voire `node:test`)
reste souhaitable mais non bloquante. `CONFIRMÉ` — 2026-07-08 · app/README.md:243-256

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
- **Aucun test n'exerce les routes HTTP de `server.js`** via de vraies requêtes
  (pas de `supertest`/équivalent observé) — les tests présents couvrent des modules
  internes ciblés (`referentiel.js`, `session-utils.js`, `mode.js`) et les couleurs du
  radar (`test-contraste-radar.js`) plutôt que la surface API complète. (`radar-svg.js`
  et son test `test-radar.js`, retirés le 2026-07-21 avec la rasterisation morte, ne
  figurent plus.) `CONFIRMÉ` — 2026-07-22 · app/package.json (chaîne npm test), absence de dépendance de test HTTP
- **`capture-screenshots.js`** est un outil de développement (captures
  d'écran), pas un test — n'est pas invoqué par `npm test`. `CONFIRMÉ` — onboarder · 2026-07-07 · app/README.md:151, absence dans la chaîne `npm test` (app/package.json:16)
