# Migration de app/ vers une web app Google Apps Script : dossier de préparation

Statut : **préparé, rien n'est déployé**. Squelette dans `gas/`. Au « GO », on suit la
checklist (f) puis les lots (e) dans l'ordre. `app/` reste la référence et n'est pas modifié.

Faits relevés le 2026-09-23 sur le code réel :
- `Select-String app/src/server.js "app\.(get|post|put|delete|patch)\("` : **35 routes** ;
- schéma : `app/src/db.js` (11 tables + 1 index unique partiel) ;
- transactions : `enTransaction` (server.js l.365 et l.686), BEGIN direct dans `referentiel.js` (l.261, l.284) ;
- `execFile` Python pour l'export PPT (server.js l.1368) ;
- `nspell` n'est utilisé que par `correcteur.js`, appelé par `referentiel.js` (import) ;
- `node_modules/dictionary-fr` pèse 1 436 537 octets.

## (a) Inventaire des 35 routes

Colonne « GAS » : fonction de `gas/Code.gs` appelée par `google.script.run` (aucun `doPost`
nécessaire : tout le trafic vient de la page servie par `doGet`).

| # | Méthode | Chemin | Rôle | Tables | GAS | Lot |
|---|---|---|---|---|---|---|
| 1 | GET | /api/env | bandeau d'environnement | aucune | getEnv | 1 |
| 2 | POST | /api/referentiel/import | import xlsx du référentiel (multer + exceljs + correcteur) | piliers, sous_categories, questions, niveaux | importReferentiel | 5 |
| 3 | GET | /api/referentiel/stats | compteurs du référentiel | piliers, sous_categories, questions | getReferentielStats | 1 |
| 4 | GET | /api/referentiel | référentiel complet | piliers, sous_categories, questions, niveaux | getReferentiel | 1 |
| 5 | GET | /api/sessions | liste des sessions (filtre démo/réel) | sessions, repondants | listSessions | 2 |
| 6 | GET | /api/sessions/:id/summary | résumé d'une session | sessions, repondants | getSessionSummary | 2 |
| 7 | GET | /api/texte-intro-defaut | texte d'accueil par défaut | aucune | getTexteIntroDefaut | 1 |
| 8 | GET | /api/roles | liste des rôles | roles | listRoles | 1 |
| 9 | POST | /api/roles | ajout d'un rôle | roles | createRole | 1 |
| 10 | DELETE | /api/roles/:nom | suppression d'un rôle | roles | deleteRole | 1 |
| 11 | GET | /api/sessions/:id/departements-suggestions | autocomplétion département | repondants | getDepartementsSuggestions | 3 |
| 12 | GET | /api/sessions/:id/equipes-suggestions | autocomplétion équipe | repondants | getEquipesSuggestions | 3 |
| 13 | GET | /api/sessions/:id/roles | rôles proposés au répondant | roles, repondants | getSessionRoles | 3 |
| 14 | GET | /api/repondants/valeurs/:champ | valeurs distinctes (admin, PII) | repondants | getValeursRepondants | 4 |
| 15 | POST | /api/repondants/fusion | fusion de libellés dept/équipe (UPDATE) | repondants | fusionRepondants | 4 |
| 16 | POST | /api/sessions | création session + périmètre (transaction) | sessions, session_questions | createSession | 2 |
| 17 | GET | /api/sessions/:id | détail session | sessions | getSession | 2 |
| 18 | GET | /api/sessions/:id/referentiel | questions du périmètre | session_questions, questions, niveaux… | getSessionReferentiel | 2 |
| 19 | POST | /api/sessions/:id/invites | import xlsx des invités (multer) | invites | importInvites | 2 |
| 20 | GET | /api/sessions/:id/invites | liste des invités (PII) | invites | listInvites | 2 |
| 21 | GET | /api/sessions/:id/invites/non-repondants | relance | invites, repondants | listNonRepondants | 2 |
| 22 | POST | /api/sessions/:id/repondants | identification (unicité email, débit limité) | repondants | createRepondant | 3 |
| 23 | GET | /api/repondants/:id | reprise d'un questionnaire | repondants, reponses | getRepondant | 3 |
| 24 | PUT | /api/repondants/:id/piliers/:pilierId/reponses | sauvegarde d'un pilier (transaction) | reponses | saveReponsesPilier | 3 |
| 25 | POST | /api/repondants/:id/soumission | soumission | repondants, reponses | soumettreRepondant | 3 |
| 26 | GET | /api/sessions/:id/equipes | équipes de la session | repondants | listEquipes | 4 |
| 27 | GET | /api/sessions/:id/departements | départements | repondants | listDepartements | 4 |
| 28 | GET | /api/sessions/:id/participation | taux de participation | invites, repondants | getParticipation | 4 |
| 29 | GET | /api/sessions/:id/commentaire | commentaire d'équipe | commentaires | getCommentaire | 4 |
| 30 | PUT | /api/sessions/:id/commentaire | écriture du commentaire | commentaires | saveCommentaire | 4 |
| 31 | GET | /api/sessions/:id/questions/:questionId/detail | détail nominatif à la demande | reponses, repondants, niveaux | getQuestionDetail | 4 |
| 32 | GET | /api/sessions/:id/resultats | résultats agrégés | reponses, repondants, questions… | getResultats | 4 |
| 33 | GET | /api/sessions/:id/consolidation | consolidation (confidentialité) | idem | getConsolidation | 4 |
| 34 | GET | /api/sessions/:id/comparaison | comparaison entre sessions | idem + sessions | getComparaison | 4 |
| 35 | GET | /api/sessions/:id/export-ppt | export PPT (Python) | idem | exportPpt | 6 |

