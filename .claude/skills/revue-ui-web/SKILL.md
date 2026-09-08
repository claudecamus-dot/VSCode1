---
name: revue-ui-web
description: >
  Revue design/accessibilite scoree des pages HTML servies par VSCode1
  (Express, HTML server-rendu sous app/src/public/). Produit un rapport
  (constats + score juge, jamais une modification automatique). Use when:
  avant de livrer un ecran nouveau ou modifie sous app/src/public/, sur
  demande "revue design", "audit accessibilite", ou comme volet UI de
  revue-increment quand le changement touche une page HTML.
---

# revue-ui-web — revue design/accessibilite (VSCode1)

Installee le 2026-09-08 sur arbitrage utilisateur (« lance les actions pour les 2
trouvailles de veille », hub de supervision VScode5 — trouvaille de veille
`educlopez/ui-craft` du 2026-09-07). Redigee par le porteur `bmad-recherche` du hub
(skill `bmad-deep-recon`, type technical), relue par l'orchestrateur avant greffe.
Essai encadre : un premier passage reel sur `resultats.html` avant d'etendre la revue
aux 6 pages.

## Attribution (licence MIT)

Contenu adapte de **educlopez/ui-craft** (https://github.com/educlopez/ui-craft,
licence MIT, Eduardo Calvo 2026). MIT n'impose que la conservation de la notice
de copyright et de la licence dans les copies substantielles — cette ligne EST
cette notice pour ce fichier et ses references/. Ce qui est repris : la
structure de methode (heuristiques Nielsen scorees, 6 lois de design, checklist
a11y, 43 regles anti-slop) et le format de rapport (Craft Report). Ce qui N'EST
PAS repris : le serveur MCP (`ui-craft-mcp`, npm), le detecteur
`scripts/detect.mjs` (script Node a executer), les 25 commandes slash et les 24
skills de *build*. Meme contenu de reference que la greffe VSCode2 (les 43
regles sont identiques, aucune n'est specifique a un framework) — le contenu
adapte au canal est concentre dans ce SKILL.md et dans les notes "Ici" des
references, pas duplique en substance.

## Ce que ce skill n'est PAS

- Pas d'installation MCP, pas de `npx ui-craft-mcp`, pas de `node
  scripts/detect.mjs` — zero execution de code tiers telecharge.
- Pas de score deterministe : le score produit ici est **juge par le modele**
  (`UsabilityScore (judged)`), pas le scanner Node de ui-craft.
- Ne modifie JAMAIS un fichier HTML. Produit un rapport ; l'application d'un
  correctif est une decision separee, arbitree par l'utilisateur (R4).

## Etat reel du projet au moment de l'ecriture (verifie, pas suppose)

- 6 pages HTML sous `app/src/public/` : `index.html`, `admin.html`,
  `pilotage.html`, `repondre.html`, `resultats.html`, `maquette-question.html`
  (compte reel : `Glob`, 2026-09-08).
- **Pas de fichier CSS partage** : `Glob app/src/public/**/*.css` -> aucun
  resultat. Chaque page porte son propre bloc `<style>` (verifie sur
  `resultats.html` : `:root { --brand-primary: #0b5ea8; ... }` declare EN
  LOCAL a la page). Consequence directe pour ce skill : pas de "source de
  verite CSS unique" a auditer une fois pour toutes comme sur VSCode2 — la
  revue doit rejouer la coherence des tokens **page par page**, et signaler
  toute divergence entre pages (ex. `--brand-primary` redefini differemment
  d'une page a l'autre serait un defaut de coherence, a verifier — non
  confirme, seule `resultats.html` a ete lue en detail).
- Aucune skill ni agent de revue design/accessibilite existant pour les pages
  servies avant celle-ci. `.claude/skills/deck-design-review` existe mais audite
  le **deck PPTX exporte**, pas les pages web (meme constat que VSCode2).
  `.claude/agents/` a `ui-designer.md` et `ux-designer.md` (origine OpenCode,
  adaptes) : ce sont des agents de **specification en amont** ("ne code jamais",
  "ne valide pas elle-meme sa spec") — ils ne lisent/scorent pas un rendu HTML
  existant, et n'ont ni checklist anti-slop ni notion de score. Complementaires,
  pas redondants : `revue-ui-web` audite ce qui EST livre, `ui-designer`/
  `ux-designer` cadrent ce qui va etre construit.
- **Constat PROUVE par execution le 2026-09-08** (premier passage de cette skill) :
  les accordeons de `resultats.html` sont inatteignables au clavier. Trois
  implementations distinctes partagent le defaut — `attacherRepli` (lignes 284-291,
  un seul `addEventListener('click')`, aucun `keydown`), le handler de
  `.pilier-entete` (lignes 822-826) et celui de `.lien-detail` (lignes 831-833).
  Mesure : un balayage de 40 `Tab` depuis `<body>` ne s'arrete jamais sur ces
  elements (il ne visite que 6 controles reels), `focus()` programmatique est
  refuse faute de `tabindex`, et `Enter` ne change pas l'etat du repli. Mitigation
  partielle reelle : le bouton « Tout deplier » (ligne 141) EST accessible, donc
  le contenu reste atteignable — mais sans controle section par section.
  Correction a faire en une passe commune (les 3 handlers se factorisent) :
  `<button>` natif ou `role=button` + `tabindex=0` + `keydown` Enter/Espace, plus
  `aria-expanded`/`aria-controls`. Non applique : R4, la correction est un run
  distinct a arbitrer.
- `.points-attention h3` (`resultats.html` ligne 43) et `.points-forts h3`
  (ligne 53) sont en `text-transform: uppercase` a `font-size: 0.9rem` (~14.4px)
  — AU-DESSUS du seuil de 13px que la regle 5 (`uppercase-heading`) tolere
  pour les petits labels. Candidat de constat anti-slop reel, a confirmer au
  rendu (le tracking/contexte visuel compte aussi). A l'inverse,
  `.synthese .stat .libelle` (ligne 34, 0.75rem = 12px, avec `letter-spacing`)
  est un cas ou la regle NE s'applique PAS (sous le seuil) — bon exemple pour
  eviter un faux positif automatique.

## Processus (une revue, jamais une correction automatique)

1. **Cadrer le perimetre** — une page, ou l'app entiere (6 pages seulement,
   une revue complete reste bon marche ici contrairement a VSCode2).
