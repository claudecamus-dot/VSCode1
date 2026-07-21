"""Genere un support de restitution PPT (template OCTO) — style INFOGRAPHIE (US6.4).

Usage : python export-restitution-ppt.py <donnees.json> <sortie.pptx> [modele.pptx]

Le template du modele est, par ordre de priorite : l'argument [modele.pptx], la
variable d'env TEMPLATE_PPTX, sinon le template OCTO par defaut. La couverture et le
layout "titre seul" sont reperes par NOM (repli sur indices), et la couleur d'accent
de marque (jauge, callout) est derivee du theme du modele — voir construire().

Structure : 1 couverture (layout OCTO inchange), puis pour chaque "bloc" (une
equipe, ou un departement consolidant >= 2 equipes) 4 slides :
  1. Vue d'ensemble  — jauge "moyenne globale" + barres de maturite par pilier
                       (couleurs du radar) + chips point fort / a renforcer.
  2. Radar           — radar par objectif (image SVG facon web) + commentaire de
                       restitution en encart + evolution par pilier.
  3. Points forts    — cartes (vert) : scores les plus hauts et meilleurs
                       accords (dispersion la plus faible), pendant positif de
                       la slide suivante.
  4. Points attention— cartes : plus forts desaccords (dispersion) et scores
                       les plus faibles.

On garde le chrome OCTO (logo, pied de page, n° de slide) via le layout "Titre
seul" ; l'infographie est dessinee dans la zone de contenu. Un controle
geometrique (pptx_deck.verifier_geometrie) garantit qu'aucune forme ne deborde.
Les cartes de points forts/attention adaptent leur police a la longueur des
phrases (pptx_deck.ajuster_police) : un cap fixe a 2 lignes faisait deborder
les questions longues du referentiel — voir _cartes_colonne.

Le serveur Node calcule tout et passe le JSON ; ce script ne touche pas a la base.
"""
import sys
import os
import json
import math
import re
from pptx import Presentation
from pptx.util import Inches
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pptx_deck as D

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "..", "template ppt", "template.pptx")
# Layouts repérés par NOM (robuste si on fournit un autre template dont l'ordre
# des layouts diffère), avec repli sur l'indice du template OCTO d'origine.
LAYOUT_COUVERTURE = 8   # repli : "40 - Couverture [1]"
LAYOUT_TITRE_SEUL = 5   # repli : "04 - Titre seul" : garde logo/footer, titre OCTO
COUV_PATTERNS = ("couverture", "cover", "title slide")
TITRE_PATTERNS = ("titre seul", "title only", "title-only")

# Zone de contenu sous le titre (slide 10 x 5.625 in).
CONTENU_TOP = 1.15
CONTENU_BOTTOM = 5.45
MARGE_X = 0.55
RADIUS = 0.08          # rayon des coins arrondis — coherent sur tout le deck
FOND_PANNEAU = "#f7f8fb"   # gris tres clair des encarts
# Bord droit "sur" : tout contenu pleine largeur du bas (bandeau, cartes) s'arrete
# ici pour degager le badge n° de slide du template OCTO (coin bas-droit), qu'il
# recouvrirait sinon. Meme limite que le cluster numerique de la slide radar.
BORD_DROIT = 9.15
# Couleur d'accent de marque (jauge globale, barre d'accent du callout). Par defaut
# le bleu de la palette ; construire() la remplace par la couleur primaire du theme
# du template fourni (charte du modele). Les couleurs de pilier, elles, restent
# alignees sur le radar et ne sont PAS derivees du theme.
ACCENT = D.PALETTE[0]
# Accent secondaire de marque (filets de section, barre du callout) : le cyan de
# la charte. Sourcé du thème du template par construire() (D.appliquer_theme).
CYAN = D.CYAN
# Hauteur reelle d'une ligne de question (small 10.5pt) dans une carte : ~0.17in
# de texte + un peu de marge. L'ancienne valeur (0.235) sur-estimait et creusait
# un vide entre la question et le couple contexte/barre.
LH_QUESTION = 0.195


def fmt(x):
    return "—" if x is None else f"{x:.1f}"


# Les libelles de piliers viennent de l'Excel en "Title Case" maladroit
# ("Culture De L'Entreprise Agile", "Agilite A L'Echelle") : peu lisibles. On
# les remet en casse de phrase FR — seul le premier mot (et les acronymes connus)
# prend une majuscule — et on restaure les accents des cas frequents.
_ACRONYMES = {"devops", "rh", "ttm", "po", "kpi", "ci", "cd"}
_ACCENTS = {"a": "à", "agilite": "agilité", "echelle": "échelle",
            "equipe": "équipe", "qualite": "qualité", "strategie": "stratégie",
            "amelioration": "amélioration", "manageriale": "managériale",
            "modele": "modèle", "delivery": "delivery", "ingenierie": "ingénierie"}


def _nettoyer_label(texte):
    """Retire le contenu entre parentheses d'un libelle pilier/objectif (ex.
    « Ressources humaines (formations, coaching agile, talent, ...) » ->
    « Ressources humaines ») — mire `nettoyerLabel` de radar-svg.js. Les noms
    du referentiel Excel embarquent parfois un complement entre parentheses
    qui alourdit l'affichage sans aider a la lecture rapide ; on l'enleve
    PARTOUT ou joli_nom() est appele (barres, cartes, radar...), pas juste
    a un endroit — un oubli ponctuel a deja ete signale par le passe."""
    return re.sub(r"\s*\([^)]*\)", "", str(texte)).strip()


def joli_nom(nom):
    if not nom:
        return nom
    nom = _nettoyer_label(nom)
    mots = nom.replace("'", "' ").split()
    out = []
    premier = True
    for m in mots:
        bas = m.lower()
        if bas.endswith("'"):       # "l'" / "d'" : toujours minuscule, colle au suivant
            out.append(bas)
            continue
        coeur = _ACCENTS.get(bas, bas)
        if premier:                 # premier vrai mot : capitale
            coeur = coeur[:1].upper() + coeur[1:]
            premier = False
        elif bas in _ACRONYMES:     # DevOps & co restent en majuscules
            coeur = m.upper() if len(bas) <= 2 else coeur[:1].upper() + coeur[1:]
        out.append(coeur)
    return " ".join(out).replace("' ", "'")


def moyenne(valeurs):
    vals = [v for v in valeurs if v is not None]
    return sum(vals) / len(vals) if vals else None


def fleche(delta):
    if delta is None:
        return ("", D.MUTED)
    if abs(delta) < 0.05:
        return ("=", D.MUTED)
    return (f"▲ +{delta:.1f}", D.OK) if delta > 0 else (f"▼ {delta:.1f}", D.WARN)


def _trouver_layout(layouts, patterns, defaut_idx):
    """1er layout dont le nom contient un des `patterns` (insensible casse/accents
    grossiers) ; sinon le layout `defaut_idx` (borne). Permet de viser le bon
    layout meme si on fournit un autre template ou les indices different."""
    for lay in layouts:
        nom = (lay.name or "").lower()
        if any(p in nom for p in patterns):
            return lay
    return layouts[min(defaut_idx, len(layouts) - 1)]


def titre_slide(prs, layouts, texte):
    slide = prs.slides.add_slide(_trouver_layout(layouts, TITRE_PATTERNS, LAYOUT_TITRE_SEUL))
    for ph in slide.placeholders:
        if ph.placeholder_format.idx == 0:
            ph.text_frame.text = texte
            break
    return slide


