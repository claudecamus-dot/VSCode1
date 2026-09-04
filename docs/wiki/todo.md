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
   bannière). **Pré-seed démo fait le 2026-07-22** : `app/scripts/seed-demo.js`
   (`npm run seed:demo`) purge et régénère un jeu fictif riche (département + 3 équipes
   aux profils distincts, 2 sessions pour la comparaison, dispersion intra-équipe),
   `est_demo=1`, sans toucher au réel — vérifié API + rendu réel. Reste (hors incrément) :
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

3. **Lancer `agent-supervisor` pour investiguer les axes d'amélioration.** ✅ **Fait,
   dernier passage le 2026-07-28** : 4 constats, les 4 arbitrés et appliqués le jour même
   — (1)+(2) la trace de vérif ET de definition-of-done passe sur l'artefact obligatoire
   (le commit) via un 2ᵉ signal de `warn_verif_before_commit.py`, après 5 jours sans run
   journalisé ; (3) les 11 agents jamais invoqués reçoivent un **déclencheur de routage**
   dans le catalogue + 3 étapes déléguées réelles dans `dev-verifie` (`qa-engineer`,
   `reviewer`, `auditor`) ; (4) `revue-design-parallele` (jamais joué) absorbé comme
   variante fan-out d'`export-ppt-verifie`, playbook autonome retiré. Prochaine échéance
   posée : **2026-08-16** — revue groupée BMAD (46 skills à 0 usage) et re-mesure des
   agents de la flotte. Cadence/état :
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
parenthèses retirées **partout** via `joli_nom()`, césures propres ; la
réglette de paliers 0-3 initialement ajoutée a été **retirée le 2026-07-22**,
arbitrage utilisateur — l'espace est rendu au cercle). Les **2 décisions qui
restaient ouvertes sont tranchées le 2026-07-21** (arbitrage utilisateur sur
rendu réel des deux surfaces) —

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

**Finition 2026-07-22 (commit 561b956)** — suite de la revue déléguée (ppt-designer).
Quatre constats résiduels traités et vérifiés au rendu réel : réglette radar retirée
(#3, ci-dessus) ; widget d'amplitude unifié avec pastille « consensus » quand
l'écart-type est nul (#5) ; cartes des slides « points » sans « moy. » recentrées sur
leur contenu (#7) ; jauge « vue d'ensemble » sans comparaison resserrée (#8). **La revue
design du deck est close côté code** (constats #1-#8 traités) ; reste hors code :
coquilles du référentiel (« Existe-il », « sont organisé ») côté grille Excel source.
Détail : [`../../export/points-amelioration-ppt.md`](../../export/points-amelioration-ppt.md).

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

## Durcissement de l'app — les 2 decisions du 2026-09-01 sont tranchees et livrees (2026-09-04)

L'increment « robustesse » (transactions, fenetre de saisie, unicite d'email,
confidentialite de la consolidation, correcteur en worker) est livre et couvert
par 6 nouvelles suites de tests. Deux sujets en etaient sortis non traites (decisions
de conception instruites par une table ronde le 2026-09-01) ; **l'utilisateur a
arbitre le 2026-09-04** et les deux sont implementes :

1. **L'impasse du 409 sur l'email** — Un email ne peut s'identifier qu'une fois par
   session — necessaire (sinon la personne comptait double dans les moyennes),
   mais sans porte de sortie : le front garde l'identifiant du repondant dans le
   `localStorage` du navigateur et **aucune route ne permettait de liberer ou de
   retrouver un repondant**. Contrainte tenue : le lien de session est diffuse a
   toute l'equipe, donc rendre l'acces sur simple connaissance d'un email
   laisserait lire et reecrire le questionnaire d'un collegue — confirme en code
   (`GET /api/repondants/:id` est en liste blanche non authentifiee, `auth.js:49` :
   l'identifiant EST DEJA le jeton porteur complet, en lecture et ecriture).
   **Arbitrage : mitigation minimale, lien bookmarkable** plutot que le renvoi par
   email (qui aurait exige une dependance mail/SMTP absente du projet). L'id
   repondant est desormais aussi porte dans l'URL (`?rid=`, pose par
   `history.replaceState` des l'identification) avec un bandeau « Ce lien est
   personnel » + bouton « Copier mon lien » (`app/src/public/repondre.html`).
   Durci en revue (`bmad-code-review`, 2026-09-04) : `chargerRepondant()` verifie
   desormais que le repondant charge appartient bien a la session de l'URL avant
   de l'afficher — un lien perime ou un `rid` etranger colle sur une autre session
   retombe sur le formulaire au lieu de charger silencieusement les reponses d'un
   tiers sous le mauvais referentiel. **Residu assume** : ne couvre pas le cas
   « nouvel appareil sans le lien note » — seulement le cas « appareil different
   mais lien conserve/partage a soi-meme ». Verifie au rendu reel, script
   reproductible et versionne : `app/scripts/verify-lien-repondant.js` (bandeau,
   `?rid=` pose, recuperation SANS localStorage prealable, rid etranger rejete —
   captures dans `cadrage/captures/lien-repondant/`).

2. **La fenetre destructive de l'import « remplacer »** — Depuis le passage du
   correcteur orthographique dans un worker, le serveur repond pendant les ~qq s
   de correction ; puis `remplacerTout` (`app/src/referentiel.js`) purge
   `commentaires`, `reponses`, `session_questions`, `invites`, `repondants`,
   `sessions` et le referentiel. Une soumission arrivee dans cette fenetre etait
   acceptee (200) **puis effacee sans aucune trace**.
   **Arbitrage : verrou fail-closed** pendant la fenetre — `estImportRemplacerEnCours()`
   (`app/src/referentiel.js`) fait repondre 503 « reessayez » aux trois routes
   mutantes du repondant (identification, `PUT .../reponses`, `POST .../soumission`)
   tant qu'un import `mode=remplacer` est en cours. Durci en revue
   (`bmad-code-review`, 2026-09-04) : c'est un **compteur**, pas un booleen — un
   import `mode=conserver` qui se termine PENDANT que le `remplacer` tourne encore
   ne releve plus le verrou a sa place (bug trouve par la 2e vague de revue avant
   commit, jamais expose en prod) ; ca couvre aussi, sans cout supplementaire,
   plusieurs imports `remplacer` concurrents — le verrou tient jusqu'au dernier a
   se terminer. **Residu assume, hors mandat** : pas de garde architecturale
   generique (middleware type CSRF) pour les futures routes d'ecriture repondant —
   les 3 routes actuelles de `ROUTES_REPONDANT` (`auth.js`) sont couvertes
   explicitement, une nouvelle route mutante devra penser a s'y ajouter. Verifie
   par un test dedie qui reproduit la fenetre reelle ET la course conserver/remplacer
   (`app/scripts/test-fenetre-import.js` : 503 pendant, 200 et verrou releve apres,
   verrou tenu par le remplacer malgre un conserver concurrent termine avant lui).

**Mineurs differes de la meme revue** (aucun n'est atteignable par l'IHM
aujourd'hui) : `scripts/backup-db.js` ouvre toujours la base sans `timeout`
(seul le cote application a ete repare) ; l'echec de creation de l'index
d'unicite n'est signale qu'au demarrage et n'est observable par aucune route ;
`dateValide` accepte du non-ISO que `new Date()` sait lire, alors que les
comparaisons SQL sont lexicographiques ; le worker du correcteur n'a pas de
delai de garde (un worker silencieux laisserait l'import pendu) ; un pilier sans
question active rend 200 sur une sauvegarde qui n'ecrit rien.