2. **Voir le rendu reel** — `npm run start:dev` (http://localhost:3000,
   commande deja documentee dans `CLAUDE.md`). **Une capture EST possible dans ce
   depot** : `puppeteer-core` est dans les devDependencies de `app/` et Chrome est
   installe sur le poste (`C:/Program Files/Google/Chrome/Application/chrome.exe`) —
   voir `scripts/capture-screenshots.js`. Capturer la page en pleine hauteur plutot
   que juger sur le code : c'est ce qui a confirme, au premier passage du
   2026-09-08, les majuscules a 14,4px que la lecture CSS seule laissait en doute.
   Une page vide ne prouve rien : la base de dev (`app/data/dev/app.db`) doit etre
   peuplee — `scripts/seed-demo.js` si besoin, ou reutiliser une session existante.
   A defaut de capture, le dire explicitement dans le rapport.
   Arreter le serveur a la fin par l'ARBRE de processus
   (`taskkill //PID <pid> //F //T`) : un `kill` simple laisse le vrai serveur
   orphelin derriere le shim npm.
3. **Anti-slop** — passer `references/anti-slop-43.md` sur la page ET son
   bloc `<style>` local (pas de CSS partage a auditer une seule fois : chaque
   page se revoit integralement).
4. **Accessibilite** — passer `references/accessibilite.md`. Le clavier se
   **teste par execution, jamais par lecture** : piloter la page (Puppeteer,
   cf. etape 2) pour balayer une trentaine de `Tab` depuis `<body>` et relever
   les elements reellement atteints, puis tenter `focus()` et `Enter` sur les
   zones cliquables suspectes. Un `grep` sur `tabindex|role=` dit ce qui est
   ecrit ; seul le balayage dit ce que le navigateur fait — c'est ce qui a
   tranche le cas `attacherRepli` en quelques lignes la ou la lecture de
   fonction laissait un doute.
5. **Heuristiques** — noter avec `references/heuristiques-nielsen.md`,
   produire le `UsabilityScore (judged)`.
6. **Rapport** — format Craft Report (Verifie / Passe / Recommande / Verdict).
   Chaque constat cite `fichier:ligne`.

## References (fichiers de ce dossier) et sous-agents

- `references/anti-slop-43.md` — les 43 regles (contenu identique a la greffe
  VSCode2, meme source), annotees pour l'absence de CSS partage.
- `references/accessibilite.md` — checklist clavier/APCA/ARIA.
- `references/heuristiques-nielsen.md` — Nielsen 10 + 6 lois de design.
- `.claude/agents/design-reviewer.md` et `.claude/agents/a11y-auditor.md` — deux
  sous-agents read-only (Read/Grep/Glob), adaptes des agents ui-craft du meme
  nom. Ils vivent dans `.claude/agents/` parce que c'est la seule arborescence
  que l'outil `Agent` charge ; a lancer en parallele, leurs angles sont disjoints.