Pages statiques (`src/public/*.html`, `classement.js`, `esc.js`, `stats-partagees.js`) :
servies par `doGet(e)` selon `e.parameter.page` et `HtmlService.createTemplateFromFile`,
les JS partagés inclus par `<?!= include('...') ?>`. Chaque `fetch('/api/...')` devient
un appel `google.script.run.<action>` (promesse enveloppée). Lot 0 (socle, ci-dessous).

## (b) Schéma de données

Stockage retenu : **un Google Sheet, un onglet par table**. JDBC Cloud SQL n'est pas
retenu par défaut : il suppose un projet GCP facturé et une ouverture réseau, que
l'outil (quelques sessions, quelques centaines de lignes) ne justifie pas. À réévaluer si
la volumétrie ci-dessous est dépassée d'un ordre de grandeur.

| Table (db.js) | Onglet | Clé | Contraintes à reproduire en code |
|---|---|---|---|
| piliers | `piliers` | id (compteur) | archive 0/1 |
| sous_categories | `sous_categories` | id | FK pilier_id, cascade |
| questions | `questions` | id | FK sous_categorie_id, cascade |
| niveaux | `niveaux` | id | FK question_id |
| sessions | `sessions` | id (texte, UUID) | est_demo, texte_intro |
| repondants | `repondants` | id (UUID) | **unicité (session_id, email) si email non nul** (index partiel) ; cascade depuis sessions |
| reponses | `reponses` | id | **unicité (repondant_id, question_id)** : upsert |
| roles | `roles` | id | **unicité nom** ; 6 rôles par défaut semés |
| invites | `invites` | id | FK session_id |
| session_questions | `session_questions` | (session_id, question_id) | clé composite |
| commentaires | `commentaires` | (session_id, equipe) | clé composite, upsert |

- **Volumétrie estimée (non mesurée)** : référentiel de l'ordre de 10² questions et 10³
  niveaux ; `reponses` = répondants × questions, soit 10⁴ à 10⁵ lignes par an. Reste loin
  de la limite de 10 M cellules d'un Sheet. Volumétrie réelle de prod : Information insuffisante
  (mesurer `SELECT COUNT(*)` par table sur la base prod avant le lot 3).
- **Identifiants** : `Utilities.getUuid()` pour les clés texte ; compteur par onglet
  (propriété `ScriptProperties`) pour les clés entières, pris sous verrou.
- **Clés étrangères et cascades** : aucune en Sheets ; suppressions en cascade codées
  explicitement (supprimer une session supprime ses répondants, réponses, invités, périmètre,
  commentaires).
- **Transactions (tx.js)** : il n'y a pas de rollback en Sheets. Remplacement :
  `LockService.getScriptLock().waitLock(...)` autour de chaque écriture multi-lignes, **validation
  complète avant toute écriture** (le cas du 2026-09-01 : pilier persisté avant le 400), puis
  écriture en un seul `setValues` par onglet. Pour les écritures sur plusieurs onglets
  (création session + périmètre, remplacement du référentiel), écrire d'abord l'onglet
  « enfant », marquer la ligne parente valide en dernier ; tester l'échec au milieu.
- Le verrou remplace aussi `busy_timeout`/WAL : lecteurs sans verrou, écrivains sérialisés.

## (c) Correspondance des dépendances

