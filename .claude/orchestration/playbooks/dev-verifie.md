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
