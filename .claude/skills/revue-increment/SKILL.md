---
name: revue-increment
description: Boucle systématique de revue ET d'amélioration de fin d'incrément (ou de séance). Ne se contente pas de constater : elle applique les correctifs et re-vérifie. Passe en revue le code produit ET la FAÇON de travailler (vérité terrain via git, vérification RÉELLE et pas juste tests verts, cohérence, docs de suivi à jour, capitalisation mémoire), puis exécute les actions d'amélioration (`/code-review --fix`, `/simplify`, edits concrets) et re-vérifie. À lancer avant de considérer un incrément « livré », avant chaque commit de code, ou sur demande de rétrospective. Le hook SessionStart la rappelle à chaque session.
---

# Revue-et-amélioration systématique d'incrément

Une revue qui ne produit que des constats ne vaut rien : l'objectif est un
incrément **amélioré et re-vérifié**, pas une liste de « à faire ». Ce
protocole systématise l'application des leçons dures (les tests verts qui ne
prouvent rien, la roadmap/les docs qui dérivent du code, le travail non
commité) pour ne pas les redécouvrir à chaque fois.

Deux phases, dans l'ordre :

- **Phase A — Revue** (6 passes) : des constats *vérifiés* (un fait, pas « oui
  je pense »), sur deux niveaux — **le produit** (code/écrans corrects et
  cohérents) et **la façon de travailler** (la méthode a-t-elle servi
  l'objectif).
- **Phase B — Améliorations** : chaque constat rouge devient un correctif
  appliqué, puis re-vérifié.

## Coexistence avec BMAD (routage — ne pas refaire ce qu'un skill BMAD fait mieux)

Si le projet a BMAD installé (`_bmad/`, skills `bmad-*`), ce skill reste le
chef d'orchestre « definition of done avant commit » mais **délègue** :

- Revue de code adversariale → **`bmad-code-review`**.
- Rétrospective de fin d'epic → **`bmad-retrospective`**.
- Changement de cap en cours de sprint → **`bmad-correct-course`**.
- Revue humaine guidée d'un gros diff → **`bmad-checkpoint-preview`**.
- Perdu sur quel skill lancer → **`bmad-help`** (routeur BMAD).

`revue-increment` garde la boucle courte et transverse (vérité terrain git,
vérif réelle, docs de suivi, mémoire) et *appelle* ces skills plutôt que d'en
dupliquer la logique.

## Phase A — Revue

### 1. Vérité terrain (avant tout le reste)

- [ ] `git status` + `git log --oneline -10` lus **maintenant** — l'état réel,
      pas ce que la roadmap/les docs racontent (ils dérivent).
- [ ] Le diff de la séance correspond exactement à ce qui était visé — rien
      d'orphelin, rien laissé à moitié, aucun fichier scratch traîné dans le repo.
- [ ] Si un doc de suivi affirme un état, il a été confronté au code, pas
      recopié de confiance.

### 2. Vérification réelle (tests verts ≠ livré)

- [ ] La suite de tests passe, et le compte a **augmenté** si du comportement a
      été ajouté (sinon : pourquoi ?).
- [ ] Toute surface runtime touchée a été **exercée pour de vrai** via le
      chemin de run/vérif propre au projet (lancer l'app + regarder / rendre le
      livrable + l'inspecter / exécuter la CLI), pas seulement testée en
      unitaire — un parseur ou un test tolérant peut mentir. Utiliser `/verify`
      si le projet le fournit.
- [ ] Les cas dégradés sont couverts (entrée vide, dépendance absente, fichier
      corrompu) ou explicitement documentés comme gap connu.

### 3. Cohérence de la matière produite

- [ ] Le code produit ressemble au code autour (style, densité de commentaires,
      nommage, vocabulaire métier à préserver — pas d'anglicisation d'un terme
      établi).
- [ ] Pas de duplication d'un helper existant (chercher avant d'écrire) ; pas de
      sur-ingénierie (abstraction pour un seul appelant).
- [ ] Couplages intentionnels tenus à jour ensemble (si X change, son miroir Y
      suit).
- [ ] Aucun chemin machine-spécifique ni secret dans un fichier versionné.

### 4. Docs de suivi à jour (reflètent la réalité, pas l'intention)

- [ ] Roadmap / statut : items passés à « fait », compteurs recalés.
- [ ] `CLAUDE.md` mis à jour **si** une convention/un pipeline a changé
      matériellement (pas pour un détail).
- [ ] Docs plus profondes : seulement si dans le périmètre — sinon le noter
      comme reste-à-faire plutôt que laisser croire que c'est fait.

### 5. Capitalisation (mémoire)

- [ ] Toute friction, correction de cap, ou approche confirmée → une mémoire
      `feedback` (avec **Pourquoi** + **Comment l'appliquer**).
- [ ] Tout fait projet non dérivable du code/git → mémoire `project`. Dates
      relatives converties en absolu.
- [ ] Rien sauvegardé qui soit déjà dans le repo ou seulement utile à cette
      conversation.

### 6. Revue de la façon de travailler elle-même (le niveau méta)

- [ ] **Angle mort évité ?** Ai-je vérifié avant d'agir (nature réelle d'un
      fichier/projet, dépendance cachée) ? Où ai-je failli agir trop vite ?
- [ ] **Bon niveau d'effort ?** Ni bâclé (vérif réelle sautée), ni sur-investi
      (abstraction/agent lourd pour une tâche simple).
- [ ] **Irréversible confirmé ?** Toute suppression/écrasement de fichier
      versionné, écriture en base réelle, action sortante : explicitement
      demandée ou proposée — jamais exécutée unilatéralement.
- [ ] **Une chose à changer la prochaine fois** — un ajustement concret de
      méthode. S'il est durable → mémoire `feedback`.

## Phase B — Actions d'amélioration (agir, pas seulement constater)

Chaque constat rouge de la Phase A devient une action. Ne pas rendre la main
sur une simple liste de « à faire ».

1. **Trier** les constats :
   - *Correctifs sûrs et cadrés* (bug clair, nettoyage évident, doc à recaler)
     → appliquer maintenant.
   - *Qualité / simplification* → `/code-review high --fix` pour les bugs,
     `/simplify` pour la réutilisation/altitude. Relire leurs changements.
   - *Sensible ou irréversible* → **proposer**, ne pas exécuter unilatéralement.
2. **Appliquer** les correctifs sûrs + les sorties validées des outils.
3. **Re-vérifier pour de vrai** ce qui a été touché (reboucler sur §2) — un
   correctif non re-vérifié n'est pas un correctif.
4. **Capitaliser** : docs de suivi recalées (§4), frictions en mémoire (§5).
5. **Boucler** : si une amélioration fait apparaître un nouveau constat,
   re-trier. Sortir quand il ne reste que des items proposés à l'utilisateur ou
   des gaps explicitement documentés.

## Verdict

Conclure par un bloc court et franc, sans enjoliver :

```text
Revue incrément <n> — <titre>
Produit      : <livré & vérifié réellement | livré mais X non vérifié | partiel>
Améliorations: <ce qui a été appliqué + re-vérifié cette passe>
Suivi        : <roadmap/CLAUDE.md/mémoire à jour | écarts : ...>
Façon de bosser : <ce qui a marché ; l'ajustement retenu>
Reste        : <proposé à l'utilisateur / gaps connus, explicitement listés>
```

Un item rouge de la Phase A non corrigé en Phase B est listé dans « Reste »
(proposé ou documenté) — on ne déclare pas « fait » un incrément avec une vérif
réelle sautée ou un correctif évident non appliqué.
