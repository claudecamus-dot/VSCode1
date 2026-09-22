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

## Limites assumées (état 2026-07-29)

- Pas d'authentification (Epic 10 planifié, échéance ci-dessus) ; pas de
  multi-organisations (Epic 11 non séquencé).
- Aucune Epic « plan d'action » : exclue du périmètre par décision explicite.