def info_ligne(bloc):
    if bloc["type"] == "equipe":
        base = f"{bloc['effectif']} répondant(s)"
        return f"{bloc['departement']} · {base}" if bloc.get("departement") else base
    return f"{bloc['effectif']} répondant(s) · {bloc.get('nbEquipes', '')} équipe(s)"


# ----------------------------------------------------------------------------
# Slide 1 : Vue d'ensemble (jauge + barres par pilier + chips)
# ----------------------------------------------------------------------------
def _surtitre(slide, x, y, w, texte):
    """Petit label de section (capitales espacees) + filet fin dessous."""
    D.add_text(slide, x, y, w, 0.24,
               [(texte, {"size": D.TYPE["tiny"], "bold": True, "color": D.MUTED})])
    D.add_rect(slide, x, y + 0.26, w, 0.014, fill=CYAN)   # filet d'accent charte


def slide_vue_ensemble(prs, layouts, bloc):
    slide = titre_slide(prs, layouts, f"{bloc['nom']} — Vue d'ensemble")
    piliers = bloc.get("piliers", [])

    # Deltas par pilier (evolution), indexes par nom.
    deltas = {}
    comp = bloc.get("comparaison", {})
    if comp.get("disponible"):
        for p in comp.get("piliers", []):
            deltas[p["nom"]] = p.get("delta")

    glob = moyenne([p.get("moyenne") for p in piliers])
    glob_delta = None
    if comp.get("disponible"):
        cur = moyenne([p.get("courant") for p in comp.get("piliers", [])])
        prec = moyenne([p.get("precedent") for p in comp.get("piliers", [])])
        if cur is not None and prec is not None:
            glob_delta = cur - prec

    D.add_text(slide, MARGE_X, CONTENU_TOP - 0.10, 4.0, 0.3,
               [(info_ligne(bloc), {"size": D.TYPE["small"], "color": D.MUTED})])

    chips_top = CONTENU_BOTTOM - 0.55   # bandeau du bas (point fort / a renforcer)
    band_top = CONTENU_TOP + 0.42       # haut de la zone de contenu utile
    band_bot = chips_top - 0.30

    # --- Jauge moyenne globale (panneau gauche, centre verticalement) ---
    panel_w = 2.85
    D.add_rect(slide, MARGE_X, band_top, panel_w, band_bot - band_top,
               fill=FOND_PANNEAU, line=D.LINE, line_w=0.75, rounded=True, radius=RADIUS)
    cx = MARGE_X + panel_w / 2
    # Bloc {label + jauge + tendance} centre dans le panneau.
    has_delta = glob_delta is not None
    bloc_h = 0.26 + 2.0 + (0.55 if has_delta else 0.0)
    top0 = band_top + (band_bot - band_top - bloc_h) / 2
    D.add_text(slide, MARGE_X, top0, panel_w, 0.24,
               [("MOYENNE GLOBALE", {"size": D.TYPE["tiny"], "bold": True, "color": D.MUTED,
                                     "align": PP_ALIGN.CENTER})])
    gs = 2.0
    gy = top0 + 0.30
    gx = cx - gs / 2
    frac = (glob / 3.0) if glob is not None else 0
    D.add_gauge(slide, gx, gy, gs, frac, ACCENT)
    D.add_text(slide, gx, gy, gs, gs,
               [(fmt(glob), {"size": D.TYPE["kpi"], "bold": True, "align": PP_ALIGN.CENTER}),
                ("sur 3", {"size": D.TYPE["small"], "color": D.MUTED, "align": PP_ALIGN.CENTER})],
               anchor=MSO_ANCHOR.MIDDLE)
    if has_delta:
        txt, col = fleche(glob_delta)
        D.add_text(slide, MARGE_X, gy + gs + 0.06, panel_w, 0.5,
                   [(txt, {"size": D.TYPE["h2"], "bold": True, "color": col,
                           "align": PP_ALIGN.CENTER}),
                    (f"vs {comp.get('precedenteDate', '')}",
                     {"size": D.TYPE["tiny"], "color": D.MUTED, "align": PP_ALIGN.CENTER})])

    # --- Barres par pilier (colonne droite) ---
    bx = MARGE_X + panel_w + 0.55
    bw = 10 - MARGE_X - bx
    _surtitre(slide, bx, CONTENU_TOP - 0.05, bw, "MATURITÉ PAR PILIER")
    n = max(1, len(piliers))
    label_w = 2.05
    val_w = 1.05
    track_x = bx + label_w
    track_w = bw - label_w - val_w
    zone_top = CONTENU_TOP + 0.42
    zone_h = band_bot - zone_top
    row_h = min(0.66, zone_h / n)
    y = zone_top + (zone_h - row_h * n) / 2   # centre le paquet de barres
    bar_h = 0.24
    for i, p in enumerate(piliers):
        moy = p.get("moyenne")
        col_pil = D.couleur_pilier(i)
        D.add_dot(slide, bx, y + (row_h - 0.12) / 2, 0.12, col_pil)
        D.add_text(slide, bx + 0.22, y, label_w - 0.22, row_h,
                   [(joli_nom(p["nom"]), {"size": D.TYPE["small"], "bold": True,
                                          "line_spacing": 0.95})],
                   anchor=MSO_ANCHOR.MIDDLE)
        by = y + (row_h - bar_h) / 2
        D.add_hbar(slide, track_x, by, track_w, bar_h,
                   (moy / 3.0) if moy is not None else 0, col_pil)
        txt, col = fleche(deltas.get(p["nom"]))
        lignes = [(fmt(moy), {"size": D.TYPE["h3"], "bold": True})]
        if txt:
            lignes.append((txt, {"size": D.TYPE["tiny"], "bold": True, "color": col}))
        D.add_text(slide, track_x + track_w + 0.12, y, val_w - 0.12, row_h,
                   lignes, anchor=MSO_ANCHOR.MIDDLE)
        y += row_h
    # Reglette d'echelle 0-1-2-3 sous les barres.
    sy = zone_top + (zone_h + row_h * n) / 2 - 0.02
    for g in range(4):
        gx2 = track_x + track_w * (g / 3.0)
        D.add_rect(slide, gx2 - 0.005, zone_top + (zone_h - row_h * n) / 2,
                   0.01, row_h * n, fill=D.LINE)
        D.add_text(slide, gx2 - 0.15, sy, 0.30, 0.18,
                   [(str(g), {"size": D.TYPE["tiny"], "color": D.MUTED,
                              "align": PP_ALIGN.CENTER})])

    # --- Bandeau bas : point fort / a renforcer ---
    valides = [(p["nom"], p["moyenne"]) for p in piliers if p.get("moyenne") is not None]
    if valides:
        fort = max(valides, key=lambda x: x[1])
        faible = min(valides, key=lambda x: x[1])
        band_w = BORD_DROIT - MARGE_X            # s'arrete avant le badge n° de slide
        D.add_rect(slide, MARGE_X, chips_top, band_w, 0.52,
                   fill=FOND_PANNEAU, line=D.LINE, line_w=0.75, rounded=True, radius=RADIUS)
        mid = MARGE_X + band_w / 2               # divise le bandeau en deux moities egales
        _chip(slide, MARGE_X + 0.30, chips_top, mid - MARGE_X - 0.30, "Point fort", fort, D.OK)
        D.add_rect(slide, mid, chips_top + 0.10, 0.012, 0.32, fill=D.LINE)
        _chip(slide, mid + 0.30, chips_top, BORD_DROIT - mid - 0.30, "À renforcer", faible, D.WARN)


