# Découpage Epics / User Stories — Questionnaire de maturité agile/produit

Brouillon initial, dérivé de [experience-map.md](experience-map.md) et [difficultes-realisation.md](difficultes-realisation.md). Numérotation provisoire, à ordonner/prioriser ensemble.

## Epic 1 — Référentiel de questions (import Excel)

- US1.1 — En tant qu'animateur, je veux importer un fichier Excel définissant piliers/questions/niveaux de maturité (1 onglet = 1 pilier, le nom du pilier reprenant le nom de l'onglet), pour créer le référentiel de questions de l'outil.
- US1.2 — En tant qu'animateur, je veux pouvoir ré-importer une nouvelle version du fichier Excel, pour faire évoluer le référentiel sans perdre les sessions déjà réalisées.
- US1.3 — En tant qu'animateur, je veux activer/désactiver un pilier entier (onglet) du référentiel pour une session donnée, pour adapter le questionnaire à une équipe spécifique.
- US1.3bis — En tant qu'animateur, je veux aussi désactiver une question précise à l'intérieur d'un pilier activé, pour affiner le questionnaire au-delà du seul niveau pilier.
- US1.4 — En tant qu'animateur, si le fichier importé ne respecte pas le format attendu, je veux que l'import soit intégralement rejeté avec un message d'erreur explicite, pour corriger le fichier avant de relancer l'import (pas d'import partiel possible).
- US1.5 — En tant qu'animateur/système, je veux associer chaque niveau de réponse (0 à 3) à une valeur numérique lors de l'import, pour permettre le calcul des agrégats, du radar et des indicateurs de dispersion.
- US1.6 — En tant qu'animateur, je veux choisir au moment de l'import entre **conserver les versions précédentes** (ré-import non destructif : questions inchangées gardées, retirées archivées avec leurs réponses, anciennes sessions toujours consultables) et **remplacer complètement** (départ à zéro : ancienne grille, sessions et réponses supprimées avant de charger la nouvelle grille), pour adapter l'import selon qu'il y a ou non des réponses à conserver. Le mode « remplacer » est précédé d'une confirmation récapitulant le nombre de sessions/réponses qui seront définitivement supprimées. Dans les deux cas, les nouvelles sessions utilisent la nouvelle grille.

## Epic 2 — Lancement et gestion d'une session

- US2.1 — En tant qu'animateur, je veux créer une session pour une équipe (date d'ouverture/fermeture, liste des piliers/questions actifs), pour démarrer une campagne d'évaluation.
- US2.2 — En tant qu'outil, je dois déduire l'effectif de l'équipe du nombre de personnes ayant répondu (pas de liste pré-paramétrée), pour afficher ce nombre à côté des résultats.
- US2.3 — En tant qu'animateur, je veux paramétrer/modifier la liste globale des rôles disponibles pour l'organisation, pour l'adapter au contexte (cette liste n'est pas spécifique à une session).
- US2.4 — En tant qu'animateur, je veux envoyer une invitation par email aux participants (mode atelier synchrone ou fenêtre asynchrone), pour lancer la collecte.
- US2.5 — En tant qu'outil, je dois envoyer un rappel automatique aux participants n'ayant pas répondu avant la clôture, pour maximiser le taux de réponse.
- US2.6 — En tant qu'animateur, je veux que plusieurs sessions d'équipes différentes puissent tourner en parallèle sans mélange de données, pour déployer l'outil à plusieurs équipes à la fois.

## Epic 3 — Identification du répondant