| Dépendance | Usage | Apps Script | Faisabilité |
|---|---|---|---|
| express | routes, statique | `doGet` + `HtmlService` + `google.script.run` | réécriture du routage (squelette fait) |
| multer (mémoire, 10 Mo) | import xlsx référentiel et invités | `<input type=file>` lu en base64 côté client puis `google.script.run.importX(base64)` ; ou dépôt dans Drive puis lecture par id | limite de taille des arguments `google.script.run` : Information insuffisante sur la valeur exacte ; passer par Drive au-delà de quelques Mo |
| exceljs | lecture xlsx | xlsx → `Drive.Files.insert/copy` avec conversion en Google Sheet (service avancé Drive) puis `SpreadsheetApp` ; ou `Utilities.unzip` + parsing XML (lourd) | faisable, ajoute le scope/service avancé Drive au lot 5 |
| nspell + dictionary-fr | correcteur à l'import | 1,4 Mo de dictionnaire à charger dans chaque exécution ; pas de `require` en V8 Apps Script : il faut bundler | **dégradé probable** : charger 1,4 Mo et construire l'automate par exécution risque de consommer une part notable des 6 min ; option : désactiver le correcteur (le rendre consultatif hors ligne dans app/) |
| python-pptx (execFile) | export PPT | `SlidesApp` : copie d'un modèle Slides (`DriveApp.getFileById(modele).makeCopy`) puis remplissage ; export .pptx via l'URL d'export Drive | réécriture complète du générateur ; **lot à part (6)** |

## (d) Sécurité

- **Basic Auth (auth.js) disparaît** : la web app est en `access: DOMAIN` ; seul un compte
  du Workspace OCTO atteint la page. Les droits animateur se codent par une liste
  d'emails autorisés (ScriptProperties) contrôlée par `Session.getActiveUser().getEmail()`.