def _chip(slide, x, y, w, prefixe, pilier, dot):
    D.add_dot(slide, x, y + 0.20, 0.13, dot)
    nom, moy = pilier
    box = slide.shapes.add_textbox(Inches(x + 0.24), Inches(y), Inches(w - 0.24), Inches(0.52))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.auto_size = None
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    p = tf.paragraphs[0]
    r1 = p.add_run(); r1.text = f"{prefixe} : "
    r1.font.size = D.Pt(D.TYPE["small"]); r1.font.color.rgb = D.rgb(D.MUTED)
    r2 = p.add_run(); r2.text = f"{joli_nom(nom)} — {fmt(moy)} / 3"
    r2.font.size = D.Pt(D.TYPE["small"]); r2.font.bold = True; r2.font.color.rgb = D.rgb(D.INK)
    if D.POLICE:                        # meme police de marque que le reste du deck
        r1.font.name = D.POLICE
        r2.font.name = D.POLICE


# ----------------------------------------------------------------------------
# Slide 2 : Radar par objectif + commentaire + evolution
# ----------------------------------------------------------------------------
# Radar VECTORIEL (formes python-pptx natives, pas un PNG rasterise par
# Puppeteer) : reste net a toute resolution/impression et reste editable dans
# PowerPoint. Mire le meme principe visuel que le radar web (voir
# app/src/radar-svg.js, qui garde son propre role serveur/US6.2-US6.5 — on ne
# le touche pas) : grille de niveaux + rayons, polygone "precedent" pointille
# (comparaison), polygone "courant" en aire semi-transparente, une puce
# couleur-pilier par sommet, libelles d'axe colores par pilier, legende a
# droite. Echelle fixe 0..3 (les 4 niveaux de reponse du referentiel).
RADAR_MAX = 3
# Largeur de legende ABSOLUE (pas un ratio du cote du radar) : sous ~1.0-1.3in de
# largeur de texte utile, un mot seul de pilier ("Excellence", "Priorisation")
# n'a plus la place de tenir sur une ligne et PowerPoint le coupe au milieu (pas
# de cesure) — c'est cette contrainte de mot qui pilote la valeur, pas une
# esthetique de proportion. Le cote du radar est plafonne en consequence : au-
# dela, le panneau de DROITE (commentaire + evolution par pilier, qui se partage
# la meme largeur de slide) n'aurait plus assez de place pour ses propres noms
# de pilier sans la meme coupure.
RADAR_LEGEND_W = 1.30
RADAR_COTE_MAX = 3.75
RADAR_GAP_LEGENDE = 0.20     # entre le cercle et la colonne de legende
# Hauteur de ligne REELLE (pas juste la taille de police) : mesuree au rendu,
# comme LH_QUESTION (0.195 pour small 10.5pt) — proportionnelle a la taille
# pour tiny (9pt). Sous-estimer ceci fait deborder le texte de sa boite sans
# que le controle geometrique ne le voie (la FORME reste dans le cadre).
RADAR_LH = 0.195 * 9 / 10.5   # ~0.167, hauteur de ligne tiny (9pt)
# Bandeau de section (_surtitre, meme grammaire que "MATURITÉ PAR PILIER" sur
# la vue d'ensemble) + reglette d'echelle 0..RADAR_MAX, reserves AU-DESSUS du
# cercle — memes tailles/couleurs que la reglette sous les barres de
# slide_vue_ensemble, pour donner un repere de lecture explicite du niveau
# (les anneaux seuls ne disent pas "ceci = niveau 2").
RADAR_HEADER_H = 0.42
RADAR_ECHELLE_H = 0.30


def _cote_radar(w, h):
    """Cote (in) du carre du radar pour une boite (w, h) donnee — factorise
    pour que slide_radar (reglette d'echelle) et _dessiner_radar (formes)
    calculent EXACTEMENT la meme valeur, sans dupliquer la formule."""
    return min(h, RADAR_COTE_MAX, w - RADAR_LEGEND_W - RADAR_GAP_LEGENDE)


def _echelle_radar(slide, x0, y, cote):
    """Reglette d'echelle 0..RADAR_MAX au-dessus du cercle : mire la reglette
    deja utilisee sous les barres de la vue d'ensemble (meme taille/couleur de
    trait et de texte) — un repere explicite de "a quel niveau correspond
    quel anneau", que les anneaux seuls (juste des cercles concentriques) ne
    donnent pas."""
    D.add_text(slide, x0, y, cote, 0.16,
               [("NIVEAU DE MATURITÉ", {"size": D.TYPE["tiny"], "bold": True, "color": D.MUTED})])
    ligne_y = y + 0.16
    for g in range(RADAR_MAX + 1):
        gx = x0 + cote * (g / RADAR_MAX)
        D.add_rect(slide, gx - 0.005, ligne_y, 0.01, 0.09, fill=D.LINE)
        # Le repere 0 (extremite gauche) et RADAR_MAX (extremite droite) du
        # cercle : boite decalee + alignee vers l'INTERIEUR pour ne pas
        # deborder du cercle, plutot que centree sur le trait.
        if g == 0:
            box_x, align = gx, PP_ALIGN.LEFT
        elif g == RADAR_MAX:
            box_x, align = gx - 0.30, PP_ALIGN.RIGHT
        else:
            box_x, align = gx - 0.15, PP_ALIGN.CENTER
        D.add_text(slide, box_x, ligne_y + 0.08, 0.30, 0.16,
                   [(str(g), {"size": D.TYPE["tiny"], "color": D.MUTED, "align": align})])


def _point_radar(cx, cy, rayon, i, n, valeur):
    ang = -math.pi / 2 + i * (2 * math.pi / n)
    r = rayon * max(0.0, min(RADAR_MAX, valeur if valeur is not None else 0)) / RADAR_MAX
    return (cx + r * math.cos(ang), cy + r * math.sin(ang))


def _lignes_radar(texte, largeur_in, taille=None):
    taille = taille if taille is not None else D.TYPE["tiny"]
    return max(1, D.estimer_lignes(texte, max(0.3, largeur_in), taille))


def _taille_libelle_axe(nom_axe, box_w, taille_max=None, taille_min=7.0,
                        cpi_ref=11.0, taille_ref=10.5):
    """Reduit la taille de police jusqu'a ce que le mot le plus long de
    `nom_axe` (separe sur espace ET tiret — un tiret existant est deja un
    point de coupure sur) tienne dans `box_w`. Necessaire car D.estimer_lignes
    (repli mot-a-mot par nombre de caracteres) sous-estime le nombre de lignes
    reel quand un seul mot compose francais ("Fonctionnement",
    "Synchronisation") depasse a lui seul la largeur de la boite : PowerPoint
    le coupe alors au milieu, SANS trait d'union, sur un radar dense (10-12
    axes, boites de libelle etroites). Repli sur `taille_min` si meme a cette
    taille le mot ne tient pas (mot exceptionnellement long — voir
    `_forcer_cesure`, appele par l'appelant dans ce cas)."""
    taille_max = taille_max if taille_max is not None else D.TYPE["tiny"]
    mots = [m for m in re.split(r"[ \-]", nom_axe) if m]
    plus_long = max((len(m) for m in mots), default=0)
    taille = taille_max
    while taille > taille_min:
        cpi = cpi_ref * (taille_ref / taille)
        if plus_long <= box_w * cpi:
            break
        taille = round(taille - 0.5, 2)
    return max(taille, taille_min)