- US3.0 — En tant que répondant, je dois saisir mon nom et prénom en première question, avec un message explicite indiquant que cette information est nominative (visible par l'animateur), pour répondre en connaissance de cause.
- US3.1 — En tant que répondant, je dois indiquer mon département, mon équipe et mon rôle avant de commencer le questionnaire, pour que mes réponses soient rattachées correctement. Le choix de l'équipe n'est jamais bloquant (pas de liste d'appartenance à valider) — un manager peut ainsi désigner une équipe dont il n'est pas membre au quotidien.
- US3.2 — En tant que répondant, je dois indiquer si je suis manager et si je fais partie de l'équipe au quotidien, pour permettre le calcul de l'écart de perception dans l'équipe.
- US3.3 — En tant que répondant, je veux sélectionner mon département/équipe dans une liste déroulante ou les saisir librement (avec tolérance aux fautes), pour ne pas être bloqué si l'élément n'existe pas encore.
- US3.4 — En tant que répondant, je veux une auto-suggestion à la saisie (ex: "Équipe Alpha" suggéré si je tape "Equipe Alpha"), pour limiter les doublons dès la saisie.
- US3.4bis — En tant qu'animateur, je veux pouvoir corriger/fusionner un doublon résiduel lors de la review des réponses, pour fiabiliser la consolidation malgré l'auto-suggestion.
- US3.5 — En tant qu'animateur, je veux paramétrer le texte d'accompagnement de ces questions préalables (nom, département, équipe, rôle, manager...), pour adapter le message au contexte et à la culture de l'organisation.

## Epic 4 — Parcours de réponse au questionnaire

- US4.1 — En tant que répondant, je veux répondre aux questions organisées par pilier, sur web et mobile, pour pouvoir répondre dans le contexte qui me convient.
- US4.2 — En tant que répondant, je veux voir le nombre de questions restantes et ma progression globale, pour anticiper le temps nécessaire.
- US4.3 — En tant que répondant, je veux que ma progression soit sauvegardée automatiquement à chaque pilier complété, pour pouvoir reprendre au pilier suivant si j'interromps ma session.
- US4.3bis — En tant que répondant, si j'interromps ma saisie avant d'avoir terminé un pilier en cours, je dois reprendre ce pilier depuis le début (pas de sauvegarde infra-pilier).
- US4.4 — En tant que répondant, je dois répondre à toutes les questions actives avant de pouvoir soumettre, pour garantir des données exploitables.
- US4.5 — En tant que répondant, je veux revenir en arrière modifier une réponse avant la confirmation finale, pour corriger une erreur.
- US4.6 — En tant que répondant, une fois confirmé, je ne peux plus modifier mes réponses jusqu'à réouverture de la session par l'animateur, pour garantir l'intégrité des résultats.

## Epic 5 — Agrégation et consultation des résultats (vue animateur)

*Design révisé (cf. brainstorm UX) : un écran unique en accordéon par pilier, agrégé par défaut, avec drill-down nominatif question par question — remplace l'idée initiale de deux écrans séparés.*

- US5.1 — En tant qu'animateur, je veux consulter un écran organisé en accordéon par pilier, affichant la moyenne par pilier puis par question, pour avoir une vue agrégée et anonyme par défaut.
- US5.2 — En tant qu'animateur, je veux ouvrir le détail nominatif d'une question précise (qui a répondu quoi), pour analyser finement un point particulier sans exposer tout le détail individuel en permanence.
- US5.3 — En tant qu'animateur, je veux filtrer l'écran (vue équipe uniquement, pas la vue département de l'Epic 7) avec/sans les réponses du ou des managers, pour visualiser l'écart de perception "dans l'équipe" vs "hors équipe".
- US5.4 — En tant qu'outil, je dois recalculer l'agrégation automatiquement et en temps réel dès qu'un questionnaire est terminé, sans attendre la clôture de la session.

## Epic 6 — Analyse et restitution

- US6.1 — En tant qu'animateur, je veux visualiser un radar de maturité par pilier, pour synthétiser les résultats de l'équipe.
- US6.2 — En tant qu'animateur, je veux voir des pré-analyses automatiques (min, max, dispersion, taux de réponse), pour identifier rapidement les points d'attention.
- US6.3 — En tant qu'animateur, je veux saisir un commentaire libre pour l'équipe dans l'onglet de preview, et le voir restitué à la fois à l'écran et dans l'export PPT, pour contextualiser les résultats avant de les présenter.
- US6.4 — En tant qu'animateur, je veux exporter un support de restitution au format slide (PPT), pour le présenter moi-même en réunion d'équipe.
- US6.5 — En tant qu'animateur, si une session précédente existe pour la même équipe, je veux voir les deux radars superposés avec des commentaires de régression/progression par pilier, pour visualiser l'évolution dans le temps.

## Epic 7 — Consolidation multi-équipes (vue Sponsor/RH/Direction)

- US7.1 — En tant que sponsor/RH/direction, je veux consulter un écran dédié et distinct de celui de l'animateur, pour avoir une vue orientée pilotage plutôt qu'animation d'équipe.
- US7.2 — En tant que sponsor/RH/direction, je veux voir le radar agrégé de toutes les équipes d'un département, pour orienter des décisions à l'échelle du département.
- US7.3 — En tant que sponsor/RH/direction, je veux zoomer sur une équipe en particulier depuis cette vue consolidée, pour approfondir un point spécifique.

## Epic 8 — Packaging et déploiement

*Cibles retenues : déploiement cloud, et package portable autoportant installable pas-à-pas sur un serveur. (La voie « serveur on-premise géré pm2/reverse-proxy » à part n'est pas le focus : c'est le package portable qu'on installe sur le serveur.)*

- US8.1 — En tant qu'exploitant, je veux un script de packaging reproductible qui produit un artefact d'installation versionné du site (sources, dépendances, schéma/seed de la base), pour disposer d'un livrable de déploiement fiable et rejouable.
- US8.2 — En tant qu'exploitant, je veux externaliser la configuration (PORT, dossier de données / chemin de la base) via des variables d'environnement, et disposer d'une procédure de sauvegarde/restauration de la base SQLite, pour exploiter l'outil sans toucher au code et sécuriser les données.
- US8.3 — En tant qu'exploitant, je veux un package portable autoportant (archive embarquant l'application et ses dépendances, idéalement le runtime Node), installable hors-ligne, pour déployer sur une machine cible sans accès aux dépôts de paquets.
- US8.4 — En tant qu'exploitant, je veux un runbook d'installation pas-à-pas sur serveur (prérequis, déballage, configuration, démarrage, démarrage automatique, vérification), pour installer le package de façon autonome.
- US8.5 — En tant qu'exploitant, je veux une image conteneur (Dockerfile) de l'application paramétrable par variables d'environnement, pour standardiser l'exécution et préparer le déploiement cloud.
- US8.6 — En tant qu'exploitant, je veux déployer l'image/conteneur sur un service cloud (ex. Azure App Service / conteneur) avec persistance des données et configuration externalisée, pour héberger l'outil dans le cloud.

*Note technique : node:sqlite étant intégré au runtime Node ≥ 22, le package portable se résume au code + node_modules (voire un binaire Node SEA) ; la persistance des données (fichier SQLite) est le point d'attention principal côté cloud (volume persistant).*

## Epic 9 — Environnements DEV / PRE-PROD / PROD (sur ce PC)

*Objectif : faire tourner trois instances isolées de l'outil sur la même machine et pouvoir les faire évoluer au rythme du projet (s'appuie sur le packaging de l'Epic 8).*

- US9.1 — En tant qu'exploitant, je veux trois environnements isolés (DEV, PRE-PROD, PROD) sur ce PC, chacun avec son port, son dossier de données et sa base SQLite distincts, configurés par variables d'environnement, pour les exécuter en parallèle sans mélange.
- US9.2 — En tant qu'exploitant, je veux des scripts de démarrage/arrêt par environnement (et un lancement automatique de PROD au démarrage du PC), pour exploiter les environnements simplement.
- US9.3 — En tant qu'exploitant, je veux promouvoir/mettre à jour un environnement selon l'avancement (DEV → PRE-PROD → PROD) : déployer une version donnée du code, appliquer les migrations de schéma et redémarrer, sans toucher aux données de l'environnement cible.
- US9.4 — En tant qu'exploitant, je veux une séparation stricte des données entre environnements et une sauvegarde automatique de la base avant toute promotion vers PROD, pour éviter toute perte ou contamination de données.
- US9.5 — En tant qu'utilisateur, je veux un bandeau visible indiquant l'environnement courant (DEV / PRE-PROD / PROD) dans l'interface, pour éviter toute confusion entre environnements.

*Point ouvert (conception) : mécanisme de mise à jour — copie du build packagé (Epic 8) vs `git pull` + install ; gestion des migrations de schéma SQLite entre versions.*

## Epic 10 — Authentification et gestion des accès

*Constat : à ce stade, l'espace animateur (import référentiel, création de session, consultation des résultats, export PPT) et les routes API associées sont accessibles à quiconque possède l'URL, sans aucune vérification. Cet Epic couvre l'authentification de l'animateur/pilotage ; le répondant reste volontairement hors périmètre (voir US10.5).*

- US10.1 — En tant qu'animateur, je dois m'authentifier (identifiant/mot de passe ou SSO) avant d'accéder à l'espace animateur, pour empêcher un accès non autorisé aux fonctions d'administration.
- US10.2 — En tant qu'outil, je dois protéger les routes API sensibles (import référentiel, création/paramétrage de session, consultation des résultats, export PPT, gestion des rôles, fusion de doublons) derrière la même vérification d'authentification que les pages, pour empêcher un contournement direct de l'API.
- US10.3 — En tant qu'exploitant, je veux distinguer au moins deux niveaux d'accès (animateur : plein accès ; sponsor/RH/direction : lecture seule sur la vue pilotage uniquement), pour que chaque profil n'accède qu'aux fonctions qui le concernent.
- US10.4 — En tant qu'exploitant, je veux gérer le cycle de vie des comptes (création, désactivation, réinitialisation de mot de passe), pour administrer les accès dans la durée sans dépendre d'une intervention technique.
- US10.5 — En tant que répondant, je continue à accéder au questionnaire via le lien de session (sans compte ni mot de passe) et à m'identifier par mon nom/prénom/email comme aujourd'hui — l'authentification ne s'applique pas au parcours répondant, pour ne pas ajouter de friction à la collecte.
- US10.6 — En tant qu'outil, je dois protéger les sessions de connexion (expiration, déconnexion, cookies sécurisés) selon les pratiques standard, pour limiter le risque en cas de poste partagé ou de vol de session.

*Point ouvert (conception) : compte local propre à l'outil vs délégation à un fournisseur d'identité existant de l'organisation (SSO/OIDC) — à trancher selon le contexte de déploiement (Epic 8/9).*

*Décision (arbitrage supervision, 2026-07-25) : suite au finding sécurité de l'audit du 2026-07-24 (« aucune authentification sur l'API, qui expose des données nominatives »), l'option retenue est d'implémenter cet Epic 10 complet (US10.1–10.6) comme chantier produit — pas de barrière provisoire (Basic Auth ou jeton d'API écartés). Aucun correctif intermédiaire ne sera posé ; le finding sécurité reste ouvert avec échéance : trancher le point ouvert ci-dessus (compte local vs SSO/OIDC) et planifier le chantier au plus tard au prochain diagnostic de supervision (2026-08-08). Réf. : arbitrages.json du hub de supervision, cible « securite:VSCode1-api-pii ».*

*Révision de décision (arbitrage supervision, 2026-07-30, bouton « Valider » du wiki, option A) : l'utilisateur revient sur le « pas de barrière provisoire » ci-dessus et retient désormais l'**option A — barrière HTTP Basic Auth intérimaire** pour ne pas laisser la PII ouverte jusqu'à la livraison de l'Epic 10. Barrière posée (`app/src/auth.js`, câblée dans `server.js`) : **désactivée par défaut**, activée seulement si `AUTH_USER` et `AUTH_PASS` sont posés (l'exploitant l'active en PROD) ; **fail-closed** (tout `/api` et les pages animateur protégés par défaut), avec une **liste blanche du parcours répondant** qui préserve US10.5 (accès au questionnaire par lien de session, sans compte). Ceci **ne ferme PAS le finding ni l'Epic 10** : mesure de réduction de risque, pas l'authentification produit (pas de comptes, pas de rôle lecture-seule US10.3, pas de gestion du cycle de vie US10.4/US10.6). La dimension sécurité de l'audit reste « moyen » jusqu'à l'Epic 10 ; échéance de conception inchangée (2026-08-08). Réf. : arbitrages.json, cible « securite:VSCode1-api-pii ».*

## Epic 11 — Gestion de plusieurs clients (organisations) avec sessions séparées

*Constat : le référentiel, les rôles et les répondants sont aujourd'hui des données globales à l'outil (une seule grille, une seule liste de rôles, une seule base de répondants). Si plusieurs organisations clientes distinctes utilisent le même outil, leurs données se mélangeraient. Cet Epic introduit la notion de "client" comme cloisonnement de premier niveau, dont dépend le reste (référentiel, sessions, rôles, répondants). S'appuie sur l'authentification (Epic 10) pour savoir à quel client un animateur est rattaché.*

- US11.1 — En tant qu'exploitant, je veux qu'un "client" (organisation) soit une entité de premier niveau du modèle de données, à laquelle se rattachent référentiel, sessions, rôles et répondants, pour isoler complètement les données d'un client à l'autre.
- US11.2 — En tant qu'animateur rattaché à un ou plusieurs clients, je veux que mes accès et les données que je vois (sessions, résultats, référentiel, rôles) soient strictement limités au client actif, pour qu'aucune donnée ne fuite d'une organisation à une autre.
- US11.3 — En tant qu'animateur gérant plusieurs clients, je veux un sélecteur de "client actif" dans l'espace animateur, pour basculer explicitement d'une organisation à l'autre sans jamais les mélanger dans un même écran.
- US11.4 — En tant qu'exploitant, je veux que chaque client puisse importer et faire évoluer son propre référentiel (piliers/questions), indépendamment des autres clients, pour adapter la grille de maturité au contexte de chaque organisation.
- US11.5 — En tant qu'exploitant, je veux que la vue pilotage/consolidation département (Epic 7) reste strictement scopée à un seul client à la fois, pour ne jamais consolider les données de plusieurs organisations ensemble.
- US11.6 — En tant qu'exploitant, je veux migrer les données existantes (référentiel, sessions, rôles, répondants actuels) vers un client par défaut lors de la mise en place de cet Epic, pour ne pas perdre l'historique déjà collecté.

*Point ouvert (conception) : un animateur peut-il être rattaché à plusieurs clients simultanément (cabinet de conseil intervenant chez plusieurs clients) ou un compte = un seul client ? Impacte directement la conception d'US11.2/US11.3.*

---

## Points ouverts avant séquencement en increments

- L'Epic 1 (référentiel Excel) est probablement un prérequis technique à presque tout le reste — à confirmer comme socle du premier increment.
- Les Epics 5/6/7 (résultats/restitution/consolidation) dépendent tous d'avoir des réponses collectées (Epics 2/3/4) — séquencement naturel à valider ensemble.
- Aucune Epic "Plan d'action" : exclue du périmètre par décision explicite.

*Brouillon à ordonner et découper en increments avec toi avant de lancer la réalisation.*
