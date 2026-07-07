---
updated: 2026-07-07
confidence: confirmed
agents: [onboarder]
---

# Domaine métier — Questionnaire de maturité agile/produit

## Vue d'ensemble

L'outil sert à évaluer la maturité agile/produit d'une équipe à partir d'une
grille de référence (fichier Excel, ~50 questions réparties en 4 piliers), à
en restituer une lecture agrégée (radar, dispersion) et à produire un support
de restitution PowerPoint destiné à être présenté en réunion d'équipe. Une
vue de consolidation multi-équipes existe pour une lecture au niveau
département (sponsor/RH/direction). `CONFIRMÉ` — onboarder · 2026-07-07 · README.md:3-8

## Vocabulaire transversal (à préserver tel quel dans le code)

| Terme | Sens |
|---|---|
| **Pilier** | Axe du référentiel (ex. Équipe Produit, Excellence Technique, Culture Agile, Agilité à l'échelle) |
| **Sous-catégorie / objectif** | Regroupement de questions à l'intérieur d'un pilier |
| **Question** | Item évalué, avec 4 **niveaux** de réponse (0 à 3), chacun associé à une valeur numérique |
| **Session** | Une campagne d'évaluation pour une équipe donnée (dates d'ouverture/fermeture) |
| **Animateur** | Personne qui pilote une session (coach agile, manager) — accès à l'espace d'administration |
| **Répondant** | Personne qui répond au questionnaire (équipier ou manager) |
| **Pilotage** | Vue consolidée par département, pour sponsor/RH/direction |

`CONFIRMÉ` — onboarder · 2026-07-07 · CLAUDE.md:10-14, cadrage/experience-map.md

## Personas

1. **Répondant – Équipier** (PO, Scrum Master, Tech Lead, développeur,
   testeur...) — fait un état des lieux honnête de son quotidien d'équipe ;
   craint que ses réponses individuelles remontent nommément à son manager.
2. **Répondant – Manager direct** — répond au *même* questionnaire que
   l'équipe pour permettre le calcul d'un écart de perception ; risque de
   biais de désirabilité managériale (réponses trop optimistes).
3. **Animateur / Coach agile** — administre la session, suit le taux de
   complétion, consulte les résultats agrégés (avec/sans manager), exporte la
   restitution. Usage répété, sur plusieurs équipes et dans le temps.
4. **Sponsor / RH / Direction** — vision consolidée multi-équipes par pilier,
   pour orienter les investissements (formation, coaching, organisation) ;
   n'a accès qu'à une granularité au moins équipe (jamais individuelle).

`CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/personas.md:1-86

<div class="chip-row">
  <span class="chip-pill">Répondant équipier</span>
  <span class="chip-pill">Répondant manager</span>
  <span class="chip-pill">Animateur / coach agile</span>
  <span class="chip-pill">Sponsor / RH / direction</span>
</div>

## Parcours (experience map, 8 étapes)

0. **Invitation** à la session (email, atelier synchrone ou fenêtre
   asynchrone) — friction : manque de contexte sur l'objectif → faible taux de
   réponse.
1. **Identification du rôle** *(point critique)* — nom/prénom (nominatif,
   annoncé explicitement), département, équipe, rôle, statut manager, "dans
   l'équipe au quotidien" — cette dernière paire de champs porte le calcul de
   l'écart de perception (pas le statut manager seul).
2. **Remplissage du questionnaire** (~50 questions, 4 piliers), navigation
   par pilier, sauvegarde/reprise par pilier complété.
3. **Soumission** — verrouillage définitif jusqu'à réouverture par l'animateur ;
   pas de soumission partielle possible.
4. **Agrégation et calcul des écarts** — calcul automatique en temps réel dès
   qu'un questionnaire est soumis, aucun seuil minimal d'anonymat (dès 1
   réponse), un écran nominatif existe pour l'animateur.
5. **Analyse et préparation de la restitution** — pré-analyses (min/max/dispersion,
   taux de réponse), commentaire libre de l'animateur pour contextualiser.
6. **Restitution à l'équipe** — support PPT présenté par l'animateur, écran
   live possible en complément.
7. **Consolidation multi-équipes** (asynchrone, parallèle) — écran dédié
   sponsor/RH/direction, radar par département avec zoom équipe.

`CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/experience-map.md:1-118

## Difficultés identifiées (cadrage)

- Parsing d'un fichier Excel à structure peu tabulaire (cellules fusionnées,
  symboles, texte concaténé) — nécessite un gabarit strict et une validation
  stricte à l'import.
- Absence de seuil minimal d'anonymat — assumé comme choix produit, mais à
  signaler à l'écran quand l'échantillon est très faible.
- Absence d'anonymat réel vis-à-vis de l'animateur — à communiquer
  explicitement dès l'invitation.
- Saisie libre département/équipe → risque de doublons fragmentant la
  consolidation, nécessitant un mécanisme de fusion.

`CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/difficultes-realisation.md:1-42

## Découpage fonctionnel (Epics)

11 Epics identifiés dans `cadrage/epics-us.md`, dont 7 couverts par le MVP
livré (Epics 1 à 7) et 4 au stade réflexion (Epics 8 à 11 : packaging,
environnements, authentification, multi-clients). Voir
[`technical/architecture.md`](../technical/architecture.md) pour l'état
d'implémentation détaillé et [`index.md`](../index.md) pour la frise de
roadmap. `CONFIRMÉ` — onboarder · 2026-07-07 · cadrage/epics-us.md:1-127, .roadmap/roadmap.json

## Utilisateurs cibles

Organisations menant une démarche de transformation agile/produit,
représentées par un animateur/coach interne ou externe qui déploie l'outil
équipe par équipe, avec une lecture consolidée possible au niveau département
pour le sponsoring (RH, direction de programme). `DÉDUIT` — onboarder · 2026-07-07 · synthèse de cadrage/personas.md et cadrage/epics-us.md (Epic 11 anticipe un usage "cabinet de conseil intervenant chez plusieurs clients")