- **`executeAs: USER_DEPLOYING` (tranché)** : le script lit et écrit le Sheet avec les
  droits du déployeur. Les répondants **n'ont aucun accès direct au Sheet** : ils ne voient
  que ce que les fonctions leur renvoient. Avec `USER_ACCESSING`, chaque répondant devrait
  avoir un droit d'édition sur le Sheet, donc pourrait ouvrir **toutes** les données
  nominatives : incompatible avec `test-repondant-sans-pii` et
  `test-detail-nominatif-a-la-demande`. Contrepartie : le Sheet appartient au déployeur
  (prévoir un Drive partagé d'équipe) et `getActiveUser()` ne renvoie l'email que dans le
  même domaine, ce qui est notre cas.
- **CSRF (csrf.js) disparaît** : `google.script.run` n'est pas une requête cross-site
  forgeable par un formulaire tiers. **En-têtes (entetes-securite.js)** : non paramétrables en
  Apps Script (la page est servie dans l'iframe sandbox de Google) ; `test-entetes-securite`
  devient sans objet, à remplacer par un contrôle `XFrameOptionsMode.DEFAULT` (anti-clickjacking).
- **Débit (debit.js)** : à reproduire par `CacheService` (compteur par email et fenêtre).
- **Tests de confidentialité** (`test-repondant-sans-pii`, `test-detail-nominatif-a-la-demande`,
  `test-confidentialite-consolidation`, `test-xss-resultats`) : **gardent tout leur sens** ;
  réécrits comme tests de parité sur les fonctions GAS (voir g). Le filtrage des PII reste
  fait côté serveur, jamais côté page.

## (e) Lots, du plus petit risque au plus grand

| Lot | Contenu | Critère de fin vérifiable | Perdu / dégradé |
|---|---|---|---|
| 0 | Socle : `clasp push`, `doGet` multi-pages, `ping`, couche d'accès Sheets (lire/écrire un onglet, verrou, UUID) | page déployée ouvre et affiche « ping ok » avec un compte OCTO ; refusée hors domaine | rien |
| 1 | Référentiel en lecture, rôles, env (7 routes) | mêmes JSON que app/ sur un référentiel copié (diff = 0) | bandeau d'env simplifié |
| 2 | Sessions, périmètre, invités (8 routes) | parité sur `test-sessions`, `test-validation-dates-session`, `test-rappel` rejoués sur GAS | import invités limité en taille |
| 3 | Parcours répondant (7 routes) | parité `test-unicite-email`, `test-fenetre-saisie`, `test-validation-reponses-atomique`, `test-repondant-sans-pii`, `test-debit-repondants` | latence par appel (~1 s, estimation non mesurée) au lieu de ms |
| 4 | Pilotage et restitution (11 routes) | parité `test-scores`, `test-confidentialite-consolidation`, `test-detail-nominatif-a-la-demande`, `test-comparaison-objectifs-homonymes`, `test-xss-resultats` | calculs sous 6 min : à mesurer sur la plus grosse session |
| 5 | Import du référentiel xlsx (1 route) | re-import non destructif identique à `test-reimport` ; durée < 6 min mesurée | correcteur nspell probablement retiré ou hors ligne |
| 6 | Export PPT via SlidesApp (1 route) | deck produit depuis le modèle Slides, rendu regardé, mêmes chiffres que le PPT Python | fidélité graphique du gabarit python-pptx (jauges, formes) |

## (f) CHECKLIST GO

À fournir ou faire par l'UTILISATEUR :
1. Confirmer le compte Google OCTO qui sera **propriétaire et déployeur** (`executeAs: USER_DEPLOYING`).
2. Activer l'API Apps Script : https://script.google.com/home/usersettings → « Google Apps Script API » sur « On ».
3. Installer clasp : `npm i -g @google/clasp` (Claude ne le fait pas).
4. Lancer `clasp login` avec ce compte (ouvre le navigateur ; crée `~/.clasprc.json`, jamais commité).
5. Créer (ou désigner) le dossier Drive, idéalement dans un Drive partagé d'équipe, et y créer le Sheet cible vide ; transmettre son **identifiant** hors dépôt (il ira dans ScriptProperties, pas dans git).
6. Pour le lot 6 : fournir un modèle Google Slides (conversion du gabarit `template ppt/`) et son identifiant.
7. Obtenir de l'admin Workspace OCTO la confirmation que les web apps `access: DOMAIN` et les scopes du manifeste (spreadsheets, drive.file, presentations, userinfo.email) sont autorisés — Information insuffisante à ce jour.
8. Obtenir l'accord conformité RGPD (données nominatives hébergées dans Google Workspace, registre de traitement, durée de conservation) — Information insuffisante à ce jour.
9. Fournir la liste des emails animateurs (droits d'administration).
10. Dire « GO » et le lot visé.

Commandes que Claude lancera au GO (depuis la racine VSCode1) :
```
clasp create --type webapp --title "Maturite agile" --rootDir gas
clasp push
clasp deploy --description "lot 0 - socle"
```
`clasp create` écrit `gas/.clasp.json` avec le vrai `scriptId` : ce fichier est à **ajouter
au .gitignore** (seul `.clasp.json.example` est versionné). Puis ouverture de l'URL `/exec`
avec le compte OCTO pour vérifier « ping ok ».

## (g) Tester en local

- Les 37 scripts de `npm test` dans app/ restent **l'oracle du comportement** ; app/ n'est
  pas retiré avant la fin du lot 4.
- Parité : pour chaque lot, on extrait les entrées/sorties des tests Node (JSON des routes)
  en fixtures, et on rejoue les mêmes entrées contre les fonctions GAS. Deux voies :
  (1) logique métier écrite en fonctions pures sans appel à un service Google, testables sous
  `node` via un petit shim (`module.exports` conditionnel) ; (2) couche Sheets testée en
  réel sur un **Sheet de test distinct**, via `clasp run` (requiert un déploiement API
  executable) ou une fonction `testerLotN()` lancée depuis l'éditeur.
- Critère : diff JSON nul entre app/ et GAS sur les fixtures ; les écarts assumés
  (en-têtes, CSRF, Basic Auth) listés dans ce document.

## (h) Risques et questions ouvertes

- Quota 6 min par exécution (source : developers.google.com/apps-script/guides/services/quotas) :
  import référentiel + correcteur, et export Slides sont les candidats au dépassement.
- Concurrence : `LockService` sérialise les écritures ; à une vague de répondants
  simultanés, attente possible de plusieurs secondes (non mesuré). Quotas d'exécutions
  simultanées du contrat Workspace OCTO : Information insuffisante.
- Absence de transaction réelle : un échec au milieu d'une écriture multi-onglets laisse un
  état partiel si le motif « enfant d'abord, parent validé en dernier » n'est pas respecté.
- Perte de la séparation dev/preprod/prod actuelle : prévoir un Sheet et un déploiement par
  environnement.
- Sauvegarde/restauration (`backup-db.js`, `restore-db.js`) : à remplacer par l'historique
  des versions du Sheet ou une copie planifiée — non couvert par un lot, à décider.
- **Ce qui ferait renoncer** : refus de la politique Workspace OCTO sur les web apps ou les
  scopes ; refus conformité RGPD ; export PPT jugé indispensable à l'identique et
  non reproductible en SlidesApp ; parité du lot 3 impossible sous les quotas mesurés.
