---
updated: 2026-07-21
confidence: mixed
agents: [onboarder]
---

# TODO

## Prochaine session — file d'attente (demandé le 2026-07-21)

> Trois chantiers explicitement mis en file par l'utilisateur pour la prochaine
> session. Contexte utile capturé pour un démarrage direct.

1. **Séparer « démo » et « usage réel » via une page d'accueil.** ✅ **Fait le
   2026-07-21** (playbook `dev-verifie`). Séparation retenue (arbitrage utilisateur) :
   **drapeau `est_demo` sur les sessions** (une seule base, pas de bascule de binding
   DB). Nouvelle page d'accueil `index.html` à `/` (2 entrées démo/réel) qui pose un
   cookie `mode` ; le serveur (`estModeDemo` dans `app/src/mode.js`) **filtre le
   listing** et **tague la création** des sessions par mode → garde-fou anti-mélange ;
   bannière « MODE DÉMO » (extension de `env-banner.js`). Rappel : `/` sert désormais
   `index.html` (auparavant `admin.html`). Vérifié : `test-mode.js` (9 cas) + preuve
   API du garde-fou (session démo invisible en réel) + screenshots réels (accueil +
   bannière). Suite (hors incrément) : pré-seed d'un jeu démo riche pour un déploiement
   neuf (la démo démarre vide, se remplit en créant des sessions en mode démo) ;
   enforcement par-`/:id` non fait (le garde-fou reste le filtre du listing + le tag).

2. **Revue de design du RADAR de maturité — sur les DEUX surfaces.** ✅ **Traité le
   2026-07-21** (arbitrage utilisateur sur rendu réel, A/B/C écartées, exploration
   repartie large). Direction : **radar conservé et amélioré**. Sur les deux surfaces
   — web (radar inline dans `app/src/public/resultats.html` et `pilotage.html`) et
   PPT (`_dessiner_radar` dans `app/scripts/export-restitution-ppt.py`) — libellés
   d'axe en **foncé neutre** + **pastille couleur du pilier** sur l'axe (au lieu de
   colorer le texte) : règle le contraste GOLD (voir section radar ci-dessous) et le
   bruit visuel, même motif que la légende. Vérifié au rendu réel (screenshot web +
   PowerPoint COM), garde-fou `app/scripts/test-contraste-radar.js`. **Résidu** :
   rendus web comparaison + pilotage non re-vérifiés (données DEV absentes) ; ellipse
   possible sur un libellé très long en PPT (repli volontaire). Détail :
   [`../../export/points-amelioration-ppt.md`](../../export/points-amelioration-ppt.md).

3. **Lancer `agent-supervisor` pour investiguer les axes d'amélioration.**
   Diagnostic étage 2 sur les données du superviseur (usage, runs d'orchestration
   journalisés cette session, signaux git/mémoire) → propositions concrètes
   (champ `proposition`, arbitrées par l'humain). Cadence/état :
   [`technical/agents-supervision.md`](technical/agents-supervision.md).

## Chantier deck PPT — qualité & fidélité charte

> **Chantier « qualité & fidélité charte du deck PPT »** (ouvert 2026-07-08).
> Objectif : augmenter la qualité de l'export, respecter le template OCTO,
> formes plus travaillées — en restant sur `python-pptx`.

**Décidé** : le `.pptx` OCTO fait foi ; `PptxGenJS` écarté ; couleurs sourcées du
thème du template (= charte OCTO) ; palette par pilier gardée pour les données.

**Fait & vérifié** (détail/preuves dans
[`../../export/points-amelioration-ppt.md`](../../export/points-amelioration-ppt.md)) :

1. **#1 Police de marque** (Outfit) appliquée au contenu dessiné — 0 zone
   Arial au rendu PowerPoint COM (37 avant).
2. **#2 formes charte OCTO + #5 palette** — neutres (navy/slate) + accent cyan
   depuis le thème ; aplats, **jamais d'ombre/gradient**. Vérifié par rendu
   réel avant/après (13 slides). Bug trouvé et corrigé au passage : pistes de
   barres/jauge figées sur l'ancien gris (paramètre par défaut jamais
   réévalué par `appliquer_theme()`).

### ✅ Radar de maturité (slide 3 de chaque bloc) — décisions tranchées (2026-07-21)

**#3 radar vectoriel** : PNG Puppeteer remplacé par du vectoriel natif
python-pptx (design aligné sur la trame du template, en-tête de section,
parenthèses retirées **partout** via `joli_nom()`, réglette de paliers 0-3,
césures propres). Les **2 décisions qui restaient ouvertes sont tranchées le
2026-07-21** (arbitrage utilisateur sur rendu réel des deux surfaces) —

1. **Radar vs tableau** → **radar conservé et amélioré** (A/B/C écartées,
   exploration repartie large). Sur les DEUX surfaces (web
   `resultats.html`/`pilotage.html`, PPT `_dessiner_radar`) : libellés d'axe en
   **foncé neutre** + **pastille couleur du pilier** sur l'axe (au lieu de
   colorer le texte), même motif que la légende.