def _forcer_cesure(nom_axe, box_w, taille, cpi_ref=11.0, taille_ref=10.5,
                   min_prefixe=3):
    """Insere un vrai trait d'union dans tout mot de `nom_axe` encore trop
    long pour `box_w` a `taille` (meme apres le plancher de
    `_taille_libelle_axe`) — au point ou PowerPoint le couperait de toute
    facon, mais avec un tiret plutot qu'une coupure brute. Un mot deja
    cesure ("inter-équipes") n'est jamais retouche (deja un point de coupure
    propre). Sans effet si tous les mots tiennent deja."""
    cpi = cpi_ref * (taille_ref / taille)
    max_chars = max(min_prefixe + 1, int(box_w * cpi))

    def _cesurer_mot(mot):
        if len(mot) <= max_chars or "-" in mot:
            return mot
        coupe = max(min_prefixe, max_chars - 1)
        coupe = min(coupe, len(mot) - 1)
        return mot[:coupe] + "-" + mot[coupe:]

    return " ".join(_cesurer_mot(m) for m in nom_axe.split(" "))


def _dessiner_radar(slide, x, y, w, h, axes, piliers):
    """Dessine le radar + sa legende dans la boite (x, y, w, h). `axes` =
    [{nom, moyenne, precedent, pilierIndex}], `piliers` = [nom, ...] pour la
    legende. Le radar est carre (cote plafonne a RADAR_COTE_MAX, cf. sa note),
    aligne en haut a gauche de la boite, la legende (largeur fixe
    RADAR_LEGEND_W) occupant le reste de la largeur. Les libelles d'axe et la
    legende sont dimensionnes a leur contenu reel (pas une hauteur/largeur de
    boite fixe devinee) pour ne jamais se chevaucher, quelle que soit la
    longueur des noms de pilier/objectif."""
    n = len(axes)
    if n < 3:
        return  # radar illisible sous 3 axes : rien plutot qu'une forme deformee
    cote = _cote_radar(w, h)
    x0, y0 = x, y + (h - cote) / 2   # centre verticalement si la largeur est la contrainte
    cx, cy = x0 + cote / 2, y0 + cote / 2
    rayon = cote * 0.27   # un peu retrait (vs 0.31) : laisse de la marge aux libelles d'axe
    lx0 = x0 + cote + RADAR_GAP_LEGENDE   # abscisse de depart de la colonne de legende

    has_prev = any(a.get("precedent") is not None for a in axes)

    # Grille (niveaux 1..MAX) + rayons, ton neutre discret (theme).
    for niveau in range(1, RADAR_MAX + 1):
        pts = [_point_radar(cx, cy, rayon, i, n, niveau) for i in range(n)]
        D.add_polygon(slide, pts, line=D.LINE, line_w=0.75)
    for i in range(n):
        px_, py_ = _point_radar(cx, cy, rayon, i, n, RADAR_MAX)
        D.add_line(slide, cx, cy, px_, py_, D.LINE, width=0.75)

    # Polygone "session precedente" (pointille, sans remplissage). Un axe sans
    # comparaison reprend sa valeur courante (evite un effondrement a 0 qui
    # laisserait croire a une regression totale la ou il n'y a simplement pas
    # de comparaison possible) — mire le meme choix que radar-svg.js.
    if has_prev:
        pts_prec = [_point_radar(cx, cy, rayon, i, n,
                                 a.get("precedent") if a.get("precedent") is not None
                                 else a.get("moyenne")) for i, a in enumerate(axes)]
        D.add_polygon(slide, pts_prec, line=D.MUTED, line_w=1.5, dash=D.DASH.DASH)

    # Polygone "courant" : aire semi-transparente, couleur neutre du radar
    # (palette pilier n°0 — comme radar-svg.js, ce n'est pas une couleur de
    # marque) ; la couleur de CHAQUE pilier vit sur sa puce et son libelle.
    couleur_aire = D.couleur_pilier(0)
    pts_cour = [_point_radar(cx, cy, rayon, i, n, a.get("moyenne")) for i, a in enumerate(axes)]
    D.add_polygon(slide, pts_cour, fill=couleur_aire, alpha=27, line=couleur_aire, line_w=2)
    for i, a in enumerate(axes):
        px_, py_ = pts_cour[i]
        d = max(0.06, cote * 0.014)
        D.add_dot(slide, px_ - d / 2, py_ - d / 2, d, D.couleur_pilier(a.get("pilierIndex", 0)))

    # Libelles d'axe : petite zone de texte centree sur le sommet exterieur,
    # alignee selon le cote du radar (gauche/centre/droite selon le signe du
    # cosinus) — mire le text-anchor start/middle/end du radar web. Largeur
    # et hauteur de boite calculees (pas devinees) pour ne jamais chevaucher
    # ni la colonne de legende (a droite) ni le bord de la zone (a gauche).
    # Cap a 3 lignes (ellipse au-dela, D.tronquer_a_lignes) : sur un radar dense
    # (10-12 axes), un libelle demesurement long empieterait sinon sur les
    # libelles voisins (peu d'espace vertical entre sommets adjacents). Le
    # budget de hauteur ajoute une demi-ligne de marge : l'estimateur de repli
    # mot-a-mot (D.estimer_lignes) sous-estime le nombre de lignes reel quand
    # un seul mot (compose, frequent en francais — "Fonctionnement",
    # "Synchronisation") depasse a lui seul la largeur de la boite.
    LARGEUR_MAX_LABEL, MAX_LIGNES_LABEL = 1.35, 3
    for i, a in enumerate(axes):
        ang = -math.pi / 2 + i * (2 * math.pi / n)
        cosang = math.cos(ang)
        lx = cx + (rayon + cote * 0.05) * cosang
        ly = cy + (rayon + cote * 0.05) * math.sin(ang)
        nom_axe = joli_nom(a.get("nom", ""))
        if cosang > 0.2:
            box_w = max(0.65, min(LARGEUR_MAX_LABEL, lx0 - lx - 0.08))
            box_x, align = lx, PP_ALIGN.LEFT
        elif cosang < -0.2:
            box_w = max(0.65, min(LARGEUR_MAX_LABEL, lx - x0 - 0.08))
            box_x, align = lx - box_w, PP_ALIGN.RIGHT
        else:
            box_w = min(LARGEUR_MAX_LABEL, (lx0 - x0) - 0.16)
            box_x, align = lx - box_w / 2, PP_ALIGN.CENTER
        box_x = max(0.02, min(box_x, 10 - box_w - 0.02))
        # Reduit la taille AVANT le repli mot-a-mot si un mot seul ne tiendrait
        # pas dans box_w a la taille normale (cf. note _taille_libelle_axe) —
        # evite que PowerPoint coupe ce mot au milieu sans trait d'union.
        taille_axe = _taille_libelle_axe(nom_axe, box_w)
        nom_axe = _forcer_cesure(nom_axe, box_w, taille_axe)
        lh_axe = RADAR_LH * (taille_axe / D.TYPE["tiny"])
        nom_axe = D.tronquer_a_lignes(nom_axe, box_w, taille_axe, MAX_LIGNES_LABEL)
        box_h = max(0.20, (min(MAX_LIGNES_LABEL, _lignes_radar(nom_axe, box_w, taille_axe)) + 0.5)
                    * lh_axe + 0.06)
        D.add_text(slide, box_x, ly - box_h / 2, box_w, box_h,
                   [(nom_axe, {"size": taille_axe, "bold": True,
                      "color": D.couleur_pilier(a.get("pilierIndex", 0)),
                      "align": align, "line_spacing": 0.95})],
                   anchor=MSO_ANCHOR.MIDDLE, align=align)

    # Legende : panneau vertical a droite du radar (puce + nom de pilier),
    # puis "session courante"/"session precedente" si comparaison disponible.
    # Chaque ligne est dimensionnee a son propre nombre de lignes reel (un nom
    # court n'herite pas de la hauteur d'un nom long empile juste apres).
    lw = (x + w) - lx0
    if lw <= 0.50:
        return
    lignes_legende = [(i, joli_nom(nom),
                       max(0.24, _lignes_radar(joli_nom(nom), lw - 0.26) * RADAR_LH + 0.09))
                      for i, nom in enumerate(piliers)]
    hauteur_comp = 0.62 if has_prev else 0.0
    total_h = sum(rh for _, _, rh in lignes_legende) + hauteur_comp
    if total_h > cote:  # garde-fou : ne jamais deborder de la bande (cas extreme,
        echelle = cote / total_h                        # ex. tres nombreux piliers)
        lignes_legende = [(i, t, rh * echelle) for i, t, rh in lignes_legende]
        hauteur_comp *= echelle
        total_h = cote
    ly = y0 + max(0.0, (cote - total_h) / 2)
    for i, txt, rh in lignes_legende:
        D.add_dot(slide, lx0, ly + (min(rh, 0.30) - 0.14) / 2, 0.14, D.couleur_pilier(i))
        D.add_text(slide, lx0 + 0.24, ly, lw - 0.24, rh,
                   [(txt, {"size": D.TYPE["tiny"], "line_spacing": 1.0})],
                   anchor=MSO_ANCHOR.MIDDLE)
        ly += rh
    if has_prev:
        ly += 0.10
        D.add_line(slide, lx0, ly + 0.11, lx0 + 0.30, ly + 0.11, couleur_aire, width=2.5)
        D.add_text(slide, lx0 + 0.38, ly, max(0.1, lw - 0.38), 0.22,
                   [("Session courante", {"size": D.TYPE["tiny"], "color": D.MUTED})],
                   anchor=MSO_ANCHOR.MIDDLE)
        ly += 0.26
        D.add_line(slide, lx0, ly + 0.11, lx0 + 0.30, ly + 0.11, D.MUTED, width=2.5,
                   dash=D.DASH.DASH)
        D.add_text(slide, lx0 + 0.38, ly, max(0.1, lw - 0.38), 0.22,
                   [("Session précédente", {"size": D.TYPE["tiny"], "color": D.MUTED})],
                   anchor=MSO_ANCHOR.MIDDLE)


