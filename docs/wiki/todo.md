---
updated: 2026-07-08
confidence: mixed
agents: [onboarder]
---

# TODO

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

### ⚠️ Radar de maturité (slide 3 de chaque bloc) — pas encore prêt

**#3 radar vectoriel** : PNG Puppeteer remplacé par du vectoriel natif
python-pptx. Le feedback du 2026-07-08 est intégré (design aligné sur la
trame du template, en-tête de section, parenthèses retirées **partout** via
`joli_nom()`, réglette de paliers 0-3 au-dessus du cercle, coupures de mots
composés longs corrigées avec un vrai trait d'union). **Mais la slide n'est
pas encore considérée « prête »** : 2 points restent ouverts, à trancher
avant de la considérer terminée —

1. **Radar vs tableau** — non tranché. 3 options rendues réellement
   (PowerPoint COM, mêmes données) : A = radar vectoriel actuel (lecture de
   silhouette globale, mais libellés contraints sur un radar dense) ; B =
   tableau 2 colonnes (delta par objectif, très lisible, perd la silhouette) ;
   C = barres groupées par pilier (même grammaire que la vue d'ensemble, mais
   plus haut). Prototypes B/C pas committés (scratch de session) — à
   régénérer sur demande pour arbitrage visuel.
2. **Contraste GOLD insuffisant** — `D.PALETTE[3]` (`#b8860b`, pilier
   « Agilité à l'échelle ») sur fond blanc : 3.25:1, sous le seuil WCAG AA
   (4.5:1) pour les libellés d'axe du radar (texte normal). Pré-existant,
   partagé avec le radar web (`radar-svg.js`), révélé par la vectorisation
   (le radar a maintenant du vrai texte testable). Décision palette à
   prendre (assombrir ce jaune, ou accepter tel quel) — pas tranchée.

**TODO — à reprendre après ces 2 décisions** :

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

**TODO — à trancher (VSCode1)** :

1. **Trois flottes d'agents se recouvrent** — à réduire à **une flotte
   canonique** :
   - `.claude/agents/` (17 agents custom : orchestrator, developer, reviewer,
     auditor, planner, ux/ui-designer, ppt-designer…) ;
   - `.opencode/agents` (même flotte, pilotée par la CLI externe `opencode`) ;
   - agents **BMAD** (`bmad-agent-*` : Amelia dev, John PM, Winston archi,
     Sally UX, Mary analyste, Paige tech-writer).
   Les trois couvrent les mêmes rôles → risque de lancer deux systèmes
   concurrents sur la même tâche. Décision produit à prendre (pas tranchée
   automatiquement). Une fois choisie : retirer les deux autres, mettre à jour
   la section « Skills & agents » du `CLAUDE.md`.
2. **Committer** le réalignement (install BMAD + config) une fois la flotte
   canonique décidée — actuellement non commité.

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
