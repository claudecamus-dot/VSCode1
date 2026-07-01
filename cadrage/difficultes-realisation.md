# Difficultés de réalisation — Questionnaire de maturité agile/produit

Brouillon initial, basé sur les contraintes identifiées dans [personas.md](personas.md) et [experience-map.md](experience-map.md). À discuter et compléter.

## 1. Techniques

| Difficulté | Pourquoi c'est délicat | Piste de mitigation |
|---|---|---|
| **Import/parsing du fichier Excel** | Le fichier source (cf. grille V3.2 analysée) a une structure assez libre (cellules fusionnées, symboles ▲♦●■, texte concaténé) — pas un format tabulaire propre. Le parseur doit être robuste à des variations de mise en forme entre versions ré-importées. | Définir un gabarit Excel strict (colonnes figées) que l'animateur doit respecter pour le ré-import, avec validation à l'import (erreurs explicites si structure invalide) |
| **Web + mobile** | Navigation par pilier, sauvegarde/reprise et affichage du radar doivent fonctionner aussi bien sur petit écran (mode atelier synchrone, réponse au téléphone) que sur poste de travail | Approche responsive dès la conception des écrans clés (questionnaire, radar) plutôt qu'un mobile "ajouté après" |
| **Sauvegarde/reprise** | Le répondant peut interrompre puis reprendre exactement où il en était, sur potentiellement un autre appareil | Nécessite un compte ou un identifiant de session persistant (pas juste un état local navigateur) |
| **Calcul d'agrégation en temps réel** | Les écrans animateur (anonyme/non anonyme, avec/sans manager) se mettent à jour dès qu'un questionnaire est terminé — implique un recalcul à la volée, pas un batch différé | Calcul à la soumission de chaque questionnaire individuel plutôt qu'un recalcul global systématique |
| **Génération de l'export PPT** | Le slide exporté doit reprendre radar, pré-analyses et commentaire libre de l'animateur, avec mise en forme correcte hors de l'outil | Évaluer une librairie de génération PPT (ou export vers un format intermédiaire) tôt dans la réalisation — risque sous-estimé si traité en fin de projet |
| **Superposition de radars multi-sessions** | Comparer 2 sessions sur le même radar (couleurs différentes) suppose que le référentiel de questions soit resté comparable entre les 2 sessions | Si le fichier Excel a été ré-importé avec des questions modifiées entre les deux sessions, la comparaison terme à terme peut devenir impossible ou trompeuse — à clarifier en conception |

## 2. Fonctionnelles / Métier

| Difficulté | Pourquoi c'est délicat | Piste de mitigation |
|---|---|---|
| **Activation sélective de piliers/questions** | L'animateur peut activer/désactiver des piliers et questions par session — la comparaison multi-sessions et la consolidation département doivent gérer des configurations différentes d'une équipe/session à l'autre | Définir clairement ce qui se passe quand une question est désactivée puis réactivée, ou différente entre deux sessions comparées |
| **Pré-analyses automatiques (min/max/dispersion)** | Une lecture automatique mal calibrée peut mettre en avant un écart non significatif (déjà noté comme risque en expérience map) | Garder ces pré-analyses comme un point de départ pour l'animateur, jamais une conclusion affichée telle quelle aux équipiers |
| **Saisie libre département/équipe** | Tolérance aux fautes d'orthographe en saisie libre = risque de doublons ("Equipe Alpha" / "Équipe Alpha") qui fragmentent la consolidation département | Mécanisme de rapprochement/validation par l'animateur avant que les doublons n'impactent les agrégats |
| **Rôles paramétrables mais logique d'écart fixe** | La liste de rôles est libre, mais le calcul d'écart repose sur 2 attributs fixes (manager oui/non, dans l'équipe oui/non) — il faut s'assurer que ces 2 questions restent toujours posées même si la liste de rôles change | Verrouiller ces 2 questions comme non désactivables, contrairement aux questions du référentiel Excel |

## 3. Organisationnelles / Humaines

| Difficulté | Pourquoi c'est délicat | Piste de mitigation |
|---|---|---|
| **Absence d'anonymat réel vis-à-vis de l'animateur** | L'animateur voit les réponses nominatives individuelles — un répondant qui croit répondre anonymement peut se sentir trahi s'il l'apprend après coup | Communication explicite et obligatoire dès l'invitation (étape 0) : "vos réponses individuelles sont visibles par l'animateur" |
| **Manager répondant dans une équipe où il est aussi membre** | Le cas "manager = équipier" peut brouiller la lecture de l'écart de perception si mal expliqué en restitution | Documenter ce cas particulier dans le mode d'emploi de la restitution, pas seulement dans le modèle de données |
| **Adoption par les équipes** | Risque de lassitude si le questionnaire est perçu comme un exercice purement administratif (déjà identifié en persona Équipier) | Le portage du message (objectif, usage des données) dépend de l'animateur — hors du périmètre outil, mais à anticiper dans la documentation/formation des animateurs |

## 4. Données / Confidentialité

| Difficulté | Pourquoi c'est délicat | Piste de mitigation |
|---|---|---|
| **Pas de seuil minimal d'anonymat** | Décision actée : l'agrégation anonyme s'affiche dès 1 réponse — sur une petite équipe, "agrégé" peut revenir à afficher la réponse d'une seule personne | Assumé comme un choix produit ; à minima le signaler clairement à l'écran agrégé quand l'échantillon est très faible (ex: badge "1 réponse") |
| **Conservation des données dans le temps** | La comparaison multi-sessions impose de conserver les réponses brutes d'une session à l'autre, potentiellement sur plusieurs années | Politique de rétention/suppression à définir (durée de conservation, qui peut purger) |

---

*Brouillon à valider/amender avant de passer au découpage Epics/US.*