def _hauteur_commentaire(texte, largeur_in):
    """Estime la hauteur (in) d'un commentaire wrappe en small, pour eviter le
    grand vide d'un encart a hauteur fixe. On simule le wrap mot-a-mot avec une
    largeur prudente (~12.5 car/inch, calibree pour ce corps de texte) et on
    majore un peu, pour ne JAMAIS sous-estimer (un debordement est pire qu'un
    petit blanc)."""
    if not texte:
        return 0.60
    lignes = D.estimer_lignes(texte, largeur_in, D.TYPE["small"], cpi_ref=12.5,
                              taille_ref=D.TYPE["small"])
    # entete (~0.30) + lignes (small 10.5pt + interligne ~0.205in) + marges
    return 0.42 + lignes * 0.205


def slide_radar(prs, layouts, bloc):
    slide = titre_slide(prs, layouts, f"{bloc['nom']} — Radar de maturité")

    # Radar aligne a gauche (marge), dimensionne a sa hauteur disponible ; le
    # panneau de texte a droite demarre juste apres la largeur REELLE occupee
    # par le radar (calculee ci-dessous), pas a une frontiere fixe — ce qui
    # evite tout vide entre le radar et le texte quel que soit son ratio.
    # Vectoriel (pptx_deck.add_polygon/add_line) a partir des memes donnees
    # (objectifs/piliers) que celles utilisees pour rasteriser le PNG cote
    # serveur — plus net qu'un PNG a toute resolution/impression, et editable.
    axes = bloc.get("objectifs") or []
    piliers_legende = [p.get("nom", "") for p in (bloc.get("piliers") or [])]
    disponible_h = CONTENU_BOTTOM - CONTENU_TOP
    # Largeur du radar+legende bornee par RADAR_COTE_MAX (cf. sa note) — pas
    # juste par la hauteur disponible — pour garantir au panneau de droite
    # (evolution par pilier) une colonne de noms utilisable.
    gauche_w_max = RADAR_COTE_MAX + RADAR_GAP_LEGENDE + RADAR_LEGEND_W
    w = 0
    if len(axes) >= 3:
        # Bandeau de section + reglette d'echelle reserves AU-DESSUS du cercle
        # (memes tailles/couleurs que le reste du deck — voir leurs notes).
        radar_h = disponible_h - RADAR_HEADER_H - RADAR_ECHELLE_H
        w = min(gauche_w_max, radar_h + RADAR_GAP_LEGENDE + RADAR_LEGEND_W)
        cote = _cote_radar(w, radar_h)
        _surtitre(slide, MARGE_X, CONTENU_TOP, w, "MATURITÉ PAR OBJECTIF")
        _echelle_radar(slide, MARGE_X, CONTENU_TOP + RADAR_HEADER_H, cote)
        top_radar = CONTENU_TOP + RADAR_HEADER_H + RADAR_ECHELLE_H
        _dessiner_radar(slide, MARGE_X, top_radar, w, radar_h, axes, piliers_legende)

    GAP_RADAR_TEXTE = 0.30
    # Sans radar (referentiel < 3 objectifs), la colonne commentaire/evolution
    # occupe TOUTE la largeur de contenu depuis MARGE_X — l'ancien repli 7.4
    # coincait le panneau a droite (pw=2.05), d'ou un name_w negatif plus bas
    # (deck corrompu, invisible au controle de debordement). Cf. filet durci.
    px = MARGE_X + w + GAP_RADAR_TEXTE if w else MARGE_X
    pw = 10 - px - MARGE_X

    # ---- Colonne droite : commentaire (callout) puis evolution ----
    py = CONTENU_TOP
    commentaire = (bloc.get("commentaire") or "").strip()
    txt_in = pw - 0.50
    comp = bloc.get("comparaison", {})
    n_ev = len(comp.get("piliers", [])) if comp.get("disponible") else 0

    # Colonnes de la liste d'evolution (calculees ici, avant la reservation de
    # hauteur du commentaire, car cette derniere doit tenir compte de la
    # hauteur REELLE des lignes — un nom de pilier long se replie sur
    # plusieurs lignes dans name_w, qui peut etre etroit) :
    # le cluster numerique est cale a droite mais s'arrete avant le badge
    # n° de slide (coin bas-droit) => right_lim.
    delta_w, avap_w = 0.80, 0.95
    right_lim = px + pw - 0.30
    delta_x = right_lim - delta_w
    avap_x = delta_x - avap_w
    name_w = max(0.6, avap_x - (px + 0.22))   # garde-fou : jamais de largeur negative
    LH_EV = LH_QUESTION   # hauteur de ligne reelle (small 10.5pt) — voir sa note plus haut
    piliers_ev = comp.get("piliers", []) if n_ev else []
    lignes_ev = [max(1, D.estimer_lignes(joli_nom(p.get("nom", "")), name_w, D.TYPE["small"]))
                for p in piliers_ev]
    hauteurs_ev = [max(0.30, nl * LH_EV + 0.14) for nl in lignes_ev]

    # Hauteur du commentaire : adaptee au texte. Avec evolution, on borne le
    # commentaire pour lui reserver la place (mesuree sur les hauteurs REELLES
    # ci-dessus, pas une estimation fixe par ligne) ; SANS evolution, le
    # callout occupe toute la bande (texte centre verticalement => pas de vide).
    h_comm = _hauteur_commentaire(commentaire, txt_in)
    reste = CONTENU_BOTTOM - py
    if n_ev:
        place_ev_min = 0.38 + sum(hauteurs_ev) + 0.30   # entete + lignes + gap
        h_comm = max(0.95, min(h_comm, reste - place_ev_min))
        ancre = MSO_ANCHOR.TOP
        panel_top = py
    else:
        # Pas d'evolution : on dimensionne le callout a son contenu (+ une marge
        # interne) et on le centre verticalement face au radar, au lieu d'etirer
        # un grand panneau quasi vide sur toute la hauteur de la bande.
        h_comm = max(1.10, min(h_comm + 0.30, reste))
        ancre = MSO_ANCHOR.MIDDLE
        panel_top = py + (reste - h_comm) / 2

    # Callout : barre d'accent a gauche + panneau clair.
    D.add_rect(slide, px, panel_top, pw, h_comm, fill=FOND_PANNEAU, line=D.LINE,
               line_w=0.75, rounded=True, radius=RADIUS)
    D.add_rect(slide, px, panel_top, 0.07, h_comm, fill=CYAN, rounded=True, radius=0.5)
    lignes = [("COMMENTAIRE DE RESTITUTION",
               {"size": D.TYPE["tiny"], "bold": True, "color": D.MUTED, "space_after": 5})]
    if commentaire:
        for ligne in commentaire.split("\n"):
            lignes.append((ligne, {"size": D.TYPE["small"], "space_after": 4,
                                   "line_spacing": 1.04}))
    else:
        lignes.append(("(à compléter)", {"size": D.TYPE["small"], "italic": True,
                                         "color": D.MUTED}))
    th = h_comm - 0.30 if ancre == MSO_ANCHOR.TOP else h_comm - 0.32
    ty = panel_top + 0.16
    D.add_text(slide, px + 0.26, ty, txt_in, th, lignes, anchor=ancre)

    # ---- Evolution par pilier : lignes alignees (dot · nom · av→ap · delta) ----
    # Hauteur de CHAQUE ligne calculee sur son propre nombre de lignes reel
    # (hauteurs_ev, cf. plus haut) : un nom de pilier court n'herite pas de la
    # hauteur d'un nom long empile juste apres (meme principe que le radar).
    if n_ev:
        ey = py + h_comm + 0.28
        _surtitre(slide, px, ey, pw, f"ÉVOLUTION VS {comp.get('precedenteDate', '')}".upper())
        rows_top = ey + 0.40
        bottom = CONTENU_BOTTOM - 0.18         # marge au-dessus du n° de slide
        dispo = max(0.10, bottom - rows_top)
        total_h = sum(hauteurs_ev)
        if total_h > dispo:   # garde-fou : ne jamais deborder (ex. beaucoup de piliers)
            echelle = dispo / total_h
            hauteurs_ev = [hh * echelle for hh in hauteurs_ev]
        y = rows_top
        for i, (p, row_h) in enumerate(zip(piliers_ev, hauteurs_ev)):
            D.add_dot(slide, px, y + (min(row_h, 0.24) - 0.11) / 2, 0.11, D.couleur_pilier(i))
            D.add_text(slide, px + 0.22, y, name_w, row_h,
                       [(joli_nom(p["nom"]), {"size": D.TYPE["small"], "bold": True,
                                              "line_spacing": 0.95})],
                       anchor=MSO_ANCHOR.MIDDLE)
            D.add_text(slide, avap_x, y, avap_w, row_h,
                       [(f"{fmt(p.get('precedent'))} → {fmt(p.get('courant'))}",
                         {"size": D.TYPE["small"], "color": D.MUTED, "align": PP_ALIGN.RIGHT})],
                       anchor=MSO_ANCHOR.MIDDLE)
            txt, col = fleche(p.get("delta"))
            if txt:
                D.add_text(slide, delta_x, y, delta_w, row_h,
                           [(txt, {"size": D.TYPE["small"], "bold": True, "color": col,
                                   "align": PP_ALIGN.RIGHT})],
                           anchor=MSO_ANCHOR.MIDDLE)
            y += row_h


