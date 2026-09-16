# Playbook `dev-verifie` — implémentation vérifiée de bout en bout

Le workflow de dev quotidien du projet, rendu structurel : implémenter, tester, **vérifier
en réel** (pas seulement des tests verts — mémoire `feedback_verifier_avec_outils_projet.md`
et discipline `revue-increment`), puis boucle de definition-of-done avant tout commit.
Précédent : c'est la pratique effective de tous les incréments livrés du projet (statut
`eprouve`) — même si la skill `revue-increment` elle-même n'a, à ce jour, jamais été
invoquée *en tant que skill* (constat réel du premier scan superviseur, 2026-07-21) :
la discipline existe dans la pratique, pas encore comme étape outillée systématique.

Les étapes de vérification réelle sont **conditionnelles au type de fichiers touchés**
(table des vérifications obligatoires de la skill) : ne garder à l'instanciation que
celles dont la condition s'applique, ne jamais retirer les tests (`npm test`) ni
`revue-increment`.

Frontière avec `export-ppt-verifie` : un changement de code qui *touche* l'export PPT au
passage reste ici (l'étape `verification-pptx` couvre) ; quand le **livrable est le deck
lui-même** (layout, contenu, visuel), préférer `export-ppt-verifie` qui déroule la chaîne
PPT complète (cadres photo, polish, passe design).

**Délégations réelles (ajout du 2026-07-28, constat #3 du superviseur).** Le diagnostic a
mesuré 11 agents de la flotte canonique à 0 invocation alors que leurs cas d'usage exacts
se produisaient — audit, refactor, écriture de tests — tous absorbés par la session
principale (31 lignes d'`agents` dans `routing-hints.json`). Trois étapes conditionnelles
ci-dessous **portent désormais un agent nommé** au lieu de « session principale » :
`qa-engineer` (règles R1/R2), `reviewer` (règle R3), `auditor` (passe risque). Elles sont
conditionnelles, pas rituelles : la condition ne matche pas → l'étape saute ; la condition
matche mais on garde la main → l'écrire dans le `notes` du run
(`"resolution: inline <agent> — <raison>"`), jamais en silence. Déclencheurs par agent :
tableau « Flotte projet » du catalogue.

**Cadrage lourd obligatoire (arbitrage utilisateur 2026-09-16, propage depuis le hub)**
: `bmad-product-brief`, `bmad-architecture`, `bmad-create-epics-and-stories` et
`bmad-sprint-planning` sont des etapes **bloquantes** de la phase de cadrage, avant
`implementation` -- voir leurs contrats ci-dessous (etapes `cadrage-brief`,
`cadrage-architecture`, `cadrage-epics`, `gate-cadrage`). Deux risques reels, a ne pas
laisser produire un blocage silencieux :
- `bmad-create-epics-and-stories` exige `PRD.md` + `Architecture.md`. Ce playbook ne
  produit pas de PRD complet (`cadrage-brief` rend un brief, pas un PRD) -- si `PRD.md`
  manque a l'etape `cadrage-epics`, le contrat de cette etape impose un FAIL immediat vers
  l'utilisateur (proposer `bmad-prd`), jamais une invention silencieuse du document.
- L'architecture << step-file >> de ces skills s'arrete sur des menus interactifs a chaque
  etape (constate le 2026-09-16 au hub : `bmad-code-review` a bloque un sous-agent pour la
  meme raison, et `bmad-method install` s'est revele etre un TUI qui rend `exit 0` sans
  rien ecrire hors d'un vrai terminal). Ces quatre etapes s'executent donc en **session
  principale**, jamais deleguees a un sous-agent sans TTY : un sous-agent qui heurte un
  menu interactif porte `etat: echec`, jamais un silence pris pour un succes.

```json
{
  "nom": "dev-verifie",
  "description": "Implémentation d'une feature/correction dans app/ avec tests, vérification réelle adaptée aux fichiers touchés, et revue-increment avant commit.",
  "statut": "eprouve",
  "source": "manuel",
  "declencheurs": [
    "implémente/corrige/ajoute une fonctionnalité dans app/",
    "changement de page HTML, CSS ou JS dans app/src/public/",
    "changement de l'export PPT (app/scripts/pptx_deck.py, export-restitution-ppt.py, build-synthese-ppt.py)",
    "fin d'incrément, préparation d'un commit de code produit"
  ],
  "etapes": [
    {
      "id": "cadrage",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "fichiers concernés lus, appelants des fonctions/champs partagés grep-és avant modification"
      },
      "checkpoint": false
    },
    {
      "id": "cadrage-brief",
      "agent": "skill bmad-product-brief",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "regime": "propose (la skill ECRIT un fichier reel) : annoncer l'etape et attendre le feu vert avant de la lancer, § 2 quinquies de agent-orchestrator",
        "critere": "brief produit (probleme, utilisateurs, contraintes) et relu par l'utilisateur avant de passer a `cadrage-architecture` ; exécuté en SESSION PRINCIPALE, jamais délégué à un sous-agent sans TTY (menus interactifs — voir note ci-dessus) — un blocage sur un menu est `etat: echec`, jamais un silence pris pour un succès"
      },
      "checkpoint": "annonce + feu vert avant lancement (écrit un fichier réel)"
    },
    {
      "id": "cadrage-architecture",
      "agent": "skill bmad-architecture",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "regime": "propose (ecrit Architecture.md) : annoncer et attendre le feu vert",
        "critere": "Architecture.md produit à partir du brief de `cadrage-brief` ; invariants d'architecture nommés, pas un paragraphe générique ; session principale, mêmes garde-fous menu interactif que `cadrage-brief`"
      },
      "checkpoint": "annonce + feu vert avant lancement (écrit un fichier réel)"
    },
    {
      "id": "cadrage-epics",
      "agent": "skill bmad-create-epics-and-stories",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "regime": "propose (ecrit epics.md/stories) : annoncer et attendre le feu vert",
        "critere": "epics.md produit, decoupe en stories verifiables ; PRÉREQUIS CONNU : cette skill exige `PRD.md` + `Architecture.md` en bloquant — `Architecture.md` vient de `cadrage-architecture`, mais ce playbook ne produit PAS de `PRD.md` complet (`cadrage-brief` rend un brief, pas un PRD). SI `PRD.md` manque au moment de lancer cette étape : FAIL immédiat vers l'utilisateur avec la proposition explicite de lancer `bmad-prd` d'abord — jamais de PRD inventé en silence, jamais d'attente sur un prompt que personne ne surveille"
      },
      "checkpoint": "annonce + feu vert avant lancement (écrit un fichier réel) ; FAIL nommé si PRD.md absent"
    },
    {
      "id": "gate-cadrage",
      "agent": "skill bmad-sprint-planning",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "regime": "propose (peut ecrire sprint-status) : annoncer et attendre le feu vert",
        "critere": "verdict PASS/CONCERNS/FAIL de la readiness gate de bmad-sprint-planning, lu sur `epics.md` produit par `cadrage-epics` — PASS : `implementation` démarre ; CONCERNS : lacunes nommées, présentées à l'utilisateur, confirmation attendue avant `implementation` ; FAIL (epics.md absent, ou une story sans critère d'acceptation vérifiable) : retour à l'étape en amont qui a échoué, jamais d'implementation sur une base FAIL. Le verdict doit pouvoir échouer réellement — un verdict qui ne connaît que PASS est un contrat décoratif, pas une gate"
      },
      "checkpoint": false
    },
    {
      "id": "implementation",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "chaque exigence EXPLICITE de la demande (points numérotés, contraintes) cochée une à une contre le diff — pas seulement « ça tourne » ; toute exigence réinterprétée ou écartée signalée, jamais silencieuse ; style du fichier environnant respecté"
      },
      "checkpoint": false
    },
    {
      "id": "tests-manquants",
      "agent": "qa-engineer",
      "mode": "cascade",
      "modele": "(thread)",
      "contrat": {
        "type": "deterministe",
        "critere": "SI règle R1 (bug corrigé) ou R2 (nouveau comportement : route, service, page, branche de template) s'applique : le sous-agent rend les tests manquants ÉCRITS et branchés dans npm test, en un seul passage (liste autosuffisante : fichier, cas couvert, commande de lancement). Le compte de tests doit croître avec le diff ; un diff produit sans test nouveau se justifie explicitement (refactor pur, constante)"
      },
      "checkpoint": false
    },
    {
      "id": "tests",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "verdict lu sur la sortie RÉELLE de la suite (scripts scripts/test-*.js enchaînés, assertions node:assert/strict + helper check()) — jamais sur un résumé filtré ni une sortie tronquée ; en cas de doute, rediriger toute la sortie dans un fichier",
        "commande": "npm test"
      },
      "checkpoint": false
    },
    {
      "id": "verification-ui",
      "agent": "run",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI une page HTML/CSS/JS de app/src/public/ est touchée : screenshot de la page modifiée pris et regardé (npm run start:dev, base ./data/dev/app.db)"
      },
      "checkpoint": false
    },
    {
      "id": "verification-pptx",
      "agent": "pptx-verify",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI app/scripts/pptx_deck.py, export-restitution-ppt.py ou build-synthese-ppt.py touché : export réel rendu en images et inspecté (python-pptx est un parseur tolérant, mémoire reference_rendu_pptx_verification.md)"
      },
      "checkpoint": false
    },
    {
      "id": "revue-diff",
      "agent": "reviewer",
      "mode": "cascade",
      "modele": "opus",
      "contrat": {
        "type": "deterministe",
        "critere": "SI le diff de code produit app/ n'est pas trivial (règle R3) : rapport de revue structuré reçu AVANT commit — constat + fichier:ligne + correctif proposé, exploitable sans relancer l'agent. Un petit diff peut se contenter d'une relecture ligne à ligne annoncée ; jamais de commit « ça a l'air bon » sur la seule foi des tests verts"
      },
      "checkpoint": false
    },
    {
      "id": "passe-risque",
      "agent": "auditor",
      "mode": "cascade",
      "modele": "(thread)",
      "contrat": {
        "type": "deterministe",
        "critere": "SI le changement touche une surface sensible (routes HTTP, requêtes SQL, upload/import de fichier, dépendance ajoutée) ou que l'utilisateur demande une passe risque/performance/sécurité : findings priorisés avec preuve (chemin + mécanisme), sans action hors lecture"
      },
      "checkpoint": false
    },
    {
      "id": "revue-increment",
      "agent": "revue-increment",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "boucle revue + application des correctifs + re-vérification réelle exécutée en entier. À défaut, la DoD allégée est ASSUMÉE PAR ÉCRIT — dans le message de commit (« DoD allégée : … ») ou dans les notes du run journalisé, jamais sautée en silence (constats superviseur #1/#2 du 2026-07-28 ; le hook warn_verif_before_commit le rappelle au commit)"
      },
      "checkpoint": "avant tout commit — action difficilement réversible, proposer, ne pas exécuter unilatéralement"
    }
  ],
  "regle_reprise": "une relance ciblée par étape en échec de contrat, puis escalade utilisateur avec l'état réel"
}
```
