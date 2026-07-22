# Points d'amélioration — export PPT de restitution

> État au **2026-07-08**, complété le **2026-07-15** (#6, #9 — retours d'un
> projet frère réutilisant ce même kit). Objectif : augmenter la qualité du deck, respecter le
> template OCTO, formes plus travaillées — **sans quitter python-pptx** (le
> `.pptx` OCTO fait foi). Priorisé impact / effort. Se lit avec
> [`template-octo.md`](template-octo.md) et [`design-system-octo.md`](design-system-octo.md).

## Décisions d'architecture actées

- **Rester sur `python-pptx`** construit sur le template OCTO. Sortie éditable +
  chrome natif conservés.
- **PptxGenJS écarté** : ne sait pas charger un `.pptx` existant → tout à
  redéfinir en code, fidélité template dégradée. Incompatible avec « respecter le
  template » + « formes travaillées ». (Replis si besoin futur d'un export SANS
  template riche : `pptx-automizer`, ou HTML rendu par un navigateur headless —
  mais sortie non éditable dans PowerPoint.)
- **Source de vérité couleur = le thème du template** (= charte OCTO navy/cyan/
  slate). Palette par pilier gardée pour les **données** (alignée radar).

## Fait & vérifié

| # | Amélioration | Statut | Preuve |
| --- | --- | --- | --- |
| 1 | **Police de marque** — le contenu dessiné était en Arial (mineure du thème) alors que titres/placeholders sont en Outfit. Détection `police_marque()` + application. | ✅ Fait | PowerPoint COM : 0 zone Arial (37 avant) ; rendu OK ; tests projet ✅ |
| 2 | **Neutres + accent depuis le thème** — `pptx_deck.appliquer_theme()` lit `dk1/lt2/accent3/accent5/accent6` du thème et remplace `INK/MUTED/LINE/TRACK` + introduit `CYAN` (accent) ; filet de `_surtitre` et barre du panneau commentaire radar passés en cyan. | ✅ Fait | Rendu PowerPoint COM avant/après (13 slides, gabarit `test-export-ppt.py`) : `D.INK=#0E2356` (navy), `D.MUTED=#586586` (slate 600), `D.LINE=#CFD3DD` (slate 200/accent5), `D.TRACK=#E7E9EE` (slate 100/accent6), `D.CYAN=#00D2DD` (accent3) — conforme à la table de `design-system-octo.md`. Filet sous « MATURITÉ PAR PILIER »/« ÉVOLUTION VS » et barre du panneau « COMMENTAIRE DE RESTITUTION » visiblement cyan (navy avant). Aucun résidu Arial. Aucune ombre/gradient. **Bug trouvé et corrigé pendant la vérification** : `add_hbar/add_gauge/add_range_bar` avaient `track=TRACK` en défaut de paramètre — figé à la valeur de `TRACK` **au chargement du module**, donc jamais mis à jour par `appliquer_theme()` pour les appelants qui ne passaient pas `track=` explicitement (quasi tous) → toutes les pistes de barres/jauge restaient sur l'ancien gris `#eef1f7` au lieu du slate 100 du thème (`#E7E9EE`), invisible à l'œil (couleurs très proches) mais détecté par `test-ppt-charte.py` (assertion palette). Corrigé en `track=None` + résolution de `TRACK` à l'appel. `test-ppt-charte.py` : palette 100% conforme après correction. |
| 3 | **Radar vectoriel** — remplace le PNG rasterisé par Puppeteer par des formes natives python-pptx (`pptx_deck.add_polygon` en freeform + `add_line` en connecteurs) : grille de niveaux, polygone « précédent » pointillé, polygone « courant » en aire semi-transparente (alpha OOXML), puce + libellé colorés par pilier, légende. `radarImage` n'est plus consommé par le générateur (et le module serveur `radar-svg.js` + son test `test-radar.js` + la rasterisation Puppeteer, devenus code mort, ont été retirés le 2026-07-21 — l'export est 100 % Python). | ✅ Fait | `test-export-ppt.py` (radar à 12 axes réalistes + libellé long + cas <3 axes) : `TOUS LES TESTS PASSENT`. `test-ppt-charte.py` : police/tailles/palette/alignement OK (1 point ouvert, voir #8 ci-dessous). Rendu PowerPoint COM (avant/après plusieurs itérations) : grille + polygones + puces + légende nets à toute résolution, aucun chevauchement de libellés, badge n° de slide dégagé, cas sans comparaison toujours centré. **Itéré sur plusieurs défauts trouvés uniquement au rendu** (RG, pas géométrie) : légende du radar et liste « évolution » qui se chevauchaient (largeurs devinées vs largeur réelle nécessaire), mots seuls trop longs pour tenir sans coupure (« Excellence », « l'entreprise ») → largeur de légende **absolue** (`RADAR_LEGEND_W`) + cote du cercle plafonné (`RADAR_COTE_MAX`) au lieu d'un ratio, hauteurs de ligne recalculées sur le contenu réel. **4 retours complémentaires du coordinateur, tous traités** : (1) en-tête de section « MATURITÉ PAR OBJECTIF » + réglette d'échelle 0-3 au-dessus du cercle (`_surtitre` + `_echelle_radar`, même grammaire que la vue d'ensemble) ; (2) parenthèses de libellé (« Ressources humaines (formations, ...) ») retirées **partout** via `_nettoyer_label()` intégré dans `joli_nom()` (donc valable sur toutes les slides, pas seulement le radar) — verrouillé par un test anti-régression ; (3) réglette 0/1/2/3 ajoutée **[retirée depuis — voir Finition 2026-07-22 ci-dessous : `_echelle_radar` supprimée, espace rendu au cercle]** ; (4) voir « Décision ouverte » ci-dessous (non tranchée). **Résidu trouvé par relecture du rendu et corrigé** : « Fonctionnement »/« Synchronisation » (mots composés longs) se coupaient encore au milieu SANS trait d'union sur les libellés d'axe côté gauche (le plancher `box_w=0.65in` ne suffisait pas, même après le fix légende) — ajout de `_taille_libelle_axe()` (réduction bornée à 7pt du libellé concerné) puis `_forcer_cesure()` (insère un vrai trait d'union au point de coupure si même le plancher de taille ne suffit pas). Revérifié par rendu réel : coupure désormais propre (« Fonctionne-ment agile à l'échelle », « Synchroni-sation inter-équipes »). |

| — | **Revue design 2026-07-21** : (a) doublon « Équipe **Équipe** X » sur la couverture corrigé (`server.js`, préfixe « Équipe » conditionnel) ; (b) widget dispersion (slides Points forts / Points d'attention) — le repère de **moyenne est désormais libellé « moy. X.X »** sous le point, ce qui lève l'ambiguïté avec le nombre « écart-type » (constat superviseur, run #3). La colonne « moyenne » est passée aux items `dispersion`/`accords` (elle manquait, d'où un repère invisible). | ✅ Fait | Rendu PowerPoint COM : couverture « Équipe Alpha — DSI » ; slides 4/5 avec « moy. X.X » sous chaque repère. Géométrie + charte + npm test + lint verts. |

## Décision tranchée (2026-07-21) — radar conservé et amélioré

**Radar vs tableau ?** → **radar conservé** (arbitrage utilisateur du 2026-07-21 sur
rendu réel des deux surfaces ; les options A/B/C ci-dessous avaient été écartées, la
revue est repartie d'une exploration large). Le radar est **amélioré** plutôt que
remplacé : libellés d'axe en **foncé neutre** (`#14233b` web / `D.INK` PPT) + **pastille
couleur du pilier** posée sur l'axe (au lieu de colorer le texte) — même motif que la
légende ; cela règle d'un coup le contraste GOLD (#8) et le bruit visuel. Appliqué aux
deux surfaces (web `resultats.html`/`pilotage.html`, PPT `_dessiner_radar`), vérifié au
rendu réel (screenshot web + PowerPoint COM), garde-fou `scripts/test-contraste-radar.js`.

Historique — 3 options réelles rendues (PowerPoint COM, Squad Paiement 12 objectifs)
lors de l'arbitrage initial, **toutes écartées** :

- **A — Radar vectoriel** (actuel, dans le deck). Lecture globale de la forme
  (déséquilibres visibles d'un coup d'œil) ; libellés d'axe contraints en
  largeur sur un radar dense (10-12 axes) — un mot très long peut encore se
  couper (ex. « Fonctionne-ment agile à l'échelle ») malgré les itérations.
- **B — Tableau 2 colonnes** (prototype, pas dans le deck) : pilier (puce) +
  objectif + barre de score + delta d'évolution PAR OBJECTIF (le radar ne
  montre le delta que par PILIER, pas par objectif). Très lisible, aucune
  coupure de mot, mais perd la lecture de silhouette globale.
- **C — Barres groupées par pilier** (prototype, pas dans le deck) : une ligne
  par objectif, barres pleine largeur, séparateurs entre groupes de pilier.
  Même grammaire que la vue d'ensemble (cohérence visuelle forte), très
  scannable, mais aussi 1 seule colonne = plus de hauteur par ligne (12 lignes
  serrées).

Rendus A/B/C : prototypes de session non committés. **Tranché le 2026-07-21** — radar
conservé et amélioré (voir ci-dessus) ; A/B/C écartées. Résidu connu : sur un radar
dense, un libellé très long peut encore finir en **ellipse visible** (repli volontaire,
cf. « Rappels de méthode » — jamais de coupure silencieuse). Réduire l'ellipse = arbitrage
layout (plus de lignes / cercle réduit) à investir séparément si besoin.

## Revue inspirée des decks frères VSCode3/VSCode4 (2026-07-22, commit 274a424)

Revue du deck **équipe** en s'inspirant des decks OCTO des projets frères sur le même
template : `VSCode3/docs/cadrage-ppt/…cadrage-synthese.pptx` (32 slides, `generate_deck.py`)
et `VSCode4/Exports/…dispositif écoute…v6.pptx` (15 slides). Langage visuel observé :
titres assertifs `SECTION · phrase`, cartes à filet coloré, **pills** (CONFIRMÉ/DÉCISION),
**bandeaux takeaway** (navy fort ou gris doux), notation en **pastilles**, **matrice 2×2**,
**filet cyan** sous les labels de section.

**Constat structurant** : ces decks sont colorés parce que leurs cartes sont dans un cadre
**neutre** (verbatims, recommandations). Les slides « Points forts / Points d'attention » de
CE deck sont monochromes **exprès** (décision #1 : la couleur du pilier — vert/rouge — entre
en collision avec le sens force/faiblesse de la colonne). Re-colorer le filet des cartes en
couleur pilier **rouvrirait #1** → écarté.

**Retenu (arbitrage utilisateur, 1 enrichissement sur 4)** : **en-têtes de colonne épurés**.
`_entete_colonne` — le carré navy plein + glyphe blanc devient le glyphe de sens (▲/▼) en
navy **sans fond** + **filet cyan** de clôture (même grammaire que `_surtitre` /
« MATURITÉ PAR PILIER » de la vue d'ensemble). #1 préservée : le sens reste porté par le
glyphe, le cyan est un pur accent de charte. Vérifié rendu PowerPoint COM (slides 4 + 5).

**Écartés par l'utilisateur** (ne pas re-proposer sans nouvelle demande) : pastille couleur
du pilier sur les cartes (identité via objet graphique, aurait été conforme #1) ; retrait de
la redondance « 0.0 écart-type » + pastille « consensus » sur les cartes d'accord ; bandeau
de synthèse « so what » en bas des slides Points.

## Finition (2026-07-22) — suite de la revue déléguée (ppt-designer)

Après le découplage couleur/sémantique (#1, commit 564045d) et la pastille radar (#2),
quatre finitions arbitrées sur rendu réel, commit 561b956 :

- **#3 — réglette horizontale 0-3 du radar retirée** (arbitrage utilisateur : « la
  retirer purement »). Le cercle ne portant qu'une seule série de valeurs 0-3 déjà
  lisible à la forme, la réglette faisait doublon ; l'espace vertical libéré est rendu
  au cercle (`radar_h`/`top_radar` recalculés sans `RADAR_ECHELLE_H`). Fonction
  `_echelle_radar` + constante devenues mortes, supprimées. Ceci **remplace** l'ajout
  de réglette mentionné dans la ligne #3 du tableau ci-dessus (grammaire historique de
  la vectorisation).
- **#5 — widget d'amplitude unifié** (`_widget_amplitude`, mutualisé dispersion/accords) :
  quand min = max (accord total intra-équipe), plus de réglette à écart-type 0 illisible
  mais une pastille « moy. X.X · consensus » ; sinon barre d'amplitude en slate + marqueur
  de moyenne (barre en slate et non navy pour ne pas se confondre avec le marqueur —
  régression repérée puis corrigée au rendu lors du #1).
- **#7 — cartes des slides « points » sans ligne « moy. »** : centrées sur la hauteur
  réelle du contenu (`_CARTE_H_FIXE_SCORES`) au lieu de la hauteur incluant la moyenne
  → supprime le vide vertical.
- **#8 — jauge « vue d'ensemble » sans comparaison** : rythme vertical resserré
  (`bloc_h` 0.26+.55 → 0.30+.56).

Vérifié : `test-export-ppt` (géométrie 0 problème), `test-ppt-charte`, `npm test` complet,
`lint` verts ; **rendu PowerPoint COM de la slide radar** (réglette absente, cercle
agrandi, légende + panneau évolution intacts, aucune régression). La revue design PPT est
**close** côté code — tous les constats #1-#8 traités. Reste hors code : coquilles du
référentiel (« Existe-il », « sont organisé ») à corriger dans la grille Excel source.

## Nouveau point trouvé (accessibilité, pas encore traité)

| # | Amélioration | Détail | Effort | Statut |
| --- | --- | --- | --- | --- |
| 8 | **Contraste GOLD insuffisant** | `D.PALETTE[3]` (`#b8860b`, or/goldenrod — 4ᵉ couleur de pilier) sur fond blanc : contraste **3.25:1**, sous le seuil WCAG AA 4.5:1 pour du texte normal (passe le seuil 3.0:1 « large texte » des cartes, mais PAS celui des libellés d'axe radar, désormais du vrai texte vectoriel testable — invisible tant que le radar était un PNG opaque). Pré-existant (même couleur utilisée côté web, `resultats.html`), révélé par la vectorisation, pas une régression du radar lui-même. **Résolu le 2026-07-21** : la couleur du pilier ne colore plus le TEXTE mais une PASTILLE (objet graphique, seuil WCAG 1.4.11 = 3:1, que le gold passe à 3.25:1) ; les libellés d'axe passent en foncé neutre (texte, seuil 4.5:1 largement tenu à ~15:1). Appliqué web + PPT, codifié par `scripts/test-contraste-radar.js` (vérifie aussi que les 3 palettes restent identiques). | S | ✅ résolu (2026-07-21) |
| 9 | **Encart numéro du layout « 50 - Chapitre » : "01" passe à la ligne quel que soit le corps de police** | Trouvé sur un projet frère en réutilisant ce même layout via python-pptx : le placeholder idx=1 (le petit encart numéro, 0.55×0.47in) hérite du style de liste `lvl1pPr` du master (`marL=457200` + `indent=-317500`, un retrait de puce de 0.5in prévu pour de larges encarts de contenu ailleurs dans ce master) — dans un encart aussi étroit, ce retrait mange presque toute la largeur, donc "0" et "1" wrappent chacun sur leur ligne, peu importe la taille de police (testé jusqu'à 8pt). Corrigé en forçant `marL=0`/`indent=0`/`buNone` au niveau du paragraphe (pas du run) — python-pptx n'expose pas ces attributs, manipulation XML directe requise. Concerne potentiellement toute réutilisation de ce layout via python-pptx (pas seulement le projet frère) puisque le master est le même fichier `template-octo.pptx`. | S | ✅ trouvé + corrigé (ailleurs) — à vérifier si ce projet réutilise un jour ce layout |

## Backlog (ordre impact / effort)

| # | Amélioration | Détail | Effort | Statut |
| --- | --- | --- | --- | --- |
| 5 | **Décision palette (tranchée)** | Chrome = thème OCTO (navy/cyan/slate) ; **données = palette par pilier** conservée (radar). Pas de fusion. | — | ✅ décidé, appliqué avec #2 |
| 4 | **Icônes outline par pilier** | Pictogrammes stroke (charte : jamais filled), navy/cyan, pour muscler l'infographie. | M | ⏳ |
| 6 | **Cadres `round2DiagRect`** | Utiliser les cadres photo du template (couverture/intercalaires) via `pptx-framed-image`. **Approche validée sur un projet frère (2026-07-15)** : le skill a gagné `stock_images.py` (vraie photo libre de droit via Openverse CC0, sans clé API, repli sur `nature_images.py` procédural hors-ligne) — testé sur les 3 slides « 50 - Chapitre » + un layout « cadre blanc » d'un autre deck sur ce même template, rendu réel vérifié. Reste ⏳ pour **ce** projet : `export-restitution-ppt.py` n'utilise pas encore ces cadres lui-même. | S-M | ⏳ (skill enrichi, application au deck de ce projet non faite) |
| 7 | **Nouveaux patterns de slide** | S'inspirer de `KPI_GRID`, `MATRICE_CONTEXTE_CARDS`, `COMPARAISON_2_OPTIONS` (design system) pour enrichir la restitution. | M-L | 💡 idée |

## Rappels de méthode (non négociables)

- **Vérifier par rendu réel** (PowerPoint COM sur ce poste), pas seulement la
  géométrie — un mélange de polices/une collision ne se voit qu'au rendu.
- **Ne jamais tronquer silencieusement** : layout piloté par le contenu (mesure
  → dimensionnement → réduction de police bornée → au pire ellipse visible).
- Tout changement visuel : capture **avant/après** côte à côte.
- **`test-ppt-charte.py`** (police/couleurs/contraste/alignement sur le VRAI
  template) est un filet de sécurité que le rendu visuel seul ne remplace pas
  — il a trouvé le bug `track=TRACK` figé (#2) invisible à l'œil. Le lancer
  après tout changement de couleur/police, pas seulement `test-export-ppt.py`.

*Lié : mémoire projet *project-fidelite-charte-ppt*, [`ppt-toolkit.md`](ppt-toolkit.md).*