# ----------------------------------------------------------------------------
# Slide 3 : Points d'attention (cartes)
# ----------------------------------------------------------------------------
def _entete_colonne(slide, x, w, marqueur, titre, sous):
    """Pastille couleur + titre de colonne + sous-titre, puis filet fin."""
    D.add_rect(slide, x, CONTENU_TOP - 0.02, 0.18, 0.18, fill=marqueur,
               rounded=True, radius=0.30)
    D.add_text(slide, x + 0.30, CONTENU_TOP - 0.10, w - 0.30, 0.34,
               [(titre, {"size": D.TYPE["h3"], "bold": True})])
    D.add_text(slide, x + 0.30, CONTENU_TOP + 0.26, w - 0.30, 0.22,
               [(sous, {"size": D.TYPE["tiny"], "color": D.MUTED})])
    D.add_rect(slide, x, CONTENU_TOP + 0.52, w, 0.014, fill=D.LINE)


# Taille plancher des cartes de points forts/attention (voir D.ajuster_police).
# En-dessous, le filet de securite de _cartes_colonne prend le relai (troncature
# avec ellipse) plutot que de laisser une forme deborder de la slide.
TAILLE_MIN_CARTE = 7.0
GAP_MIN, GAP_MAX = 0.14, 0.28


# Hauteur d'une carte HORS question : gap(0.04) + contexte(0.17) + gap(0.10) +
# barre(0.28). Source unique partagee entre _bloc_carte_h (hauteur) et le calcul
# inverse de ql_max dans _cartes_colonne — evite qu'un des deux derive de l'autre.
_CARTE_H_FIXE = 0.04 + 0.17 + 0.10 + 0.28   # = 0.59


# Hauteur du contenu d'une carte = question (ql lignes, a `taille` pt) + contexte
# + barre. Seule la hauteur de la question depend de `taille` (contexte et barre
# gardent une taille fixe) — les rendus placent leurs elements aux memes offsets,
# d'ou cette source unique.
def _bloc_carte_h(ql, taille=D.TYPE["small"]):
    lh = LH_QUESTION * (taille / D.TYPE["small"])
    return ql * lh + _CARTE_H_FIXE


def _texte_et_lignes(texte, tw, taille, ql_max):
    """Nombre de lignes reellement utilisees (borne a `ql_max`, cf. filet de
    securite de _cartes_colonne) et texte eventuellement tronque (ellipse) si
    le texte naturel depasse cette borne."""
    ql_naturel = D.estimer_lignes(texte, tw, taille)
    ql = min(ql_naturel, ql_max)
    if ql < ql_naturel:
        texte = D.tronquer_a_lignes(texte, tw, taille, ql)
    return texte, ql


def _contexte_joli(ctx, max_chars=56):
    """Embellit le contexte "Pilier · Objectif" (le pilier vient de l'Excel en
    casse maladroite) et le borne a une ligne (tronque l'objectif au besoin)."""
    if not ctx:
        return ""
    parts = ctx.split(" · ")
    parts[0] = joli_nom(parts[0])
    txt = " · ".join(parts)
    if len(txt) > max_chars:
        txt = txt[:max_chars - 1].rstrip(" ,;(") + "…"
    return txt


def _valeur_cote_barre(slide, x, ry, w, lignes):
    """Pose le couple de valeur (2 lignes) a droite d'une barre (h=0.13), centre
    verticalement SUR la barre. Evite que le grand chiffre flotte au-dessus."""
    box_h = 0.42
    D.add_text(slide, x, ry + 0.065 - box_h / 2, w, box_h, lignes,
               anchor=MSO_ANCHOR.MIDDLE)