2. **Contraste GOLD** → **résolu** : la couleur du pilier ne colore plus le
   texte mais la **pastille** (objet graphique, seuil WCAG 3:1, gold à 3.25:1
   OK) ; les libellés passent en foncé neutre (texte, ~15:1). Codifié par
   `app/scripts/test-contraste-radar.js` (vérifie aussi que les 3 palettes —
   `resultats.html`, `pilotage.html`, `pptx_deck.py` — restent identiques).

Vérifié au rendu réel (screenshot web + PowerPoint COM). **Résidu** : rendus web
comparaison + pilotage non re-vérifiés (données DEV absentes) ; ellipse possible
sur un libellé très long en PPT (repli volontaire, jamais de coupure silencieuse).

**TODO — débloqué, à reprendre** :

1. **#4 icônes outline** par pilier.
2. **#6 cadres `round2DiagRect`** sur la couverture (skill `pptx-framed-image`).
3. **#7 nouveaux patterns de slide** (idée) — `KPI_GRID`, `MATRICE_CONTEXTE_CARDS`, `COMPARAISON_2_OPTIONS`.

**Méthode** : toujours vérifier par **rendu réel** (avant/après), jamais sur la
seule géométrie.

## Dispositif Claude Code (agents / skills / config) — réalignement post-BMAD

> Ouvert 2026-07-16, après l'install de **BMAD-METHOD v6.10.0** sur tous les
> projets VSCode et un audit config/skills/agents transverse. Rubrique de suivi
> centrale (certaines actions concernent des dépôts frères, étiquetées comme
> telles).

**Fait & vérifié** (ce projet, VSCode1) :

- BMAD installé (`_bmad/`, 46 skills `bmad-*` → `.claude/skills/`).
- `_bmad-output/` ajouté au `.gitignore` (sorties générées, pas du contenu).
- Hook `guard_destructive_git.py` **durci et unifié** sur les 4 projets :
  fusion du parsing `shlex` (gère `VAR=value git push --force`, trou réel des
  anciennes versions regex) + schéma de sortie correct
  (`hookSpecificOutput.permissionDecision`). Pipe-testé sur 6 cas.
- Hook `SessionStart` (`remind_revue_increment.py`) + skill `revue-increment`
  posés et rendus **BMAD-aware** (délèguent à `bmad-code-review` /
  `bmad-retrospective`, routent vers `bmad-help`).
- Section « Skills & agents — comment ça se lance » ajoutée au `CLAUDE.md`.

**Tranché & fait (VSCode1, 2026-07-21)** — la flotte de rôles canonique est
`.claude/agents/`, piloté par `agent-orchestrator` :

1. **Flotte canonique = `.claude/agents/`** + gate `orchestrator_gate.py`
   **branché** en `UserPromptSubmit`. `.opencode/agents/` (16 def. doublon,
   CLI externe `opencode`) **supprimé** ; `.opencode/skills/` (137 fichiers)
   **conservé** car c'est la bibliothèque de protocoles chargée par les 16
   agents `.claude/agents/` (`skills:` → `.opencode/skills/…`), donc pas
   redondante. **BMAD conservé** non comme fleet de rôles concurrente mais
   pour son cycle produit (prd/architecture/story) ; ses personas `bmad-agent-*`
   restent, arbitrage assumé. Section « Skills & agents » du `CLAUDE.md` à jour.
2. **Réalignement commité** : install BMAD (`_bmad/` + skills `bmad-*`), gate
   branché, `.opencode/agents/` retiré — voir `git log` du 2026-07-21.

*Recouvrement résiduel assumé* : `.claude/agents/` (developer/reviewer/…) et
les personas BMAD couvrent des rôles voisins, mais servent des usages distincts
(dev orchestré vs cadrage produit) — coexistence choisie, pas une dette à solder.

**TODO — dépôts frères (rappel, à traiter dans leur repo)** :

- **VSCode** : gros diff BMAD non commité (réinstall par-dessus un BMAD déjà
  committé le 2026-06-08) + 1 fichier déjà tracké dans `_bmad-output/`
  (`git rm --cached`, le `.gitignore` n'agit que sur le futur).
- **VSCode2** : `external/openhub_clone/` supprimé (staged) — à committer.

## Optimisation tokens

Chantier parallèle (détail dans
[`../../export/optimisation-tokens.md`](../../export/optimisation-tokens.md)) :
mesure réelle faite (`rtk gain --history` : 20,4 % d'économie globale sur 1226
commandes, poste dominant `rtk read`) ; prototype `render_diff.py` (filtre
pixel avant eye-check PPT, skill `pptx-verify`) livré et testé (9 tests
unitaires + 6 fonctionnels). Restent à explorer : POC `params.json` + aperçu
non-LLM, coût réel des sous-agents inline vs délégué.

*Snapshot établi en cours de session — un agent `ppt-designer` peut être en
train de faire avancer ces points : recroiser avec
`export/points-amelioration-ppt.md` avant de le tenir pour définitif.*
