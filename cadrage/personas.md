# Personas — Questionnaire de maturité agile/produit

## 1. Répondant – Équipier

**Qui** : PO, Scrum Master, Tech Lead, développeur, testeur... membre d'une équipe produit.

**Objectif** : faire un état des lieux honnête de son quotidien d'équipe sans craindre que ses réponses soient utilisées contre lui.

**Besoins** :
- Questionnaire rapide à remplir (pas plus de 15-20 min)
- Formulations concrètes, ancrées dans le quotidien (déjà le cas dans la grille existante)
- Comprendre à quoi vont servir ses réponses

**Frustrations probables** :
- Peur que les résultats individuels remontent nommément à son manager
- Lassitude si le questionnaire est perçu comme un exercice purement administratif, sans suite concrète
- Difficulté à choisir entre deux niveaux de maturité proches

**Contexte d'usage** : répond seul, probablement sur un poste de travail, en dehors d'une réunion ou en fin de sprint/rétro.

---

## 2. Répondant – Manager direct

**Qui** : manager hiérarchique direct de l'équipe (responsable, manager de proximité).

**Objectif** : donner sa propre lecture de la maturité de son équipe, pour confronter sa perception à celle des équipiers.

**Besoins** :
- Répondre au **même questionnaire** que l'équipe (mêmes 50 questions, mêmes 4 niveaux) pour permettre une comparaison directe
- Visualiser les écarts de perception manager/équipe une fois les résultats agrégés
- Comprendre que l'écart de perception est une donnée utile, pas un jugement

**Frustrations probables** :
- Difficulté à répondre "comme s'il était dans l'équipe" sur des pratiques très opérationnelles (ex: qualité du code)
- Risque de répondre de façon trop optimiste (biais de désirabilité managériale)

**Contexte d'usage** : répond seul, probablement en amont d'un point d'équipe ou d'un comité de pilotage.

---

## 3. Animateur / Coach agile

**Qui** : coach agile, scrum master transverse, ou référent agilité en charge d'administrer la session d'évaluation.

**Objectif** : collecter les réponses de l'équipe et du manager, produire une synthèse exploitable, et animer la restitution pour déclencher un plan d'action.

**Besoins** :
- Lancer/diffuser le questionnaire facilement (lien, rappels)
- Suivre le taux de complétion en temps réel
- Visualiser les résultats agrégés par pilier/objectif, avec l'écart équipe vs manager
- Exporter ou partager une synthèse pour la restitution

**Frustrations probables** :
- Manque de visibilité sur qui a répondu (sans casser l'anonymat individuel)
- Difficulté à transformer des scores bruts en plan d'action concret
- Multiplicité des équipes à suivre si l'outil est déployé à grande échelle

**Contexte d'usage** : usage répété, sur plusieurs équipes et dans le temps (comparaison d'une session à l'autre).

---

## 4. Sponsor / RH / Direction

**Qui** : direction de programme, RH, sponsor de la transformation agile (niveau au-dessus de l'équipe et de son manager).

**Objectif** : avoir une vision consolidée de la maturité sur plusieurs équipes/départements pour orienter les investissements (formation, coaching, organisation).

**Besoins** :
- Vue agrégée multi-équipes, par pilier (Équipe Produit / Excellence Technique / Culture Agile / Agilité à l'échelle)
- Suivi de la progression dans le temps (sessions répétées)
- Anonymisation garantie au niveau individuel — granularité au niveau équipe minimum

**Frustrations probables** :
- Données trop fines ou nominatives qui posent un problème de confidentialité/confiance
- Manque de recul historique si l'outil ne capitalise pas les sessions précédentes

**Contexte d'usage** : consultation ponctuelle (comité, reporting), pas de remplissage du questionnaire.

---

## Implication de conception (à date)

- Le manager direct répond au **même questionnaire** que l'équipe → un seul jeu de questions à concevoir, mais le modèle de données doit distinguer le **rôle du répondant** (équipier vs manager) pour permettre le calcul d'écart de perception.
- Distinction claire entre **répondants** (équipier, manager) et **consultants des résultats** (animateur, sponsor/RH) → impacte les droits d'accès et les vues de restitution à prévoir.