def _cartes_colonne(slide, x, w, items, accent, rendu):
    n = max(1, len(items))
    top = CONTENU_TOP + 0.66
    band = CONTENU_BOTTOM - top
    PAD_CARTE = 0.26
    # Largeur utile du texte dans la carte = w - pad(0.24) - marge droite(0.18),
    # cf. les rendus (tx = x + pad, tw = w - pad - 0.18).
    tw_estim = w - 0.42
    textes = [it.get("texte", "") for it in items]

    # Hauteur de CHAQUE carte a `taille` (pas un maximum commun applique a
    # toutes) : une question courte a droite d'une question tres longue ne doit
    # pas heriter de la hauteur de cette derniere.
    def hauteurs(taille):
        return [_bloc_carte_h(D.estimer_lignes(t, tw_estim, taille), taille) + PAD_CARTE
                for t in textes]

    def budget_ok(taille, _lignes_max):
        gap = GAP_MIN if n > 1 else 0.0
        return sum(hauteurs(taille)) + max(0, n - 1) * gap <= band

    # Adapte la police a la longueur des phrases : la plus grande taille entre
    # `small` et `TAILLE_MIN_CARTE` telle que la SOMME des n cartes (chacune a sa
    # propre hauteur) tienne dans la bande disponible, plutot qu'un cap fixe a 2
    # lignes qui debordait les questions longues (US "police lisible sur le PPT").
    taille, _ = D.ajuster_police(textes, tw_estim, D.TYPE["small"], TAILLE_MIN_CARTE, budget_ok)
    card_hs = hauteurs(taille)
    total = sum(card_hs)
    gap = max(GAP_MIN, min(GAP_MAX, (band - total) / (n - 1))) if n > 1 else 0.0
    total_avec_gaps = total + max(0, n - 1) * gap

    # Filet de securite : si meme a TAILLE_MIN_CARTE le total deborde encore
    # (texte extreme), on comprime proportionnellement les hauteurs de carte
    # pour GARANTIR qu'aucune forme ne deborde de la slide (invariant verifie
    # par D.verifier_geometrie). `ql_max` (deduit de la hauteur finale) fait
    # alors tronquer, dans le rendu, le texte de la carte concernee (ellipse) —
    # au pire un texte coupe, jamais une forme hors cadre.
    facteur = min(1.0, (band - 1e-6) / total_avec_gaps) if total_avec_gaps > 0 else 1.0
    card_hs = [h * facteur for h in card_hs]
    gap *= facteur

    lh = LH_QUESTION * (taille / D.TYPE["small"])
    y = top
    for it, card_h in zip(items, card_hs):
        ql_max = max(1, int((card_h - PAD_CARTE - _CARTE_H_FIXE) / lh + 1e-6))
        D.add_card(slide, x, y, w, card_h, accent)
        rendu(slide, x, y, w, card_h, it, taille, ql_max)
        y += card_h + gap


def slide_points(prs, layouts, bloc):
    slide = titre_slide(prs, layouts, f"{bloc['nom']} — Points d'attention")
    # On arrete les colonnes au bord droit "sur" (BORD_DROIT) pour degager le badge
    # n° de slide du template OCTO, que la carte du bas viendrait sinon toucher.
    colw = (BORD_DROIT - MARGE_X - 0.5) / 2
    xg, xd = MARGE_X, MARGE_X + colw + 0.5
    pad = 0.24                              # marge interne carte (apres le liseré)

    def rendu_dispersion(slide, x, y, w, h, q, taille, ql_max):
        tx = x + pad
        tw = w - pad - 0.18
        # Bloc {question + contexte + barre} centre dans la carte ; chaque element
        # suit le precedent (pas de vide au milieu, carte non etiree). `taille`
        # est choisie par _cartes_colonne pour que la question la plus longue de
        # la colonne tienne sans deborder (D.ajuster_police).
        texte, ql = _texte_et_lignes(q.get("texte", ""), tw, taille, ql_max)
        top0 = y + (h - _bloc_carte_h(ql, taille)) / 2
        qh = ql * LH_QUESTION * (taille / D.TYPE["small"])
        D.add_text(slide, tx, top0, tw, qh,
                   [(texte, {"size": taille, "bold": True,
                             "line_spacing": 0.96})])
        D.add_text(slide, tx, top0 + qh + 0.04, tw, 0.17,
                   [(_contexte_joli(q.get("contexte", "")),
                     {"size": D.TYPE["tiny"], "color": D.MUTED})])
        # Barre d'amplitude min..max sur l'echelle 0..3 + repere de moyenne.
        ry = top0 + qh + 0.31
        rw = w - pad - 1.55
        mn = q.get("min") if q.get("min") is not None else 0
        mx = q.get("max") if q.get("max") is not None else 3
        D.add_range_bar(slide, tx, ry, rw, 0.13, mn, mx, 3.0, D.GOLD,
                        marker=q.get("moyenne"))
        # La plage min–max est deja montree par la barre ; on n'affiche que la
        # metrique de classement, nommee en clair (et non l'abreviation "é-t").
        _valeur_cote_barre(slide, tx + rw + 0.14, ry, w - pad - rw - 0.20,
                           [(fmt(q.get("ecartType")),
                             {"size": D.TYPE["h3"], "bold": True, "color": D.GOLD,
                              "align": PP_ALIGN.RIGHT}),
                            ("écart-type", {"size": D.TYPE["tiny"], "color": D.MUTED,
                                            "align": PP_ALIGN.RIGHT})])

    def rendu_faible(slide, x, y, w, h, q, taille, ql_max):
        tx = x + pad
        tw = w - pad - 0.18
        texte, ql = _texte_et_lignes(q.get("texte", ""), tw, taille, ql_max)
        top0 = y + (h - _bloc_carte_h(ql, taille)) / 2
        qh = ql * LH_QUESTION * (taille / D.TYPE["small"])
        D.add_text(slide, tx, top0, tw, qh,
                   [(texte, {"size": taille, "bold": True,
                             "line_spacing": 0.96})])
        D.add_text(slide, tx, top0 + qh + 0.04, tw, 0.17,
                   [(_contexte_joli(q.get("contexte", "")),
                     {"size": D.TYPE["tiny"], "color": D.MUTED})])
        ry = top0 + qh + 0.31
        rw = w - pad - 1.35
        moy = q.get("moyenne")
        D.add_hbar(slide, tx, ry, rw, 0.13, (moy / 3.0) if moy is not None else 0, "#cf7b74")
        _valeur_cote_barre(slide, tx + rw + 0.14, ry, w - pad - rw - 0.20,
                           [(fmt(moy), {"size": D.TYPE["h3"], "bold": True, "color": D.WARN,
                                        "align": PP_ALIGN.RIGHT}),
                            ("sur 3", {"size": D.TYPE["tiny"], "color": D.MUTED,
                                       "align": PP_ALIGN.RIGHT})])

    _entete_colonne(slide, xg, colw, D.GOLD, "Plus forts désaccords",
                    "Forte dispersion des réponses — sujets à clarifier")
    _cartes_colonne(slide, xg, colw, bloc.get("dispersion", []), D.GOLD, rendu_dispersion)
    _entete_colonne(slide, xd, colw, D.WARN, "Scores les plus faibles",
                    "Maturité la plus basse — leviers de progrès prioritaires")
    _cartes_colonne(slide, xd, colw, bloc.get("faibles", []), D.WARN, rendu_faible)


