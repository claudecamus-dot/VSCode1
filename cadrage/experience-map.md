# Experience Map — Questionnaire de maturité agile/produit

Parcours complet, de l'invitation à la session jusqu'au plan d'action, tous personas confondus (voir [personas.md](personas.md)).

## Étape 0 — Invitation à la session

| | |
|---|---|
| **Qui** | Équipier, Manager |
| **Action** | Reçoit une invitation par email à participer à l'évaluation de l'équipe X, selon 2 modalités possibles : (a) un moment d'équipe synchrone organisé, où chacun remplit individuellement pendant la session ; (b) une fenêtre asynchrone, à remplir individuellement avant une date de clôture |
| **Canal/Outil** | Email, avec lien vers une session propre à l'équipe |
| **Paramétrage** | La date de clôture de la saisie est définie par l'animateur dès le lancement de la session |
| **Relance** | Rappel automatique envoyé par l'outil aux équipiers n'ayant pas encore répondu, avant la clôture |
| **Cloisonnement** | Plusieurs équipes peuvent être lancées en parallèle ; chaque équipe a sa propre session, les réponses ne sont jamais mélangées entre équipes |
| **Besoin** | Comprendre le but de la démarche et le traitement des données (anonymat, usage) |
| **Émotion** | Neutre à méfiant ("encore un questionnaire RH ?") |
| **Friction** | Manque de contexte sur l'objectif → faible taux de réponse ou réponses peu sincères |
| **Opportunité** | Message d'accueil clair avant le questionnaire : objectif, durée estimée, garanties de confidentialité |

## Étape 1 — Identification du rôle *(point critique)*

