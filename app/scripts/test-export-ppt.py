"""Test du generateur de restitution PPT (US6.4).

Verifie, sans LibreOffice, que le deck genere :
  - a le bon nombre de slides (1 couverture + 4 par bloc, dont "Points forts") ;
  - ne contient AUCUNE forme hors cadre (pptx_deck.verifier_geometrie), y
    compris avec une question anormalement longue (auto-ajustement de police) ;
  - se construit aussi bien avec qu'avec radar large / sans comparaison /
    valeurs manquantes (robustesse).

Usage : python test-export-ppt.py
"""
import os
import sys
import struct
import zlib
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Le generateur a un nom de fichier non importable (tirets) -> import par chemin.
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "gen", os.path.join(os.path.dirname(__file__), "export-restitution-ppt.py"))
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

echecs = 0


def check(cond, msg):
    global echecs
    if cond:
        print(f"  ok   {msg}")
    else:
        echecs += 1
        print(f"  FAIL {msg}")


def png_factice(path, w, h):
    """Ecrit un PNG uni minimal de dimensions w x h (sans PIL)."""
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\x9c\xc0\xd6" * w for _ in range(h))
    idat = zlib.compress(raw)
    with open(path, "wb") as fp:
        fp.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def piliers(vals):
    noms = ["Equipe Produit", "Excellence Technique", "Culture De L'Entreprise Agile", "Agilite A L'Echelle"]
    return [{"nom": n, "moyenne": v} for n, v in zip(noms, vals)]


def bloc_equipe(nom, vals, avec_comp=True, radar=None):
    b = {
        "type": "equipe", "nom": nom, "departement": "DSI Paiements", "effectif": 5,
        "piliers": piliers(vals),
        "objectifs": [{"nom": "Obj", "moyenne": vals[0], "precedent": None, "pilierIndex": 0}],
        "dispersion": [
            {"texte": "Est-ce que le recrutement est adapte aux besoins de l'equipe ?",
             "ecartType": 1.0, "min": 1, "max": 3, "moyenne": 2.0, "contexte": "RH"},
            {"texte": "Comment les utilisateurs sont-ils consultes regulierement et tot ?",
             "ecartType": 0.9, "min": 0, "max": 3, "moyenne": 1.5, "contexte": "Produit"},
            {"texte": "Comment est mise en oeuvre l'amelioration continue dans l'equipe ?",
             "ecartType": 0.8, "min": 1, "max": 3, "moyenne": 2.2, "contexte": "Culture"},
        ],
        "faibles": [
            {"texte": "Les besoins utilisateurs sont-ils compris et reformules en user stories ?",
             "moyenne": 1.4, "contexte": "Produit"},
            {"texte": "Les taches sont-elles decrites, decoupees et ordonnees dans un backlog ?",
             "moyenne": 1.6, "contexte": "Produit"},
            # Question anormalement longue : stress-test de l'auto-ajustement de
            # police (D.ajuster_police) — ne doit ni deborder ni etre tronquee.
            {"texte": ("L'equipe a-t-elle les moyens d'organiser son delivery pour livrer "
                       "regulierement de la valeur aux utilisateurs finaux, en tenant compte "
                       "des contraintes de securite, de conformite et d'architecture technique "
                       "imposees par le systeme d'information de l'entreprise ?"),
             "moyenne": 1.6, "contexte": "Technique"},
        ],
        "hauts": [
            {"texte": "Comment la strategie de release apporte-t-elle de la valeur aux clients ?",
             "moyenne": 2.8, "contexte": "Produit"},
            {"texte": "Les retrospectives ont-elles un impact reel sur le fonctionnement ?",
             "moyenne": 2.6, "contexte": "Culture"},
            {"texte": "L'equipe priorise-t-elle son backlog selon la valeur metier ?",
             "moyenne": 2.5, "contexte": "Produit"},
        ],
        "accords": [
            {"texte": "L'equipe sait-elle pourquoi elle livre ce qu'elle livre ?",
             "ecartType": 0.2, "min": 2, "max": 3, "contexte": "Vision"},
            {"texte": "Le role de chacun dans l'equipe est-il clair ?",
             "ecartType": 0.3, "min": 2, "max": 3, "contexte": "Culture"},
        ],
        "commentaire": "Nette progression depuis janvier sur le fonctionnement produit.\nVigilance : ingenierie/testing en retrait.",
    }
    if radar:
        b["radarImage"] = radar
    if avec_comp:
        b["comparaison"] = {
            "disponible": True, "precedenteDate": "15/01/2026",
            "piliers": [{"nom": p["nom"], "courant": p["moyenne"],
                         "precedent": max(0, p["moyenne"] - 0.8),
                         "delta": 0.8} for p in piliers(vals)],
        }
    else:
        b["comparaison"] = {"disponible": False}
    return b


def main():
    tmp = tempfile.mkdtemp(prefix="test-ppt-")
    radar_carre = os.path.join(tmp, "radar.png")
    radar_large = os.path.join(tmp, "radar-wide.png")
    png_factice(radar_carre, 520, 520)
    png_factice(radar_large, 900, 360)  # tres large : ne doit pas deborder

    dep = bloc_equipe("DSI Paiements", [2.0, 1.8, 1.6, 1.9], avec_comp=False, radar=radar_carre)
    dep["type"] = "departement"; dep["nbEquipes"] = 2; dep["departement"] = "DSI Paiements"
    data = {
        "couverture": {"titre": "Restitution — Maturite agile/produit",
                       "sousTitre": "Departement DSI Paiements", "date": "24/06/2026"},
        "blocs": [
            dep,
            bloc_equipe("Squad Paiement", [2.7, 2.0, 1.4, 2.3], radar=radar_large),
            bloc_equipe("Squad Virement", [1.5, 1.2, 1.0, 1.4], avec_comp=True, radar=radar_carre),
        ],
    }

    out = os.path.join(tmp, "deck.pptx")
    prs, problemes = gen.construire(data, gen.TEMPLATE, out)

    print("Structure :")
    check(len(prs.slides) == 1 + 3 * 4, f"13 slides (couverture + 3x4) — recu {len(prs.slides)}")
    check(os.path.exists(out) and os.path.getsize(out) > 0, "fichier .pptx ecrit")

    print("Geometrie (aucune forme hors cadre) :")
    if problemes:
        for p in problemes:
            print("   -", p)
    check(not problemes, f"toutes les formes dans le cadre — {len(problemes)} probleme(s)")

    print("Robustesse — bloc sans comparaison et valeurs manquantes :")
    data2 = {"couverture": None, "blocs": [{
        "type": "equipe", "nom": "Equipe Vide", "departement": "", "effectif": 0,
        "piliers": [{"nom": "P1", "moyenne": None}, {"nom": "P2", "moyenne": 2.0}],
        "objectifs": [], "dispersion": [], "faibles": [], "hauts": [], "accords": [],
        "commentaire": "", "comparaison": {"disponible": False},
    }]}
    out2 = os.path.join(tmp, "deck2.pptx")
    prs2, pb2 = gen.construire(data2, gen.TEMPLATE, out2)
    check(len(prs2.slides) == 4, f"4 slides (pas de couverture) — recu {len(prs2.slides)}")
    check(not pb2, f"geometrie OK meme avec donnees partielles — {len(pb2)} probleme(s)")

    print("\nTOUS LES TESTS PASSENT" if echecs == 0 else f"\n{echecs} TEST(S) EN ECHEC")
    sys.exit(0 if echecs == 0 else 1)


if __name__ == "__main__":
    main()