# ----------------------------------------------------------------------------
# Slide "Points forts" : pendant positif de la slide "Points d'attention" —
# scores les plus hauts et meilleurs accords (dispersion la plus faible).
# ----------------------------------------------------------------------------
def slide_points_forts(prs, layouts, bloc):
    slide = titre_slide(prs, layouts, f"{bloc['nom']} — Points forts")
    colw = (BORD_DROIT - MARGE_X - 0.5) / 2
    xg, xd = MARGE_X, MARGE_X + colw + 0.5
    pad = 0.24

    def rendu_haut(slide, x, y, w, h, q, taille, ql_max):
        tx = x + pad
        tw = w - pad - 0.18
        texte, ql = _texte_et_lignes(q.get("texte", ""), tw, taille, ql_max)
        top0 = y + (h - _bloc_carte_h(ql, taille)) / 2
        qh = ql * LH_QUESTION * (taille / D.TYPE["small"])
        D.add_text(slide, tx, top0, tw, qh,
                   [(texte, {"size": taille, "bold": True, "line_spacing": 0.96})])
        D.add_text(slide, tx, top0 + qh + 0.04, tw, 0.17,
                   [(_contexte_joli(q.get("contexte", "")),
                     {"size": D.TYPE["tiny"], "color": D.MUTED})])
        ry = top0 + qh + 0.31
        rw = w - pad - 1.35
        moy = q.get("moyenne")
        D.add_hbar(slide, tx, ry, rw, 0.13, (moy / 3.0) if moy is not None else 0, D.OK)
        _valeur_cote_barre(slide, tx + rw + 0.14, ry, w - pad - rw - 0.20,
                           [(fmt(moy), {"size": D.TYPE["h3"], "bold": True, "color": D.OK,
                                        "align": PP_ALIGN.RIGHT}),
                            ("sur 3", {"size": D.TYPE["tiny"], "color": D.MUTED,
                                       "align": PP_ALIGN.RIGHT})])

    def rendu_accord(slide, x, y, w, h, q, taille, ql_max):
        tx = x + pad
        tw = w - pad - 0.18
        texte, ql = _texte_et_lignes(q.get("texte", ""), tw, taille, ql_max)
        top0 = y + (h - _bloc_carte_h(ql, taille)) / 2
        qh = ql * LH_QUESTION * (taille / D.TYPE["small"])
        D.add_text(slide, tx, top0, tw, qh,
                   [(texte, {"size": taille, "bold": True, "line_spacing": 0.96})])
        D.add_text(slide, tx, top0 + qh + 0.04, tw, 0.17,
                   [(_contexte_joli(q.get("contexte", "")),
                     {"size": D.TYPE["tiny"], "color": D.MUTED})])
        ry = top0 + qh + 0.31
        rw = w - pad - 1.55
        mn = q.get("min") if q.get("min") is not None else 0
        mx = q.get("max") if q.get("max") is not None else 3
        D.add_range_bar(slide, tx, ry, rw, 0.13, mn, mx, 3.0, D.OK, marker=q.get("moyenne"))
        _valeur_cote_barre(slide, tx + rw + 0.14, ry, w - pad - rw - 0.20,
                           [(fmt(q.get("ecartType")),
                             {"size": D.TYPE["h3"], "bold": True, "color": D.OK,
                              "align": PP_ALIGN.RIGHT}),
                            ("écart-type", {"size": D.TYPE["tiny"], "color": D.MUTED,
                                            "align": PP_ALIGN.RIGHT})])

    _entete_colonne(slide, xg, colw, D.OK, "Scores les plus hauts",
                    "Maturité la plus haute — points d'appui à valoriser")
    _cartes_colonne(slide, xg, colw, bloc.get("hauts", []), D.OK, rendu_haut)
    _entete_colonne(slide, xd, colw, D.OK, "Meilleurs accords",
                    "Dispersion la plus faible des réponses — consensus fort")
    accords = bloc.get("accords", [])
    if accords:
        _cartes_colonne(slide, xd, colw, accords, D.OK, rendu_accord)
    else:
        # Un accord n'a de sens qu'avec >= 2 reponses (ex. equipe a 1 seul
        # repondant) : etat vide explicite plutot qu'une colonne silencieuse.
        D.add_text(slide, xd + 0.05, CONTENU_TOP + 0.66, colw - 0.10, 0.4,
                   [("Pas assez de réponses pour mesurer un accord.",
                     {"size": D.TYPE["small"], "italic": True, "color": D.MUTED})])


# ----------------------------------------------------------------------------
def construire(data, template_path, out_path):
    prs = Presentation(template_path)
    # Charte du modele : on prend la couleur primaire du theme (dk1) comme accent
    # de marque ; repli sur le bleu de la palette si le theme est illisible.
    global ACCENT, CYAN, FOND_PANNEAU
    # Aligne tout le deck sur la charte du template : police de marque (Outfit) +
    # neutres navy/slate + accent cyan, lus dans le theme (= charte OCTO). Sans ca
    # le texte heritait d'Arial et les neutres etaient des gris generiques codes en
    # dur. Detecte, pas code en dur : s'adapte a un autre template fourni.
    marque = D.appliquer_theme(prs)
    ACCENT = marque.get("navy") or D.PALETTE[0]   # accent principal = navy (jauge)
    CYAN = marque.get("cyan") or ACCENT           # accent secondaire = cyan
    FOND_PANNEAU = D.TRACK                          # fond d'encart = slate 100 du theme
    layouts = prs.slide_masters[0].slide_layouts
    nb_template = len(prs.slides)

    cv = data.get("couverture")
    if cv:
        slide = prs.slides.add_slide(_trouver_layout(layouts, COUV_PATTERNS, LAYOUT_COUVERTURE))
        ph = {p.placeholder_format.idx: p for p in slide.placeholders}
        if 0 in ph: ph[0].text_frame.text = cv.get("titre", "Restitution")
        if 1 in ph: ph[1].text_frame.text = cv.get("sousTitre", "")
        if 2 in ph: ph[2].text_frame.text = "OCTO Technology"
        if 3 in ph: ph[3].text_frame.text = cv.get("date", "")

    for bloc in data.get("blocs", []):
        slide_vue_ensemble(prs, layouts, bloc)
        slide_radar(prs, layouts, bloc)
        slide_points_forts(prs, layouts, bloc)
        slide_points(prs, layouts, bloc)

    # Retire les slides d'exemple du template (garde masters/layouts OCTO).
    xml_slides = prs.slides._sldIdLst
    for slide_xml in list(xml_slides)[:nb_template]:
        xml_slides.remove(slide_xml)

    problemes = D.verifier_geometrie(prs)
    if problemes:
        sys.stderr.write("ATTENTION geometrie :\n" + "\n".join(problemes) + "\n")

    prs.save(out_path)
    return prs, problemes


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stderr.write(
            "usage: python export-restitution-ppt.py "
            "<donnees.json> <sortie.pptx> [modele.pptx]\n")
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    # Template du modele : 3e argument, sinon $TEMPLATE_PPTX, sinon le template OCTO.
    # Le serveur n'en passe que 2 (data, out) => repli sur TEMPLATE (compat preservee).
    template = (sys.argv[3] if len(sys.argv) > 3 else None) or os.environ.get("TEMPLATE_PPTX") or TEMPLATE
    prs, problemes = construire(data, template, sys.argv[2])
    print(sys.argv[2], "-", len(prs.slides), "slides",
          "- geometrie OK" if not problemes else f"- {len(problemes)} pb geometrie")
