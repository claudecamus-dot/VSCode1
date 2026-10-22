# Product brief — Questionnaire de maturité agile/produit

_Porte d'entrée produit 1 page (créée le 2026-07-29, finding
`famille:cadrage-produit-apps` du hub de supervision, arbitré). Sources de
vérité : [`cadrage/personas.md`](../cadrage/personas.md) (personas détaillés),
[`cadrage/experience-map.md`](../cadrage/experience-map.md),
[`cadrage/epics-us.md`](../cadrage/epics-us.md) (epics et user stories),
[`cadrage/difficultes-realisation.md`](../cadrage/difficultes-realisation.md).
Ce brief synthétise, il ne remplace pas ces sources._

## Persona

Quatre personas (détail dans `cadrage/personas.md`) :

- **Répondant équipier** (PO, SM, dev, testeur…) : état des lieux honnête en
  15-20 min, sans crainte d'un usage nominatif contre lui.
- **Répondant manager direct** : même questionnaire que l'équipe, pour
  confronter sa perception à celle des équipiers (l'écart est une donnée).
- **Animateur / coach agile** : importe le référentiel Excel, lance les
  sessions, consulte les agrégats, restitue en PPT.
- **Sponsor / RH / direction** : vue consolidée multi-équipes (Epic 7), en
  lecture seule une fois l'Epic 10 livré.

## Pourquoi (problème à résoudre)

Les évaluations de maturité d'équipes se font sur tableur : collecte pénible,
agrégation manuelle fragile, aucune vue d'écart de perception
manager/équipe, restitution refaite à la main à chaque campagne. L'outil
industrialise la chaîne **référentiel → collecte → agrégats → export PPT**
sans imposer de compte au répondant (le lien de session suffit).

## Besoins et points de douleur

- Répondre vite, reprendre où on s'est arrêté, confidentialité comprise
  (le nominatif est annoncé, visible du seul animateur).
- Agréger sans tableur : moyennes par pilier/question, radar, dispersion,
  filtre avec/sans managers pour lire l'écart de perception.
- **Ne pas réidentifier par l'agrégat** (décision du 2026-10-20, qui inverse
  le « aucun seuil » de `cadrage/experience-map.md`) : toute vue agrégée
  (équipe, département, filtre avec/sans managers) et le deck PPT masquent un
  groupe de **2 répondants ou moins** (« effectif insuffisant »). L'écran
  nominatif de l'animateur est inchangé. [ASSUMPTION] Les groupes masqués
  restent comptés dans les consolidations de niveau supérieur dès que
  celles-ci dépassent le seuil.
- Tenir un atelier réel : une équipe de plus de 10 personnes derrière un même
  réseau ou proxy doit pouvoir s'inscrire en même temps (limite de débit
  calculée par session, plafond relevé et réglable).
- **Collecte en ligne, restitution sur le laptop** (brief validé le 2026-10-21 ;
  périmètre puis ordre de déploiement fixés le même jour) : la **première
  version en ligne ne permet que de répondre au questionnaire**, depuis un
  lien ou un QR code, sur téléphone sans rien installer (pas d'application
  native). Tout ce qui est restitution (vues agrégées, détail nominatif,
  consolidation, comparaison) et la génération du PPT se font **uniquement
  par le propriétaire du produit, depuis son laptop**, qui remet lui-même le
  deck. Aucun animateur ni sponsor extérieur ne se connecte : Epic 10 reste
  clos. Pour que le propriétaire garde l'accès aux données, la **première
  cible est Google Apps Script sous son compte OCTO** (les réponses sont dans
  un Google Sheet qu'il possède) ; le **serveur du client** (conteneur actuel)
  devient la seconde cible, sous condition que le client remette la
  sauvegarde de la base. Réserve ouverte sur Apps Script : le dossier de
  migration suppose `access: DOMAIN` ; l'accès de répondants extérieurs, la
  reconnaissance de l'administrateur et la charge à 100 répondants simultanés
  doivent être instruits avant tout lot.
- Restituer sur le template corporate : export PPT branché dans `npm test`
  avec test du livrable réel.
- Douleur réduite — **barrière intérimaire posée, Epic 10 clos sur ce
  périmètre** : l'espace animateur et l'API exposent des données nominatives,
  protégées depuis le 2026-07-30 par une barrière HTTP Basic Auth env-gated
  fail-closed (`app/src/auth.js`, durcie le 2026-09-16). Arbitrage du
  2026-09-03 (`cadrage/epics-us.md`, cible `arbitrages:revue-mvp-2026-09-01`) :
  cette barrière est déclarée périmètre final du MVP pour l'Epic 10 ; US10.3
  (rôle lecture seule) et US10.4 (cycle de vie des comptes) sont
  déprioritisées, pas abandonnées. Ceci reste une mesure de réduction de
  risque, pas l'authentification produit complète (pas de comptes ni de rôle
  lecture-seule) — et ne couvre ni TLS ni la mise en service au-delà du poste
  de l'animateur.

## Proposition de valeur

**Passer d'un audit-tableur artisanal à une campagne outillée et
comparable** : même grille pour tous, écart de perception manager/équipe
calculé au lieu d'être deviné, sessions parallèles multi-équipes sans
mélange, et un deck de restitution généré — vérifié sur l'artefact réel —
au lieu d'une soirée de copier-coller.

## Fiabilité attendue (revue de code du 2026-10-20)

La revue `code-review-crew` du 2026-10-20 fixe le niveau attendu avant
d'étendre le produit :

- **Exactitude** : deux noms distincts ne sont jamais fusionnés (écritures
  non latines comprises) ; une limite affichée en caractères se compte en
  caractères ; une moyenne ne rend jamais `NaN`.
- **Erreurs et sécurité** : une panne interne ne se présente pas comme une
  erreur de saisie et ne divulgue pas de message technique ; la barrière
  Basic Auth résiste aux essais répétés ; une session a un plafond de
  répondants ; tout contenu inséré dans une page est échappé.
- **Exploitation** : les commandes documentées existent ; l'export PPT trouve
  Python sur Windows comme les tests ; aucun test ne peut rester bloqué
  sans délai.
- **Maintenabilité** : les seuils partagés entre l'écran et le deck ont une
  seule source.

## Limites assumées (état 2026-10-20)

- Barrière Basic Auth unique, sans comptes ni rôle lecture seule (US10.3 et
  US10.4 déprioritisées) ; pas de multi-organisations (Epic 11 non séquencé).
- Aucune Epic « plan d'action » : exclue du périmètre par décision explicite.
