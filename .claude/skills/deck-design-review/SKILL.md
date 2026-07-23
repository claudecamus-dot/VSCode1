---
name: deck-design-review
description: Revue de design slide par slide du deck de restitution généré par CE projet (US6.4) — construire le VRAI export, rendre TOUTES les slides, et passer chaque type de slide contre son propre contrat de design (couverture, vue d'ensemble, radar de maturité, points d'attention, par équipe et par département). À lancer avant de déclarer terminé un changement de design du deck, quand l'utilisateur signale que le PPT exporté « n'est pas au niveau », ou comme étape de revue du playbook export-ppt-verifie.
---

# deck-design-review — la revue de design du deck ENTIER

`pptx-verify` dit **comment** regarder (rendre + zoomer + checklist générique) ;
`restitution-deck-design` dit **ce qui fait pro** en général ; `restitution-ppt`
dit comment le deck est construit. Ce skill ajoute le **contrat par slide de CE
deck** (méthode importée du projet frère VSCode2, constat 2026-07-22 : plusieurs
allers-retours « toujours KO » faute de revoir chaque slide contre SA définition
— pas une impression d'ensemble).

## 0. Sur le BON artefact, TOUTES les slides

- Exporter par le **vrai chemin** : l'app qui tourne
  (`GET /api/sessions/:id/export-ppt`, payload construit par `server.js`) — pas
  seulement `python app/scripts/export-restitution-ppt.py data.json out.pptx`
  avec un payload synthétique. En cas de doute, comparer les deux : s'ils
  diffèrent, le payload de test est périmé par rapport au contrat serveur
  (mémoire projet `feedback_verifier_avec_outils_projet`).
- Le deck doit contenir **tous les types de blocs** : au moins une équipe ET un
  département consolidé (≥2 équipes), avec et sans comparaison précédente — les
  branches sans `comparaison`/sans `precedent` ont leurs propres défauts (encart
  commentaire sur-étiré, colonnes vides).
- Rendre **toutes** les slides (`render-pptx.ps1` de la skill `pptx-verify`,
  PowerPoint COM — seule voie image sur ce poste, mémoire
  `reference_rendu_pptx_verification`), pas un échantillon.

## 1. Contrat par type de slide

Chaque bloc (équipe ou département) produit **5 slides** depuis la scission du
2026-07-22 (radar dédié agrandi + slide progression) — un deck de 3 blocs = 16
slides (1 couverture + 3×5).

| Slide | Contrat (au rendu) |
| --- | --- |
| Couverture | Layout OCTO de couverture (layout 8, trouvé par `_trouver_layout`/`COUV_PATTERNS`) : `titre`, `sousTitre`, « OCTO Technology », `date`. Jamais un repli dessiné à la main. |
| Vue d'ensemble | Jauge « moyenne globale » + évolution ; une barre colorée par pilier (palette du radar, IDENTIQUE au web) avec tendance ▲=▼ ; bande basse chips « point fort / à renforcer » qui s'arrête à `BORD_DROIT` (9.15in — jamais sous le badge n° de page). |
| Radar de maturité | Slide DÉDIÉE : radar **vectoriel** (`_dessiner_radar`, formes natives — jamais un PNG) sur toute la hauteur de contenu, légende couleurs/séries VERTICALE compacte à droite (`LEGENDE_W` 1.95in) ; cercle centré, libellés d'axe sans ellipse ni collision ; libellés ≥ le plancher absolu `RADAR_LEGEND_W`/`RADAR_COTE_MAX` (sinon césure mi-mot). Moins de 3 objectifs → message « Radar indisponible », jamais une forme déformée. |
| Progression & commentaire | Commentaire de restitution en callout pleine largeur à barre accent, dimensionné à son contenu ; puis évolution par pilier (précédent → courant, barre + delta). Sans comparaison : pas de grand panneau vide. |
| Points forts | 2 colonnes de cartes arrêtées à `BORD_DROIT` ; taille de texte de carte COMMUNE avec la slide points d'attention (`_taille_cartes_bloc`) ; barre de score + `_valeur_cote_barre`. |
| Points d'attention | Cartes désaccords (barre min–max + marqueur moyenne) et scores faibles (barre de score) ; valeur à côté d'une barre via `_valeur_cote_barre` (cluster centré sur la ligne médiane) ; colonnes arrêtées à `BORD_DROIT` ; libellés en clair (« écart-type », jamais « é-t »). |
| Département | Mêmes 5 slides que l'équipe + `nbEquipes` visible ; vérifier spécifiquement la branche sans historique (le grand panneau vide a déjà été vu ici). |

## 2. Transversal (tout le deck, à chaque revue)

1. **Police** : police de marque du template partout (`police_marque`, Outfit sur
   le template OCTO) — jamais une police non installée forcée (elle rend en
   substitution). Vérifié par `test-ppt-charte.py`.
2. **Échelle** : toute taille vient de `D.TYPE` ; aucun point-size littéral.
3. **Couleur** : palette pilier = celle du web (`test-contraste-radar.js` verrouille
   l'identité) ; couleurs limitées à la palette approuvée + contraste WCAG AA
   (`test-ppt-charte.py`).
4. **Composants identiques partout** : même carte, même callout, même barre d'une
   slide à l'autre — un composant qui varie est un défaut.
5. **Chrome du template** : rien ne touche le badge n° de page (bas-droite ~x≥9.45in),
   le logo, le pied. Zoomer ces zones (`crop-png.ps1`) au moindre doute.
6. **Noms nettoyés** : jamais de suffixe parenthésé de référentiel au rendu
   (`joli_nom()`/`_nettoyer_label()` doit couvrir tout nouveau libellé affiché).
7. **Texte dans sa boîte** : `verifier_debordements_texte` à zéro (filet pessimiste —
   la géométrie ne voit que les bords des formes, pas le repli réel du texte).

## 3. Boucle

Rendre → défauts listés par n° de slide (crops si subtil) → corriger → re-rendre
→ **re-regarder** (jamais « corrigé » sans re-rendu). Tout défaut visuel corrigé
devient un invariant testé (`app/scripts/test-ppt-charte.py` /
`test-export-ppt.py` — règle R4 du projet) : le test verrouille le défaut trouvé,
l'œil trouve le suivant. Pour un changement d'intention de design : validation
UTILISATEUR sur le rendu réel avant commit (pptx-verify §6, mémoire projet
`feedback_validation_rendu_avant_commit_ppt`).