| | |
|---|---|
| **Qui** | Équipier, Manager |
| **Action** | Répond, en questions préalables systématiques avant le questionnaire, à 6 informations dans cet ordre : (1) **nom et prénom** ; (2) son **département** ; (3) son **équipe** (choix non bloquant — un manager peut désigner une équipe dont il n'est pas membre au quotidien) ; (4) son **rôle**, choisi dans une liste globale à l'organisation, modifiable par l'animateur ; (5) s'il est **manager** (oui/non) ; (6) s'il fait **partie de l'équipe au quotidien** (oui/non) |
| **Transparence nominative** | La saisie du nom/prénom est accompagnée d'un message explicite indiquant que l'information est nominative et visible par l'animateur |
| **Mode de saisie** | Département et équipe : sélection dans une liste déroulante avec auto-suggestion, ou saisie libre tolérante aux fautes d'orthographe si l'élément n'existe pas encore dans la liste |
| **Texte paramétrable** | Le texte d'accompagnement de ces questions préalables est paramétrable par l'animateur, pour adapter le message au contexte de l'organisation |
| **Logique de calcul** | Le statut manager est une information affichée à part ; le regroupement utilisé pour calculer l'écart de perception se fait sur "dans l'équipe au quotidien" vs "hors équipe" — pas sur le statut manager |
| **Besoin** | Que cette information serve un objectif compris (mesurer l'écart de perception), pas juste de la collecte |
| **Émotion** | Neutre |
| **Friction** | Si l'étape est ambiguë ou facultative → données non exploitables pour le calcul d'écart |
| **Opportunité** | Étape obligatoire, en première position, avec une micro-explication ("vos réponses seront comparées de façon agrégée à celles des autres participants") |

## Étape 2 — Remplissage du questionnaire (~50 questions, 4 piliers)

| | |
|---|---|
| **Qui** | Équipier, Manager |
| **Action** | Répond à chaque question en choisissant 1 niveau de maturité (0 à 3) parmi 4 propositions, navigation organisée par pilier |
| **Source des questions** | Référentiel piloté par un fichier Excel ré-importable (versionnable dans le temps) ; l'animateur active/désactive les piliers et questions à utiliser pour chaque session |
| **Support** | Web et mobile |
| **Progression** | Le répondant voit en permanence le nombre de questions restantes et sa progression globale vers la fin du questionnaire |
| **Reprise** | Sauvegarde de l'avancement ; possibilité de reprendre exactement où il s'était arrêté |
| **Besoin** | Progression visible, possibilité de reprendre plus tard, formulations claires |
| **Émotion** | Concentration ; lassitude possible passé un certain nombre de questions ; doute sur certains items techniques (ex: un PO face à des questions Excellence Technique) |
| **Friction** | Longueur (~50 questions) ; questions hors du périmètre du répondant (ex: Excellence Tech pour un PO non technique) ; choix difficile entre 2 niveaux proches |
| **Opportunité** | Regroupement visuel par pilier ; option "je ne sais pas" déjà présente dans la grille à conserver |

## Étape 3 — Soumission

| | |
|---|---|
| **Qui** | Équipier, Manager |
| **Action** | Valide et envoie ses réponses via un bouton "Confirmer" ; peut revenir en arrière modifier une réponse avant cette confirmation |
| **Caractère obligatoire** | Toutes les questions actives de la session doivent être répondues — pas de soumission partielle possible |
| **Verrouillage** | Une fois confirmé, plus aucune modification possible jusqu'à réouverture de la session à la saisie par l'animateur |
| **Fenêtre de session** | Dates d'ouverture et de fermeture de la saisie, paramétrées par l'animateur au lancement |
| **Réévaluation** | Une nouvelle session ne remplace jamais les données d'une session précédente ; les résultats sont présentés en comparaison avec la session antérieure |
| **Besoin** | Confirmation claire que c'est bien pris en compte |
| **Émotion** | Soulagement, parfois curiosité ("qu'est-ce que ça va donner ?") |
| **Friction** | Aucun retour après soumission → sentiment d'avoir rempli "pour rien" |
| **Opportunité** | Message de fin avec horizon de restitution ("résultats partagés lors du prochain point d'équipe") |

## Étape 4 — Agrégation et calcul des écarts

| | |
|---|---|
| **Qui** | Animateur / Coach agile |
| **Action** | Consulte les résultats d'une équipe via un écran dédié (les résultats ne sont jamais visibles directement au répondant) |
| **Deux écrans** | Un écran **non anonyme** (réponses individuelles nominatives, par personne) et un écran **agrégé/anonyme** (résultats consolidés par équipe) |
| **Filtre manager** | Sur les deux écrans (vue équipe uniquement), l'animateur peut activer/désactiver l'inclusion des réponses du/des manager(s) dans l'affichage |
| **Seuil d'anonymat** | Aucun seuil minimum : l'agrégation anonyme s'affiche dès qu'il y a au moins une réponse |
| **Calcul** | Automatique et en temps réel, dès qu'un questionnaire est terminé (pas d'attente de la clôture de session) |
| **Effectif équipe** | Pas de liste d'équipiers pré-paramétrée : l'effectif de l'équipe se déduit du nombre de personnes ayant répondu |
| **Besoin** | Vue par pilier/objectif, avec écart "dans l'équipe" vs "hors équipe" visible |
| **Émotion** | Attente, puis analyse |
| **Friction** | L'écran non anonyme expose les réponses individuelles nominatives — point de vigilance à communiquer clairement aux répondants en amont (transparence), sous peine de générer de la méfiance |
| **Opportunité** | Cadrer dès l'invitation (étape 0) que l'animateur a accès au détail individuel, pour ne pas créer un anonymat perçu qui n'existe pas réellement |

## Étape 5 — Analyse et préparation de la restitution

| | |
|---|---|
| **Qui** | Animateur / Coach agile |
| **Action** | Analyse les résultats agrégés et prépare le format de restitution avant la réunion d'équipe |
| **Format de lecture préalable** | Minimum, maximum et dispersion des réponses par question/pilier ; taux de réponse (nombre de réponses reçues / nombre d'équipiers de l'équipe) |
| **Format de restitution** | Export sous forme de slide |
| **Contenu (écran + slide)** | Un radar de maturité (par pilier) ; des pré-analyses générées à partir du format de lecture préalable ; un commentaire libre, saisi au préalable par l'animateur, intégré à la restitution |
| **Comparaison multi-sessions** | Si l'équipe a déjà rempli un questionnaire précédent, le radar superpose les deux sessions (une couleur par session) ; des commentaires sur les régressions et progressions par pilier sont générés automatiquement |
| **Besoin** | Synthétiser des données brutes en un support exploitable et présentable sans préparation supplémentaire |
| **Émotion** | Concentration, recherche du bon angle pour présenter sans braquer l'équipe |
| **Friction** | Pré-analyses automatiques potentiellement mal calibrées (ex: mettre en avant un écart non significatif faute de contexte) |
| **Opportunité** | Le commentaire libre de l'animateur permet de contextualiser/nuancer une pré-analyse automatique avant restitution |

## Étape 6 — Restitution à l'équipe

| | |
|---|---|
| **Qui** | Animateur / Coach agile, Équipier, Manager |
| **Action** | L'animateur présente lui-même, en réunion d'équipe, le support PPT exporté à l'étape précédente (vue unique, choisie en amont) |
| **Recours possible** | En complément, l'animateur peut aussi montrer l'écran live (avec ou sans manager) si besoin pendant la réunion |
| **Besoin** | Lecture simple (radar par pilier), pas de jugement individuel |
| **Émotion** | Variable : validation si cohérent avec le vécu, surprise si écart fort avec le manager |
| **Friction** | Un écart de perception mal présenté peut être vécu comme une mise en accusation du manager ou de l'équipe |
| **Opportunité** | Cadrer la restitution comme un point de départ de discussion, pas un verdict ; mettre en avant les pistes d'amélioration plutôt que les manques |

## Étape 7 — Consolidation multi-équipes (asynchrone, parallèle)

| | |
|---|---|
| **Qui** | Sponsor / RH / Direction |
| **Action** | Consulte un écran de consolidation dédié, distinct des écrans de l'animateur : soit le radar agrégé de toutes les équipes du département, soit un zoom sur une équipe en particulier |
| **Besoin** | Granularité minimale au niveau équipe (pas d'individu), comparabilité entre équipes et dans le temps |
| **Émotion** | Analytique |
| **Friction** | Risque de comparer/classer les équipes entre elles de façon contre-productive |
| **Opportunité** | Présenter des agrégats par pilier à l'échelle du portefeuille, sans palmarès d'équipes |

---

## Points de friction transverses identifiés (à traiter en conception)

1. **Étape 1 (département/équipe/rôle) doit être structurellement obligatoire** — c'est la donnée qui rend tout le reste exploitable (écart "dans l'équipe"/"hors équipe", consolidation département).
2. **Longueur du questionnaire (~50 questions)** — risque d'abandon, prévoir sauvegarde/reprise (déjà actée à l'étape 2).
3. **Pas d'anonymat réel pour l'animateur** — l'écran non anonyme expose les réponses individuelles nominatives ; à clarifier explicitement avec les répondants dès l'invitation plutôt que de laisser croire à un anonymat qui n'existe pas vis-à-vis de l'animateur.
4. **Restitution = moment sensible** — la mise en forme des écarts de perception (avec/sans manager) doit éviter l'effet "jugement".
5. **Valeur dans le temps** — l'outil n'a de sens que s'il permet de réévaluer et comparer les sessions (radar superposé, régressions/progressions) ; à anticiper dès le modèle de données.
6. **Saisie libre département/équipe** — la tolérance aux fautes d'orthographe en saisie libre peut créer des doublons (ex: "Equipe Alpha" vs "Équipe Alpha") qui fragmentent la consolidation département ; un mécanisme de rapprochement/validation par l'animateur est à prévoir.

*Cette experience map est figée à titre préliminaire ; elle pourra être révisée au fil de la réalisation si de nouveaux besoins apparaissent.*
