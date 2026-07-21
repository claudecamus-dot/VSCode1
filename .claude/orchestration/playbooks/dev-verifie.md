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
      "id": "tests",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "verdict lu sur la sortie RÉELLE de la suite (scripts scripts/test-*.js enchaînés, assertions node:assert/strict + helper check()) — jamais sur un résumé filtré (le proxy rtk réécrit les commandes de ce projet) ni une sortie tronquée ; en cas de doute, relancer via `rtk proxy npm test` ou rediriger toute la sortie dans un fichier",
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
      "id": "revue-increment",
      "agent": "revue-increment",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "boucle revue + application des correctifs + re-vérification réelle exécutée en entier"
      },
      "checkpoint": "avant tout commit — action difficilement réversible, proposer, ne pas exécuter unilatéralement"
    }
  ],
  "regle_reprise": "une relance ciblée par étape en échec de contrat, puis escalade utilisateur avec l'état réel"
}
```
