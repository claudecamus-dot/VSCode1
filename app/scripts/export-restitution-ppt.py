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


def joli_nom(nom):
    if not nom:
        return nom
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
    D.add_rect(slide, x, y + 0.26, w, 0.014, fill=D.LINE)


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
        cur = moyenne([p.get("courant") for p in comp["piliers"]])
        prec = moyenne([p.get("precedent") for p in comp["piliers"]])
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


# ----------------------------------------------------------------------------
# Slide 2 : Radar par objectif + commentaire + evolution
# ----------------------------------------------------------------------------
def _png_size(path):
    """Dimensions (w,h) d'un PNG sans dependance (lecture de l'entete IHDR)."""
    try:
        with open(path, "rb") as fp:
            head = fp.read(24)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")
    except Exception:
        pass
    return None


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
    # panneau de texte a droite demarre juste apres la largeur REELLE de
    # l'image (calculee ci-dessous), pas a une frontiere fixe — ce qui evite
    # tout vide entre le radar et le texte quel que soit son ratio.
    img = bloc.get("radarImage")
    max_h = CONTENU_BOTTOM - CONTENU_TOP
    gauche_w_max = 7.5   # large : la hauteur reste quasi-toujours la contrainte
    w = 0
    if img and os.path.exists(img):
        size = _png_size(img)
        if size and size[0] and size[1]:
            aspect = size[0] / size[1]
            w, h = gauche_w_max, gauche_w_max / aspect
            if h > max_h:
                h, w = max_h, max_h * aspect
        else:
            w = h = max_h
        left = MARGE_X
        top = CONTENU_TOP + (max_h - h) / 2
        slide.shapes.add_picture(img, Inches(left), Inches(top),
                                 width=Inches(w), height=Inches(h))

    GAP_RADAR_TEXTE = 0.30
    px = MARGE_X + w + GAP_RADAR_TEXTE if w else 7.4
    pw = 10 - px - MARGE_X

    # ---- Colonne droite : commentaire (callout) puis evolution ----
    py = CONTENU_TOP
    commentaire = (bloc.get("commentaire") or "").strip()
    txt_in = pw - 0.50
    comp = bloc.get("comparaison", {})
    n_ev = len(comp.get("piliers", [])) if comp.get("disponible") else 0

    # Hauteur du commentaire : adaptee au texte. Avec evolution, on borne le
    # commentaire pour lui reserver la place ; SANS evolution, le callout occupe
    # toute la bande (et le texte y est centre verticalement => pas de grand vide).
    h_comm = _hauteur_commentaire(commentaire, txt_in)
    reste = CONTENU_BOTTOM - py
    if n_ev:
        place_ev_min = 0.38 + n_ev * 0.34 + 0.30   # entete + lignes serrees + gap
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
    D.add_rect(slide, px, panel_top, 0.07, h_comm, fill=ACCENT, rounded=True, radius=0.5)
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
    if n_ev:
        ey = py + h_comm + 0.28
        _surtitre(slide, px, ey, pw, f"ÉVOLUTION VS {comp.get('precedenteDate', '')}".upper())
        rows_top = ey + 0.40
        bottom = CONTENU_BOTTOM - 0.18         # marge au-dessus du n° de slide
        piliers_ev = comp.get("piliers", [])
        row_h = min(0.44, (bottom - rows_top) / max(1, len(piliers_ev)))
        # Colonnes : le cluster numerique est cale a droite mais s'arrete avant
        # le badge n° de slide (coin bas-droit) => right_lim.
        delta_w, avap_w = 0.80, 0.95
        right_lim = px + pw - 0.30
        delta_x = right_lim - delta_w
        avap_x = delta_x - avap_w
        name_w = avap_x - (px + 0.22)
        y = rows_top
        for i, p in enumerate(piliers_ev):
            D.add_dot(slide, px, y + (row_h - 0.11) / 2, 0.11, D.couleur_pilier(i))
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


# Hauteur du contenu d'une carte = question (ql lignes, a `taille` pt) + contexte
# + barre. Seule la hauteur de la question depend de `taille` (contexte et barre
# gardent une taille fixe) — les rendus placent leurs elements aux memes offsets,
# d'ou cette source unique.
def _bloc_carte_h(ql, taille=D.TYPE["small"]):
    lh = LH_QUESTION * (taille / D.TYPE["small"])
    return ql * lh + 0.04 + 0.17 + 0.10 + 0.28


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
        ql_max = max(1, int((card_h - PAD_CARTE - 0.59) / lh + 1e-6))
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
        mn = q.get("min", 0) or 0
        mx = q.get("max", 3) or 3
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
        mn = q.get("min", 0) or 0
        mx = q.get("max", 3) or 3
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
    global ACCENT
    ACCENT = D.theme_colors(prs).get("dk1") or D.PALETTE[0]
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

    for bloc in data["blocs"]:
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
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    # Template du modele : 3e argument, sinon $TEMPLATE_PPTX, sinon le template OCTO.
    # Le serveur n'en passe que 2 (data, out) => repli sur TEMPLATE (compat preservee).
    template = (sys.argv[3] if len(sys.argv) > 3 else None) or os.environ.get("TEMPLATE_PPTX") or TEMPLATE
    prs, problemes = construire(data, template, sys.argv[2])
    print(sys.argv[2], "-", len(prs.slides), "slides",
          "- geometrie OK" if not problemes else f"- {len(problemes)} pb geometrie")
