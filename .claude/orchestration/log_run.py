# +-- GÉNÉRÉ — NE PAS ÉDITER LOCALEMENT ---------------------------------------
# | Source de vérité : hub de supervision VScode5, .claude/dispositif/canon/log_run.py
# | Une correction faite ICI sera ÉCRASÉE à la prochaine propagation. Pour la
# | garder : la signaler au hub, qui corrige le canon et re-synchronise.
# | (Depuis le hub : « py .claude/dispositif/sync_dispositif.py » — ce script
# |  n'est pas déployé, il n'existe pas dans ce dépôt.)
# | Provenance canon : 4eb1f67f du 2026-11-02 — permet, au prochain sync, de dire si
# | une différence vient d'une édition locale ou d'une avance du canon (voir
# | `determiner_cause` dans sync_dispositif.py au hub).
# +---------------------------------------------------------------------------

"""Journal des orchestrations (étage O-A) — append d'un run dans runs.jsonl.

Usage : py .claude/orchestration/log_run.py '<json>'   (ou JSON sur stdin)
Lecture seule : `--stats [--champ X] [--depot Y]` compte, `--lister <champ>
<valeur>` DÉTAILLE (numéro de ligne, ts, notes intégrales) — c'est par là qu'on
voit le stock de runs `partiel` jamais relus, invisible d'un compteur.
Champs requis : demande (str), qualification (orchestre|direct-signale).
Champs usuels : plan (liste d'étapes {etape, agent, mode, modele}), resultat
(en-cours|succes|en-attente-validation|partiel|echec), reprises (int), notes (str),
playbook (str|null : nom du playbook instancié, incrément O-B — null en composition
libre). `ts` est ajouté si absent.

Un run 'succes'/'orchestre' SANS étape revue-increment au plan ni trace dans notes
est REFUSÉ (rien n'est écrit) sauf champ `derogation_revue` (str, motif explicite —
cf. `verifier_revue_increment`, finding
`VScode5:revue-obligatoire-sautee-sept-runs-sur-dix`, 2026-09-04).

Chaque étape du plan accepte un champ OPTIONNEL `etat` valant `ok`, `echec` ou
`non-rendu` (veille « OrchestraBench », arXiv:2608.05263, adoptée le 2026-09-08).
Un run `succes` dont au moins une étape porte `echec` ou `non-rendu` est REFUSÉ en
nommant l'étape : un fan-out dont une branche a échoué n'est pas un succès entier,
et c'est exactement ce que l'étude mesure — l'échec d'un sous-agent dilué dans une
synthèse lissée. `partiel` et `echec` passent : ils DISENT l'échec. Une valeur hors
des trois BLOQUE un `succes` (sans quoi `"etat": "KO"` passerait pour inoffensif),
mais laisse passer un `echec`/`partiel` avec un avertissement — R5 exige que le run
raté soit journalisé, et le refuser sur une faute de frappe en perdrait la trace
(revue bmad-code-review, 2026-09-09). Le contrôle vaut à l'append ET au `--solde`.
Consommé à terme par le superviseur étage 2 (métrique « plan vs réel »).

JOURNALISER DÈS LA COMPOSITION DU PLAN, PAS À LA FIN (constat superviseur VSCode
2026-07-27 : runs.jsonl inexistant 4 jours après le déploiement du dispositif alors
que des enchaînements multi-étapes avaient bien eu lieu — journaliser en dernier
revient à ne rien journaliser dès que le run est interrompu, or c'est précisément
là que le signal vaut le plus). L'orchestrateur écrit donc la ligne à l'étape 2 avec
`"resultat": "en-cours"`, puis la solde à la remise. Un `en-cours` qui traîne est un
run abandonné : le scan le compte à part et ne le mêle pas aux taux de réussite.

VALIDATION UTILISATEUR — deux pieces indissociables (salle `inspection-critique`
du 2026-09-19, arbitree). Tout run porte un champ OBLIGATOIRE
`livrable_utilisateur` (booleen) + une justification courte
(`livrable_utilisateur_motif`, exigee quand il vaut `false`). A `true`, le run
`succes` doit porter une quittance NOMMEE
`validation: {par, artefact_ouvert, quand}` : `par` = UN NOM DE PERSONNE,
`artefact_ouvert` = un chemin/URL/capture NON NULLABLE, `quand` = horodatage.
Quatre refus mecaniques (cf. `verifier_validation_utilisateur`) : champ absent ;
`true` sans `validation` ; `artefact_ouvert` vide meme si `par` est rempli ;
`par` portant une identite d'AGENT (veille « Lost in Simulation », adoptee le
2026-09-19). NON RETROACTIF : au `--solde`, un run
qui ne porte pas le champ (les 194 d'avant le deploiement) n'est pas controle.

Solde d'un run ouvert ou en attente (constat superviseur 2026-07-23 : la boucle
en-attente-validation ne se refermait jamais sans édition manuelle du journal) :

    py .claude/orchestration/log_run.py --solde <prefixe-ts> <resultat> "note"

Requalifie LE run dont le ts commence par <prefixe-ts> (erreur si 0 ou >1
correspondance) et trace la validation dans notes (`solde <date> : <note>`).

CAPACITÉ OPT-IN — « solde sous revue » (`solde_revue_requise`, ÉTEINTE PARTOUT
par défaut). Un projet peut exiger que le solde d'un run dont le plan touche SA
zone surveillée porte une note commençant par « revue: » — la trace, dans le
journal, que la boucle de revue a bien eu lieu avant de déclarer le run soldé.
Elle se déclare dans la configuration LOCALE du dépôt,
`<repo>/.claude/warn_verif_before_commit.json` (le même fichier que le hook
`warn_verif_before_commit.py`, dont ce mécanisme reprend exactement la
mécanique : `_DEFAULT_* = False`, lecture fail-open, activation projet par
projet, jamais de nouveau signal hérité sans déclaration explicite) :

    {"watched_prefixes": ["src/", "server.js"], "solde_revue_requise": true}

Sans ce fichier, sans la clé, avec la clé à `false`, ou avec un
`watched_prefixes` vide : comportement inchangé, aucun refus possible. Activée,
elle REFUSE (code 1) le solde d'un run dont la `demande` ou le `plan` nomme un
des préfixes surveillés tant que la note ne commence pas par « revue: ». La
détection est textuelle (le plan cite le chemin ou non) : c'est un garde-fou, pas
une preuve — un plan qui ne nomme aucun chemin n'est pas vu. Un run soldé `echec`
est concerné comme les autres : la note « revue: abandonné, rien livré » suffit.
"""
import bisect
import datetime
import json
import math
import os
import re
import sys

# Windows : la console par défaut est cp1252 — un message avec tiret cadratin ou
# un JSON accenté sur stdin passerait en mojibake (ou casserait un lecteur UTF-8).
# stdin en utf-8-sig : un pipe PowerShell 5.1 ('...' | py log_run.py) préfixe un
# BOM qui casserait json.loads (vécu 2026-07-23) ; sans BOM, utf-8-sig == utf-8.
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8-sig")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

RUNS_PATH = os.environ.get("AGENT_ORCHESTRATION_RUNS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "runs.jsonl"
)
QUALIFICATIONS = ("orchestre", "direct-signale")
# Un run ouvert à la composition vaut « en-cours » ; il se solde ensuite vers l'un des
# états terminaux, dont « en-attente-validation » — état par défaut d'un livrable que
# l'utilisateur doit approuver, et qui manquait ici (la skill l'exige pourtant, il
# n'était donc atteignable qu'en éditant le journal à la main).
RESULTATS_SOLDE = ("succes", "en-attente-validation", "partiel", "echec")
# A l'APPEND, « en-cours » s'ajoute aux etats terminaux. Sans cette liste, `resultat`
# n'etait valide qu'au solde : « succès » (accent, faute de frappe naturelle en
# francais) et « nimportequoi » entraient dans le journal en exit 0, faussaient le
# taux de reussite et echappaient au controle « en-attente-validation » (reproduit
# le 2026-08-31).
RESULTATS_APPEND = ("en-cours",) + RESULTATS_SOLDE
# Vocabulaire FERMÉ de l'état d'une étape du plan. Fermé et non libre : la moitié de
# l'intérêt du champ est qu'un `"etat": "KO"` — écrit de bonne foi — ne passe PAS pour
# un état inoffensif à côté d'un `resultat: succes`.
ETATS_ETAPE = ("ok", "echec", "non-rendu")
ETATS_ETAPE_FAUTIFS = ("echec", "non-rendu")
# Issue de la verification AVAL d'une etape (critere de veille n7) : optionnelle, stricte.
VERIFICATIONS_AVAL = ("ok", "ko", "non-verifiee")

# Vocabulaire FERME de la FORME de la tache d'un run -- veille du 2026-09-20,
# « Lois de scaling conditionnelles du multi-agent ». [S5] (arXiv 2512.08296,
# Google, PREPRINT, et juge et partie) mesure sur 260 configurations un ecart de
# +80,8 % (tache decomposable) a -70 % (tache sequentielle) : l'effet du
# multi-agent suit la FORME de la tache, pas le NOMBRE d'agents. Un plafond
# « <= 4 salles » borne donc la mauvaise variable. Le champ est DECLARE et non
# deduit : typer la forme depuis l'etage deterministe est hors de portee, et une
# heuristique textuelle en ferait un champ decoratif (meme raisonnement que
# `livrable_utilisateur`, qui a DEJA ete arbitre en declare).
#
# NON RETROACTIF, et c'est le point : absent = accepte en silence. Les 197 runs
# deja journalises n'en portent aucun, et les requalifier a posteriori
# fabriquerait exactement la donnee que l'ablation mono-agent doit aller
# chercher. Ce champ ne PROUVE rien ; il rend l'ablation stratifiable, c'est-a-dire
# possible (salle `anti-consensus` du 2026-09-20 : un lot heterogene rendrait UN
# chiffre generalise a tort sur une plage de variance de 150 points).
FORMES_TACHE = ("decomposable", "sequentiel", "inconnu")
CHAMP_FORME = "forme_tache"
CHAMP_FORME_MOTIF = "forme_tache_motif"
# Seule `decomposable` exige un motif ecrit : c'est la valeur qui ACHETE le
# fan-out. `sequentiel` et `inconnu` n'autorisent rien, donc ne justifient rien --
# et exiger un motif pour les trois rendrait le champ couteux a renseigner
# honnetement, donc renseigne a `decomposable` par reflexe. La contrainte est
# placee la ou elle coute quelque chose.
FORME_A_JUSTIFIER = "decomposable"

# --- « Solde sous revue » : capacité OPT-IN, ÉTEINTE PARTOUT par défaut ------
# Mécanique reprise TELLE QUELLE de `.claude/hooks/warn_verif_before_commit.py`
# (`_DEFAULT_DOD_ENABLED = False` + clé lue dans la config JSON locale du dépôt) :
# le canon est propagé à 6 dépôts, un signal nouveau ne doit JAMAIS s'y allumer
# par héritage. Chaque projet active ce qu'il a explicitement déclaré, dans SON
# fichier — aucun autre n'en hérite. Le fichier est le MÊME que celui du hook :
# la zone surveillée d'un projet n'a pas à être décrite deux fois, et une zone
# décrite deux fois finit par diverger.
_CONFIG_FILENAME = "warn_verif_before_commit.json"
_DEFAULT_SOLDE_REVUE_REQUISE = False   # opt-in : aucun projet ne l'a par défaut
# Motif attendu en tête de note. « revue: » et pas « revue-increment » : un solde
# peut tracer une revue de campagne, une revue humaine ou la skill — c'est
# l'intention de revue qui est exigée, pas un outil précis.
_MOTIF_NOTE_REVUE = "revue:"


def _config_path() -> str:
    """`<repo>/.claude/warn_verif_before_commit.json`, dérivé de l'emplacement de
    CE fichier (`<repo>/.claude/orchestration/log_run.py`) — jamais du cwd, un
    solde lancé depuis un sous-dossier doit lire la même configuration."""
    return os.environ.get("AGENT_ORCHESTRATION_CONFIG") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), _CONFIG_FILENAME
    )


def config_solde_revue():
    """(requise, prefixes_surveilles) pour CE dépôt.

    Fail-open intégral, comme `_read_config_dict()` du hook : fichier absent,
    illisible, JSON invalide, mauvais type → capacité éteinte, aucun refus
    possible. Un dispositif de journalisation ne se met pas en travers du
    journal parce qu'un fichier de configuration est abîmé."""
    requise, prefixes = _DEFAULT_SOLDE_REVUE_REQUISE, ()
    try:
        with open(_config_path(), encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception:
        return requise, prefixes
    if not isinstance(cfg, dict):
        return requise, prefixes
    if isinstance(cfg.get("solde_revue_requise"), bool):
        requise = cfg["solde_revue_requise"]
    brut = cfg.get("watched_prefixes")
    if isinstance(brut, list):
        prefixes = tuple(p for p in brut if isinstance(p, str) and p)
    return requise, prefixes


def zones_touchees(run: dict, prefixes) -> list:
    """Les préfixes surveillés que la `demande` ou le `plan` du run NOMMENT.

    Détection textuelle assumée : `runs.jsonl` ne porte pas la liste des fichiers
    touchés, seulement une demande et des étapes en prose. Un plan qui cite
    `comop-pptx-prototype/src/` est vu, un plan qui dit « corriger le générateur »
    ne l'est pas. C'est donc un rappel, jamais une preuve de couverture — le
    docstring du module le dit au lecteur qui active la capacité."""
    if not prefixes:
        return []
    morceaux = [str(run.get("demande") or "")]
    for e in run.get("plan") or []:
        if isinstance(e, dict):
            morceaux.append(str(e.get("etape", "")) + " " + str(e.get("agent", "")))
    texte = " ".join(morceaux).lower()
    return [p for p in prefixes if p.lower() in texte]


def verifier_note_de_revue(run: dict, note: str) -> str | None:
    """Message de refus si ce dépôt exige une note « revue: » et que le plan
    touche sa zone surveillée, sinon None (cas de tous les projets par défaut)."""
    requise, prefixes = config_solde_revue()
    if not requise:
        return None
    touchees = zones_touchees(run, prefixes)
    if not touchees:
        return None
    if str(note or "").strip().lower().startswith(_MOTIF_NOTE_REVUE):
        return None
    return (
        "log_run --solde REFUS : ce depot exige une note de revue pour solder un "
        "run dont le plan touche sa zone surveillee "
        f"({', '.join(touchees)}) — `solde_revue_requise: true` dans "
        f".claude/{_CONFIG_FILENAME}.\n"
        f"  Rejouer avec une note commencant par '{_MOTIF_NOTE_REVUE}', qui dit "
        "ce qui a ete revu et comment (ex. \"revue: smoke-test rejoue + rendu "
        "PowerPoint inspecte\"). Un run abandonne se solde de meme : "
        "\"revue: abandonne, rien livre\"."
    )


def deja_solde(run: dict) -> bool:
    """Vrai si le run a deja ete solde. Champ structure `solde` d'abord (ecrit
    depuis 2026-09-27) ; sinon repli textuel pour les runs historiques : un
    segment de `notes` (decoupe sur " | ") qui commence par "solde " — couvre la
    note d'un run a notes vides, ecrite sans pipe par `.strip(" |")`.
    `validation` n'est PAS un marqueur (il s'ecrit aussi a l'append) et
    `demande` n'est jamais lue."""
    solde = run.get("solde")
    if isinstance(solde, dict) and solde:
        return True
    notes = str(run.get("notes") or "")
    # Format EXACT ecrit par `solder()` (« solde <date ISO> : ») : un segment
    # « solde faux : ... » ne suffit plus a forger un solde (P3, 2026-09-28).
    return any(_SEGMENT_SOLDE.match(seg.strip()) for seg in notes.split(" | "))


_SEGMENT_SOLDE = re.compile(r"solde \d{4}-\d{2}-\d{2}")


def verifier_re_solde(run: dict, re_solder: bool) -> str | None:
    """Un run deja solde ne se re-solde que par geste delibere (`--re-solder`),
    y compris un `partiel` deja note. Appelee avant toute mutation."""
    if not deja_solde(run) or re_solder:
        return None
    solde = run.get("solde") if isinstance(run.get("solde"), dict) else {}
    quand = solde.get("quand")
    if not quand:
        segs = [s.strip() for s in str(run.get("notes") or "").split(" | ")
                if s.strip().startswith("solde ")]
        quand = segs[-1][len("solde "):].split(" : ", 1)[0] if segs else "?"
    anterieur = solde.get("resultat") or run.get("resultat")
    ident = run.get("ts") or str(run.get("demande") or "")[:60]
    return (f"log_run REFUS : run {ident} deja solde le {quand} ({anterieur} -> ...)"
            " - relance avec --re-solder si le re-soldage est un geste delibere")


def solder(argv) -> int:
    """--solde <prefixe-ts> <resultat> [note] — requalifie un run existant.

    Si le dépôt a activé `solde_revue_requise` (opt-in, cf. docstring du module),
    la note doit commencer par « revue: » dès que le plan du run nomme un de ses
    `watched_prefixes` — sinon le solde est refusé, le journal reste intact.

    `--par <nom> --artefact <chemin|url>` (2026-09-23) : pose la quittance NOMMEE
    qu'exige un run `livrable_utilisateur: true` pour passer `succes`. Sans ces
    options, un tel run ne pouvait JAMAIS etre solde en succes par la CLI, meme
    valide par l'utilisateur (constate sur VSCode3). Les controles de
    `verifier_validation_utilisateur` s'appliquent au bloc ainsi construit.

    `--demande <fragment>` (2026-09-27) : selectionne le run par un fragment de
    sa `demande` au lieu du prefixe de `ts`. Motif mesure : deux runs du journal
    du hub portent `ts: null`, donc `str(r.get("ts","")).startswith(prefixe)`
    matche les DEUX sur « None » et le solde est refuse a jamais. Un INDEX de
    ligne aurait ete un identifiant muet dans un journal opposable (R5) ; le
    fragment dit de quel run on parle. Le selecteur ne contourne RIEN : le run
    choisi passe par les memes quatre gardes, et `len(cibles) != 1` reste un
    refus."""
    options = {}
    positionnels = []
    i = 0
    while i < len(argv):
        if argv[i] in ("--par", "--artefact", "--demande", "--solde-par") and i + 1 < len(argv):
            options[argv[i][2:]] = argv[i + 1]
            i += 2
        elif argv[i] == "--re-solder":
            options["re-solder"] = True
            i += 1
        elif argv[i] == "--solde-par":
            print("log_run --solde : --solde-par attend un run_id (valeur absente)")
            return 1
        elif argv[i] == "--demande":
            print("log_run --solde : --demande attend un fragment de demande (valeur absente)")
            return 1
        else:
            positionnels.append(argv[i])
            i += 1
    argv = positionnels
    # None = flag absent ; "" / blanc = flag present mais vide -> refus explicite,
    # jamais un repli silencieux en mode prefixe (positionnels decales).
    fragment = options.get("demande")
    if fragment is not None and not fragment.strip():
        print("log_run --solde : --demande vide refuse (fragment de demande requis)")
        return 1
    if len(argv) < (1 if fragment is not None else 2):
        print(f"log_run --solde : usage : --solde <prefixe-ts> <{'|'.join(RESULTATS_SOLDE)}> [note]"
              " [--par <nom> --artefact <chemin>] [--re-solder]\n"
              f"  ou, pour un run sans ts : --solde --demande <fragment> <{'|'.join(RESULTATS_SOLDE)}> [note]")
        return 1
    if fragment is not None:
        prefixe, resultat = None, argv[0]
        note = argv[1] if len(argv) > 1 else "valide par l'utilisateur"
    else:
        prefixe, resultat = argv[0], argv[1]
        note = argv[2] if len(argv) > 2 else "valide par l'utilisateur"
    if resultat not in RESULTATS_SOLDE:
        print(f"log_run --solde : resultat attendu : {' | '.join(RESULTATS_SOLDE)}")
        return 1
    try:
        with open(RUNS_PATH, encoding="utf-8") as fh:
            runs = [json.loads(l) for l in fh if l.strip()]
    except (OSError, ValueError) as exc:
        print(f"log_run --solde : lecture impossible ({exc})")
        return 1
    solde_par = options.get("solde-par")
    if solde_par is not None and not any(r.get("run_id") == solde_par for r in runs):
        print(f"log_run --solde : --solde-par {solde_par!r} : run_id absent du journal (refuse)")
        return 1
    if fragment is not None:
        cibles = [r for r in runs
                  if fragment.lower() in str(r.get("demande") or "").lower()]
        critere = f"fragment de demande '{fragment}'"
    else:
        cibles = [r for r in runs if str(r.get("ts", "")).startswith(prefixe)]
        critere = f"prefixe '{prefixe}'"
    if len(cibles) != 1:
        print(f"log_run --solde : {len(cibles)} run(s) pour le {critere} — il en faut exactement 1")
        for r in cibles:
            # `or ''` : un run a demande null faisait planter en TypeError la
            # branche meme qui doit servir a desambiguiser (reproduit 2026-08-31).
            print(f"  - {r.get('ts')} | {str(r.get('demande') or '')[:60]}")
        return 1
    run = cibles[0]
    if solde_par is not None:
        if solde_par == run.get("run_id"):
            print(f"log_run --solde : --solde-par {solde_par!r} est le run a solder lui-meme (refuse)")
            return 1
        homonymes = [r for r in runs if r.get("run_id") == solde_par]
        if len(homonymes) != 1:
            print(f"log_run --solde : --solde-par {solde_par!r} : run_id non unique dans le journal"
                  f" ({len(homonymes)} occurrences) (refuse)")
            return 1
        solveur = homonymes[0]
        try:
            t_solveur = _aware(datetime.datetime.fromisoformat(str(solveur.get("ts"))))
            t_solde = _aware(datetime.datetime.fromisoformat(str(run.get("ts"))))
        except ValueError:
            print(f"log_run --solde : --solde-par {solde_par!r} : ts absent ou illisible"
                  f" (solveur {solveur.get('ts')!r}, run solde {run.get('ts')!r}) (refuse)")
            return 1
        if t_solveur <= t_solde:
            print(f"log_run --solde : --solde-par {solde_par!r} doit etre posterieur au run solde"
                  f" ({solveur.get('ts')} <= {run.get('ts')}) (refuse)")
            return 1
        if solveur.get("resultat") != "succes":
            print(f"log_run --solde : --solde-par {solde_par!r} doit etre un run 'succes'"
                  f" (resultat du solveur : {solveur.get('resultat')!r}) (refuse)")
            return 1
    # Contrôle AVANT toute mutation : un refus laisse le journal exactement dans
    # l'état où il était (aucune réécriture, aucun `notes` allongé d'un solde qui
    # n'a pas eu lieu).
    refus_re_solde = verifier_re_solde(run, bool(options.get("re-solder")))
    if refus_re_solde:
        print(refus_re_solde)
        return 1
    refus = verifier_note_de_revue(run, note)
    if refus:
        print(refus)
        return 1
    # « Une etape en echec interdit le succes » s'appliquait au seul APPEND : `main()`
    # route `--solde` vers `solder()` et retourne AVANT `verifier_etapes_du_plan`. Un
    # run ouvert `en-cours` avec une branche `echec` se requalifiait donc `succes` par
    # la porte de derriere — le garde-fou du 2026-09-08 contourne d'une commande
    # (revue bmad-code-review, 2026-09-09). Controle sur une COPIE portant le resultat
    # vise, comme a l'append, et toujours avant toute mutation.
    refus_etapes = verifier_etapes_du_plan({**run, "resultat": resultat})
    if refus_etapes:
        print(refus_etapes)
        return 1
    refus_forme = verifier_forme_tache({**run, "resultat": resultat})
    if refus_forme:
        print(refus_forme)
        return 1
    refus_gt = verifier_gabarit_topologie(run)
    if refus_gt:
        print(refus_gt)
        return 1
    # NON RETROACTIF : `au_solde=True` fait sortir sans rien controler tout run
    # qui ne PORTE PAS `livrable_utilisateur` — c'est-a-dire les 194 runs ecrits
    # avant le deploiement du champ. Un run qui le porte a ete ecrit apres, et
    # reste controle : sans cela, `--solde` serait la porte de derriere du
    # garde-fou, exactement comme `verifier_etapes_du_plan` l'a ete jusqu'au
    # 2026-09-09.
    if options.get("par") or options.get("artefact"):
        run = {**run}
        runs[runs.index(cibles[0])] = run
        run["validation"] = {
            "par": options.get("par", ""),
            "artefact_ouvert": options.get("artefact", ""),
            "quand": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "rapport": note,
        }
    refus_validation = verifier_validation_utilisateur(
        {**run, "resultat": resultat}, au_solde=True)
    if refus_validation:
        print(refus_validation)
        return 1
    # Lot nominatif : controle a l'append ET au solde, comme les etapes du plan
    # (le solde a deja servi de porte de derriere a un garde-fou, 2026-09-09).
    refus_lot = verifier_lot({**run, "resultat": resultat})
    if refus_lot:
        print(refus_lot)
        return 1
    avant = run.get("resultat")
    run["resultat"] = resultat
    date = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    # `or ""` et non `get("notes", "")` : le journal porte des runs a `"notes": null`,
    # dont le solde ecrivait litteralement « None | solde ... » (meme motif que le
    # `or ''` de la desambiguisation ci-dessus, revue bmad-code-review 2026-09-09).
    run["notes"] = (str(run.get("notes") or "") + f" | solde {date} : {note}").strip(" |")
    # Champ structure (2026-09-27) : lu en premier par `deja_solde`, le texte
    # ci-dessus reste pour les humains.
    entree = {"quand": date, "avant": avant, "resultat": resultat, "note": note}
    # Historique (2026-09-28) : `solde` (dict) ne garde que le DERNIER solde et
    # reste lu tel quel par les lecteurs existants ; `soldes` les empile tous,
    # chacun disant s'il a ete force par `--re-solder`. Une ligne ancienne qui
    # ne porte que le dict l'amorce, pour ne pas perdre le solde anterieur.
    soldes = run.get("soldes") if isinstance(run.get("soldes"), list) else []
    if not soldes and isinstance(run.get("solde"), dict) and run["solde"]:
        soldes = [{**run["solde"], "re_solder": False}]
    run["soldes"] = soldes + [{**entree, "re_solder": bool(options.get("re-solder"))}]
    run["solde"] = entree
    if solde_par is not None:
        run["solde_par"] = solde_par
    # Ecriture atomique (meme convention que .claude/supervision/scan_transcripts.py) : "w" direct sur
    # RUNS_PATH tronque les 94 Ko du journal a mi-parcours si l'ecriture est interrompue
    # (Ctrl-C, coupure, disque plein). Le temporaire vit dans le meme repertoire pour
    # que os.replace reste atomique (meme volume, Windows comme POSIX).
    tmp = RUNS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for r in runs:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, RUNS_PATH)
    print(f"log_run --solde : run {run.get('ts')} requalifie {avant} -> {resultat}")
    return 0


# --- Champs optionnels de l'optimiseur (chantier `optimiser`, 2026-10-03) -------
# Tous OPTIONNELS : absent = accepte (non retroactif, `--solde` compris) ; present
# mais invalide = refus qui liste les valeurs permises. Ils alimentent
# `optimiseur.py` (cellule playbook x gabarit x topologie), jamais le journal lui-meme.
TOPOLOGIES = ("agent-seul", "fan-out", "salle", "workflow", "cascade")
BRAS = ("temoin", "variante", "topologie-reduite")
MODES_SALLE = ("classique", "comite", "comite-augmente")   # absent = classique ; seulement si topologie == "salle"
# comite-augmente = comite + espace partage (tableau commun en ajout seul, lu par les voix au tour 2)
# Alias legacy (journal historique) : acceptes en entree, normalises vers la valeur actuelle.
MODES_SALLE_LEGACY = {"neuronale": "comite", "neuronale-augmentee": "comite-augmente"}
TOUR2_NA = "na"   # salle sans desaccord au tour 1 ; true = tour 2 joue, false = desaccord sans tour 2
CHAMPS_ENTIERS_OPT = ("tokens", "duree_s", "budget_tokens")
# Story 19.2 (arbitrage D11, 3B) : champ OPTIONNEL `isolation`, vocabulaire ferme, valide
# s'il est present. Classique = topologie agent-seul, comite = fan-out, worktree = ce champ.
ISOLATIONS = ("aucune", "worktree")


def _journal_config_path() -> str:
    """Story 19.1/19.2 (D11, 2B) : `<dossier de log_run.py>/config.json`, ou le fichier nomme
    par AGENT_ORCHESTRATION_JOURNAL_CONFIG. Le kit ne livre pas ce fichier : une cible de la
    flotte reste donc eteinte par defaut ; le hub l'active."""
    return os.environ.get("AGENT_ORCHESTRATION_JOURNAL_CONFIG") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "config.json")


def journal_strict() -> bool:
    """True seulement si la config porte `journal_strict: true` (bool). Fail-open : fichier
    absent, illisible, JSON invalide ou mauvais type -> False (comportement historique)."""
    chemin = _journal_config_path()
    try:
        with open(chemin, encoding="utf-8-sig") as fh:   # BOM (Bloc-notes) tolere
            cfg = json.load(fh)
    except FileNotFoundError:
        return False   # cas nominal d'une cible de la flotte : aucun avertissement
    except Exception as exc:
        print(f"log_run AVERTISSEMENT : config du journal illisible ({chemin!r} : "
              f"{type(exc).__name__}) ; journal_strict eteint (fail-open).", file=sys.stderr)
        return False
    if not isinstance(cfg, dict):
        print(f"log_run AVERTISSEMENT : config du journal non objet ({chemin!r}) ; "
              "journal_strict eteint (fail-open).", file=sys.stderr)
        return False
    return cfg.get("journal_strict") is True


def verifier_topologie_obligatoire(run: dict) -> str | None:
    """Refus si `topologie` est absente (append seulement, hors `--lot`, opt-in hub).
    Jamais appelee par `solder()` : une ligne ancienne sans topologie reste soldable."""
    if run.get("topologie") in TOPOLOGIES:
        return None
    return ("log_run REFUS : topologie absente ou invalide (obligatoire sur ce depot, journal_strict).\n"
            f"  Valeurs admises : {' | '.join(TOPOLOGIES)}.\n"
            "  Classique = agent-seul, comite = fan-out ; un worktree se dit par le champ "
            f"isolation ({' | '.join(ISOLATIONS)}).")
# Lot 2 (2026-10-03) : entiers >= 0 stricts (pas de float, pas de bool, pas de null).
CHAMPS_ENTIERS_STRICTS = ("branches_lancees", "duree_branche_max_s")
# Liste blanche : un nom de fichier de prompts/ sans extension (fullmatch : pas de
# saut de ligne final toleré). Un `.md` final, quelle que soit la casse, est refuse.
_RE_GABARIT_OK = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")


def _entier_positif(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and v >= 0


def verifier_salle_voix(run: dict) -> str | None:
    """Refus si `tour2`, `voix`, `famille`, `branches_lancees` ou `duree_branche_max_s`
    sont presents mais invalides. Champ ABSENT -> None.

    `tour2` : bool (true = desaccord au tour 1 ET tour 2 joue ; false = desaccord sans
    tour 2). `voix` : liste de {nom: str non vide, modele: str non vide, duree_s: nombre
    fini >= 0, trouvailles_retenues: entier >= 0}. `famille` : chaine non vide.
    """
    if "tour2" in run and not (isinstance(run["tour2"], bool) or run["tour2"] == TOUR2_NA):
        return (f"log_run REFUS : tour2 invalide : {run['tour2']!r}.\n"
                "  Attendu : true | false (booleen) | \"na\" (pas de desaccord) - "
                "ou champ absent.")
    if "famille" in run and not (isinstance(run["famille"], str) and run["famille"].strip()):
        return (f"log_run REFUS : famille invalide : {run['famille']!r}.\n"
                "  Attendu : chaine non vide (famille de taches) - ou champ absent.")
    for champ in CHAMPS_ENTIERS_STRICTS:
        if champ in run and not _entier_positif(run[champ]):
            return (f"log_run REFUS : {champ} invalide : {run[champ]!r}.\n"
                    "  Attendu : entier >= 0 - ou champ absent.")
    if "voix" in run:
        voix = run["voix"]
        attendu = ("  Attendu : liste de {nom: str, modele: str, duree_s: nombre fini "
                   ">= 0, trouvailles_retenues: entier >= 0} - ou champ absent.")
        if not isinstance(voix, list):
            return f"log_run REFUS : voix invalide : {voix!r}.\n{attendu}"
        for i, v in enumerate(voix):
            ok = (isinstance(v, dict)
                  and isinstance(v.get("nom"), str) and v["nom"].strip()
                  and isinstance(v.get("modele"), str) and v["modele"].strip()
                  and isinstance(v.get("duree_s"), (int, float))
                  and not isinstance(v.get("duree_s"), bool)
                  and math.isfinite(v["duree_s"]) and v["duree_s"] >= 0
                  and _entier_positif(v.get("trouvailles_retenues")))
            if not ok:
                return f"log_run REFUS : voix[{i}] invalide : {v!r}.\n{attendu}"
        noms = [v["nom"].strip().casefold() for v in voix]
        doublons = sorted({n for n in noms if noms.count(n) > 1})
        if doublons:
            return (f"log_run REFUS : voix en double : {', '.join(doublons)}.\n"
                    "  Attendu : un nom de voix UNIQUE par run (une seance par lentille).")
    return None


def verifier_champs_salle_requis(run: dict) -> str | None:
    """A l'APPEND seulement (jamais `--solde`, jamais les lignes deja ecrites) : un run
    `topologie == "salle"` DOIT porter `tour2` (true | false | "na") et `mode_salle`.
    Les autres topologies, ou l'absence de topologie, ne sont pas concernes."""
    if run.get("topologie") != "salle":
        return None
    manquants = [c for c in ("tour2", "mode_salle") if c not in run]
    if manquants:
        return (f"log_run REFUS : topologie=salle exige {', '.join(manquants)}.\n"
                "  tour2 : true (tour 2 joue) | false (desaccord sans tour 2) | \"na\" "
                "(pas de desaccord) ; mode_salle : " + " | ".join(MODES_SALLE)
                + " (alias legacy accepte : " + ", ".join(MODES_SALLE_LEGACY) + ").")
    return None


def verifier_gabarit_topologie(run: dict) -> str | None:
    """Refus si un champ optionnel de l'optimiseur est present mais invalide.

    `gabarit` : nom de fichier de `prompts/*.md` sans extension, ou null.
    `topologie` : TOPOLOGIES. `bras` : BRAS. `tache_id` : chaine non vide.
    `tokens`, `duree_s`, `budget_tokens` : nombre >= 0 (bool exclu), ou null.
    Champ ABSENT -> None : un run anterieur n'en porte aucun, et c'est valide.
    Les champs du lot 2 (salles / fan-out) sont verifies par `verifier_salle_voix`.
    """
    refus_lot2 = verifier_salle_voix(run)
    if refus_lot2:
        return refus_lot2
    refus_instr = verifier_instrumentation(run)
    if refus_instr:
        return refus_instr
    if "gabarit" in run:
        g = run["gabarit"]
        if g is not None and not (isinstance(g, str) and _RE_GABARIT_OK.fullmatch(g)
                                  and not g.lower().endswith(".md")):
            return (f"log_run REFUS : gabarit invalide : {g!r}.\n  Attendu : nom de "
                    "fichier de prompts/*.md SANS extension ni chemin, ou null - ou "
                    "champ absent.")
    if "session_id" in run and not (isinstance(run["session_id"], str)
                                    and run["session_id"].strip()):
        return (f"log_run REFUS : session_id invalide : {run['session_id']!r}.\n"
                "  Attendu : chaine non vide (session Claude Code du run, sert a "
                "rattacher les agents de usage.jsonl) - ou champ absent.")
    if "topologie" in run and run["topologie"] not in TOPOLOGIES:
        return (f"log_run REFUS : topologie invalide : {run['topologie']!r}.\n"
                f"  Attendu : {' | '.join(TOPOLOGIES)} - ou champ absent.")
    if "isolation" in run and run["isolation"] not in ISOLATIONS:
        return (f"log_run REFUS : isolation invalide : {run['isolation']!r}.\n"
                f"  Attendu : {' | '.join(ISOLATIONS)} - ou champ absent.")
    if "bras" in run and run["bras"] not in BRAS:
        return (f"log_run REFUS : bras invalide : {run['bras']!r}.\n"
                f"  Attendu : {' | '.join(BRAS)} - ou champ absent.")
    if "mode_salle" in run:
        if run.get("topologie") != "salle":
            return ("log_run REFUS : mode_salle n'est autorise que si topologie == "
                    "\"salle\".\n  Retirer mode_salle ou poser topologie=salle.")
        ms = run["mode_salle"]
        if isinstance(ms, str) and ms in MODES_SALLE_LEGACY:
            run["mode_salle"] = ms = MODES_SALLE_LEGACY[ms]   # alias legacy -> valeur actuelle
        if ms not in MODES_SALLE:
            return (f"log_run REFUS : mode_salle invalide : {ms!r}.\n"
                    f"  Attendu : {' | '.join(MODES_SALLE)} - ou champ absent "
                    f"(alias legacy accepte : {', '.join(MODES_SALLE_LEGACY)}).")
    if "tache_id" in run and not (isinstance(run["tache_id"], str)
                                  and run["tache_id"].strip()):
        return (f"log_run REFUS : tache_id invalide : {run['tache_id']!r}.\n"
                "  Attendu : chaine non vide (identifiant commun aux deux bras "
                "d'une paire) - ou champ absent.")
    for champ in CHAMPS_ENTIERS_OPT:
        if champ in run:
            v = run[champ]
            if v is not None and (isinstance(v, bool)
                                  or not isinstance(v, (int, float))
                                  or not math.isfinite(v) or v < 0):
                return (f"log_run REFUS : {champ} invalide : {v!r}.\n"
                        "  Attendu : nombre fini >= 0 ou null - ou champ absent.")
    return None


# --- Instrumentation phase 0 (2026-10-10) : relier un run a son cout et a son verdict ---
# Tous OPTIONNELS (les lignes anciennes restent valides). `run_id` est genere a l'ecriture ;
# `verdict_aval` n'est ecrit QUE par `--verdict` (jamais a l'append).
VERDICTS_AVAL = ("confirme", "infirme", "repris", "non-evalue")
VERDICTS_AVEC_PREUVE = ("confirme", "infirme")
PREUVE_MIN_CAR = 8
_RE_RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{5,63}")
_RE_BRIEF_VERSION = re.compile(r"[0-9a-fA-F]{7,40}")


def nouveau_run_id() -> str:
    """Horodatage compact + 6 hex aleatoires : trie dans le temps, collision negligeable."""
    import secrets
    return (datetime.datetime.now().astimezone().strftime("%Y%m%dT%H%M%S")
            + "-" + secrets.token_hex(3))


FAITS_INFIRMES_MAX = 10_000  # borne de saisie : au-dela, faute de frappe


def verifier_instrumentation(run: dict) -> str | None:
    """Refus si `run_id`, `verdict_aval`, `brief_version` ou `correlation_voix` sont
    presents mais invalides. Champ ABSENT -> None (lignes anciennes inchangees)."""
    if "run_id" in run and not (isinstance(run["run_id"], str)
                                and _RE_RUN_ID.fullmatch(run["run_id"])):
        return (f"log_run REFUS : run_id invalide : {run['run_id']!r}.\n"
                "  Attendu : 6 a 64 caracteres [A-Za-z0-9_.-] - ou champ absent "
                "(genere a l'ecriture).")
    if "faits_infirmes" in run:
        fi = run["faits_infirmes"]
        if not (_entier_positif(fi) and fi <= FAITS_INFIRMES_MAX):
            return (f"log_run REFUS : faits_infirmes invalide : {fi!r}.\n"
                    f"  Attendu : entier >= 0 et <= {FAITS_INFIRMES_MAX} fourni par l'appelant "
                    "(0 = aucun fait infirme) - ou champ absent (= non renseigne). "
                    "Ni booleen, ni chaine, ni flottant, ni null.")
    if "brief_version" in run:
        bv = run["brief_version"]
        if not (isinstance(bv, str) and _RE_BRIEF_VERSION.fullmatch(bv)):
            return (f"log_run REFUS : brief_version invalide : {bv!r}.\n"
                    "  Attendu : sha court hexadecimal de 7 a 40 caracteres - ou champ absent.")
    if "verdict_aval" in run:
        v = run["verdict_aval"]
        valeur = v.get("valeur") if isinstance(v, dict) else v
        if valeur not in VERDICTS_AVAL:
            return (f"log_run REFUS : verdict_aval invalide : {valeur!r}.\n"
                    f"  Attendu : {' | '.join(VERDICTS_AVAL)}.")
        if valeur in VERDICTS_AVEC_PREUVE and not (
                isinstance(v, dict) and isinstance(v.get("preuve"), str)
                and len(re.sub(r"\s", "", v["preuve"])) >= PREUVE_MIN_CAR):
            return (f"log_run REFUS : verdict_aval {valeur!r} exige une preuve "
                    f"(commande ou commit, {PREUVE_MIN_CAR} caracteres minimum hors espaces).")
    if "correlation_voix" in run:
        c = run["correlation_voix"]
        attendu = ("  Attendu : {n_voix: entier >= 2, reponses_fausses_identiques: "
                   "entier >= 0, paires_fausses: entier >= 0 (>= reponses_fausses_"
                   "identiques), methode: texte non vide} - ou champ absent.")
        if not isinstance(c, dict):
            return f"log_run REFUS : correlation_voix invalide : {c!r}.\n{attendu}"
        n, ident, paires = (c.get("n_voix"), c.get("reponses_fausses_identiques"),
                            c.get("paires_fausses"))
        if not (_entier_positif(n) and n >= 2 and _entier_positif(ident)
                and _entier_positif(paires)
                and isinstance(c.get("methode"), str) and c["methode"].strip()):
            return f"log_run REFUS : correlation_voix invalide : {c!r}.\n{attendu}"
        if ident > paires:
            return (f"log_run REFUS : correlation_voix : reponses_fausses_identiques "
                    f"({ident}) > paires_fausses ({paires}).")
    return None


def _usage_path() -> str:
    return os.environ.get("AGENT_ORCHESTRATION_USAGE") or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "supervision", "usage.jsonl")


def _aware(t):
    """Horodatage avec fuseau : un ts naif est lu en heure locale (jamais de TypeError a la comparaison)."""
    return t.astimezone() if t.tzinfo is None else t


EVENT_FIN_SOUS_AGENT = "subagent-stop"
FENETRE_USAGE_COURTE = 20
FENETRE_USAGE_LARGE = 400   # `debut_infere` (main) ET elargissement de la jointure (19.1)


def _lignes_json_tolerantes(brut) -> list:
    """Dicts JSON des lignes ; une ligne coupee (premiere ligne apres le seek) ou abimee est
    ignoree, sur la fenetre courte comme sur la fenetre elargie."""
    out = []
    for x in brut:
        if not x.strip():
            continue
        try:
            d = json.loads(x)
        except ValueError:
            continue
        if isinstance(d, dict):
            out.append(d)
    return out


def _lire_queue_usage() -> list:
    """Lignes brutes des 200 derniers Ko de usage.jsonl (jamais le fichier entier)."""
    with open(_usage_path(), "rb") as fh:
        fh.seek(0, os.SEEK_END)
        fh.seek(max(0, fh.tell() - 200_000))
        return fh.read().decode("utf-8", "replace").splitlines()


def _jointure_lignes(run: dict, maintenant=None, nb_lignes: int = 20):
    """(lignes de FIN de sous-agent de la session dans [debut, maintenant], t0, t1) ou None.

    None = aucune jointure etablie : run sans `session_id`/`debut`, fichier illisible,
    fenetre des `nb_lignes` dernieres lignes qui ne remonte pas jusqu'au debut du run,
    ou aucune ligne de fin de sous-agent de la session dans l'intervalle."""
    sid, debut = run.get("session_id"), run.get("debut")
    if not (isinstance(sid, str) and isinstance(debut, str)):
        return None
    try:
        t0 = _aware(datetime.datetime.fromisoformat(debut))
        t1 = _aware(maintenant or datetime.datetime.now().astimezone())
        tout = _lire_queue_usage()
        lignes = _lignes_json_tolerantes(tout[-nb_lignes:])
        ts = [_aware(datetime.datetime.fromisoformat(x["ts"])) for x in lignes]
        if lignes and min(ts) > t0 and nb_lignes < FENETRE_USAGE_LARGE and len(tout) > nb_lignes:
            # Story 19.1 : la fenetre courte ne remonte pas au debut -> on elargit une fois
            # (meme tampon de 200 Ko, jamais le fichier entier).
            lignes = _lignes_json_tolerantes(tout[-FENETRE_USAGE_LARGE:])
            ts = [_aware(datetime.datetime.fromisoformat(x["ts"])) for x in lignes]
        if not lignes or min(ts) > t0:
            return None   # la fenetre de 20 lignes ne remonte pas jusqu'au debut du run
        dedans = [x for x, t in zip(lignes, ts, strict=True)
                  if x.get("session_id") == sid and t0 <= t <= t1]
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None   # une ligne abimee ou un ts sans fuseau ne coute jamais l'ecriture du run
    # Story 8.25 : seules les lignes de FIN de sous-agent portent un cout ; les lignes
    # d'evenement d'outil (`tool`: Agent, Skill...) n'en ont jamais. Discriminant MESURE sur la
    # queue d'usage.jsonl (400 dernieres lignes) : fin = `event: "subagent-stop"` ; outil = `tool`
    # SANS `event`. Le filtre est explicite sur ce champ : un type d'evenement futur inconnu
    # n'est pas une fin et ne force donc jamais `partiel`.
    fins = [x for x in dedans if x.get("event") == EVENT_FIN_SOUS_AGENT]
    return (fins, t0, t1) if fins else None


_A_CALCULER = object()   # sentinelle : `jointure` non fournie (None est une valeur : pas de jointure)


def jointure_cout(run: dict, maintenant=None, nb_lignes: int = 20, jointure=_A_CALCULER) -> dict:
    """Renseigne `tokens` et `duree_s` SEULEMENT si la jointure est fiable, sinon {}.

    Fiable = le run porte `session_id` ET `debut` (ISO) ; les `nb_lignes` dernieres
    lignes de usage.jsonl (jamais le fichier entier) remontent jusqu'au debut du run ;
    au moins une ligne de la meme session tombe dans [debut, maintenant] ; TOUTES les lignes de fin de sous-agent ont
    `jetons` (somme = `tokens` ; les lignes d'evenement d'outil ne comptent pas) (un agent `async_launched` n'a pas de cout : somme partielle = valeur
    fausse, donc rien). `duree_s` = maintenant - debut (duree murale). Jamais
    d'ecrasement d'une valeur fournie."""
    jl = _jointure_lignes(run, maintenant, nb_lignes) if jointure is _A_CALCULER else jointure
    if jl is None:
        return {}
    dedans, t0, t1 = jl
    if any(not _entier_positif(x.get("jetons")) for x in dedans):
        return {}
    out = {}
    if "tokens" not in run:
        out["tokens"] = sum(x["jetons"] for x in dedans)
    if "duree_s" not in run:
        out["duree_s"] = max(0, int((t1 - t0).total_seconds()))
    return out


def _cause_jointure_absente(run: dict) -> str:
    """Cause d'une jointure absente alors que session_id et debut sont poses (19.1)."""
    try:
        t0 = _aware(datetime.datetime.fromisoformat(run["debut"]))
        lignes = _lignes_json_tolerantes(_lire_queue_usage()[-FENETRE_USAGE_LARGE:])
        ts = [_aware(datetime.datetime.fromisoformat(x["ts"])) for x in lignes]
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return "usage.jsonl illisible ou ligne sans ts exploitable"
    if not lignes:
        return "usage.jsonl vide"
    if min(ts) > t0:
        return (f"fenetre usage.jsonl epuisee (le debut du run precede les "
                f"{FENETRE_USAGE_LARGE} dernieres lignes ou 200 Ko lus)")
    if not any(x.get("session_id") == run.get("session_id")
               and x.get("event") == EVENT_FIN_SOUS_AGENT for x in lignes):
        return "aucune fin de sous-agent de la session depuis le debut"
    return "cause indeterminee"


def completer_cout_inconnu(run: dict, jointure) -> None:
    """Story 19.1 (D11, 1B) : apres la jointure, un `tokens`/`duree_s` encore ABSENT s'ecrit
    null, `cout_couverture` vaut `inconnu` s'il n'est pas deja pose, et un avertissement nomme
    la cause probable sur stderr. Jamais de refus, jamais d'ecrasement d'une valeur fournie."""
    manquants = [k for k in ("tokens", "duree_s") if run.get(k) is None]   # null explicite = absent
    if not manquants:
        return
    for k in manquants:
        run[k] = None
    # une des deux mesures connue -> partiel ; aucune -> inconnu (jamais d'ecrasement)
    run.setdefault("cout_couverture", "partiel" if len(manquants) == 1 else "inconnu")
    if not run.get("session_id"):
        cause = "pas de session_id (ni infere depuis prompts.jsonl)"
    elif not run.get("debut"):
        cause = "pas de debut"
    elif jointure is None:
        cause = _cause_jointure_absente(run)
    elif any(not _entier_positif(x.get("jetons")) for x in jointure[0]):
        cause = "sous-agent asynchrone sans jetons (fin de sous-agent sans cout)"
    else:
        cause = "cause indeterminee"
    print(f"log_run AVERTISSEMENT : {', '.join(manquants)} introuvable(s), ecrit(s) null "
          f"(cout_couverture={run['cout_couverture']!r}). Cause probable : {cause}.",
          file=sys.stderr)


def couverture_jointure(run: dict, maintenant=None, nb_lignes: int = 20, jointure=_A_CALCULER):
    """Story 8.25 : `complet` si toutes les lignes de FIN de sous-agent de la jointure portent
    `jetons`, `partiel` si l'une manque, None si aucune jointure n'est etablie (champ absent).
    Les lignes d'evenement d'outil ne comptent pas. Cette valeur decrit la JOINTURE d'usage, pas
    un `tokens` fourni par l'appelant (qui peut venir d'ailleurs). `jointure` : le resultat d'un
    seul `_jointure_lignes`, partage avec `jointure_cout` pour que `tokens` et la couverture
    decrivent le meme lot de lignes."""
    jl = _jointure_lignes(run, maintenant, nb_lignes) if jointure is _A_CALCULER else jointure
    if jl is None:
        return None
    return "complet" if all(_entier_positif(x.get("jetons")) for x in jl[0]) else "partiel"


def _prompts_path() -> str:
    return os.environ.get("AGENT_ORCHESTRATION_PROMPTS") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "prompts.jsonl")


def _queue_jsonl(chemin: str, octets: int) -> list:
    """Lignes JSON valides des `octets` derniers octets (jamais le fichier entier)."""
    with open(chemin, "rb") as fh:
        fh.seek(0, os.SEEK_END)
        fh.seek(max(0, fh.tell() - octets))
        brut = fh.read().decode("utf-8", "replace").splitlines()
    out = []
    for x in brut:
        try:
            d = json.loads(x)
        except ValueError:
            continue   # premiere ligne coupee par le seek, ligne abimee
        if isinstance(d, dict):
            out.append(d)
    return out


def inferer_debut(run: dict, maintenant=None, fenetre_h: int = 24) -> dict:
    """Pose `session_id` et `debut` quand le run n'en porte pas, sinon {}.

    Source : `prompts.jsonl` (une ligne par prompt, session comprise). Le debut est le
    premier prompt posterieur au run precedent du journal : le cout couvre donc tout le
    travail depuis le dernier run journalise, pas une seule demande (surestimation
    assumee, marquee `debut_infere`). Ambigu = rien : plusieurs sessions dans la fenetre
    de `fenetre_h` heures, ou aucun prompt avec session -> {} (un cout absent vaut mieux
    qu'un cout d'une autre session). Jamais d'ecrasement d'une valeur fournie."""
    if run.get("session_id") or run.get("debut"):
        return {}
    try:
        t1 = maintenant or datetime.datetime.now().astimezone()
        seuil = t1 - datetime.timedelta(hours=fenetre_h)
        lignes = []
        for x in _queue_jsonl(_prompts_path(), 200_000):
            sid = x.get("session_id")
            t = datetime.datetime.fromisoformat(x["ts"])
            if not (isinstance(sid, str) and sid):
                continue
            if t.tzinfo is None:
                t = t.astimezone()
            if seuil <= t <= t1:
                lignes.append((t, sid))
        if len({s for _, s in lignes}) != 1:
            return {}
        precedent = None
        try:
            derniers = _queue_jsonl(RUNS_PATH, 30_000)
            if derniers and isinstance(derniers[-1].get("ts"), str):
                precedent = datetime.datetime.fromisoformat(derniers[-1]["ts"])
                if precedent.tzinfo is None:
                    precedent = precedent.astimezone()
        except (OSError, ValueError):
            precedent = None
        apres = [t for t, _ in lignes if precedent is None or t > precedent]
        if not apres:
            return {}
        return {"session_id": lignes[0][1], "debut": min(apres).isoformat(timespec="seconds"),
                "debut_infere": True}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def run_id_existe(run_id: str, chemin=None) -> bool:
    try:
        with open(chemin or RUNS_PATH, encoding="utf-8") as fh:
            return any(f'"{run_id}"' in l and json.loads(l).get("run_id") == run_id
                       for l in fh if l.strip())
    except FileNotFoundError:
        return False   # pas de journal : aucun doublon possible
    except (OSError, ValueError):
        return True    # fail-closed : journal illisible, on ne sait pas -> refus


# Concurrence de `--verdict` : verrou en creation exclusive + relecture de la taille avant
# remplacement (un append fait entre lecture et remplacement serait perdu) + temporaire
# unique par processus. Residu documente : un append qui tombe entre la relecture de la
# taille et `os.replace` (fenetre de quelques microsecondes) n'est pas detecte.
DELAI_VERROU_S = 10.0
_AVANT_REMPLACEMENT = None   # crochet de test : appele juste avant la relecture de taille


class _Verrou:
    def __init__(self, chemin):
        self.chemin = chemin + ".lock"
        self.fd = None

    def __enter__(self):
        import time
        fin = time.monotonic() + DELAI_VERROU_S
        while True:
            try:
                self.fd = os.open(self.chemin, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                return self
            except FileExistsError:
                if time.monotonic() > fin:
                    raise TimeoutError(
                        f"verrou {self.chemin} tenu depuis plus de {DELAI_VERROU_S:.0f} s "
                        "(autre session ? supprimer le .lock si elle est morte)") from None
                time.sleep(0.05)

    def __exit__(self, *exc):
        if self.fd is not None:
            os.close(self.fd)
            try:
                os.remove(self.chemin)
            except OSError:
                pass
        return False


def verdict(argv) -> int:
    """Voir `_verdict_sous_verrou` ; ici : verrou fichier, refus lisible apres delai."""
    try:
        with _Verrou(RUNS_PATH):
            return _verdict_sous_verrou(argv)
    except TimeoutError as exc:
        print(f"log_run --verdict REFUS : {exc}")
        return 1


def _verdict_sous_verrou(argv) -> int:
    """--verdict <run_id|prefixe-ts> <valeur> "<preuve>" - pose `verdict_aval` apres coup.
    Meme modele que `--solde` : jamais d'edition manuelle, reecriture atomique, exactement
    1 run vise. `confirme` et `infirme` exigent une preuve (commande ou commit)."""
    if len(argv) < 2:
        print("log_run --verdict : usage : --verdict <run_id|prefixe-ts> "
              f"<{'|'.join(VERDICTS_AVAL)}> <preuve>")
        return 1
    cle, valeur = argv[0], argv[1]
    preuve = argv[2] if len(argv) > 2 else ""
    if len(argv) > 3:
        print("log_run --verdict REFUS : la preuve doit tenir en UN argument, entre guillemets "
              f"({len(argv) - 2} mots recus, le reste serait perdu).")
        return 1
    refus = verifier_instrumentation({"verdict_aval": {"valeur": valeur, "preuve": preuve}})
    if refus:
        print(refus)
        return 1
    try:
        with open(RUNS_PATH, encoding="utf-8") as fh:
            lignes = [l.rstrip("\r\n") for l in fh if l.strip()]
        taille_lue = os.path.getsize(RUNS_PATH)
    except OSError as exc:
        print(f"log_run --verdict : lecture impossible ({exc})")
        return 1
    # Une ligne abimee ou qui n'est pas un objet reste dans le fichier TELLE QUELLE : elle ne
    # doit ni bloquer le verdict d'un autre run, ni etre perdue a la reecriture.
    runs = []
    for l in lignes:
        try:
            r = json.loads(l)
        except ValueError:
            r = None
        runs.append(r if isinstance(r, dict) else l)
    cibles = [r for r in runs if isinstance(r, dict) and r.get("run_id") == cle]
    if not cibles:
        cibles = [r for r in runs if isinstance(r, dict) and r.get("ts")
                  and str(r["ts"]).startswith(cle)]
    if len(cibles) != 1:
        print(f"log_run --verdict : {len(cibles)} run(s) pour '{cle}' - il en faut exactement 1")
        return 1
    run = cibles[0]
    avant = run.get("verdict_aval")
    run["verdict_aval"] = {"valeur": valeur, "preuve": preuve.strip(),
                           "quand": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
    if isinstance(avant, dict):
        run["verdicts_aval"] = (run.get("verdicts_aval") or []) + [avant]
    tmp = f"{RUNS_PATH}.{os.getpid()}.{os.urandom(4).hex()}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            for r in runs:
                fh.write((r if isinstance(r, str) else json.dumps(r, ensure_ascii=False)) + "\n")
        if _AVANT_REMPLACEMENT is not None:
            _AVANT_REMPLACEMENT()
        if os.path.getsize(RUNS_PATH) != taille_lue:
            print("log_run --verdict REFUS : le journal a change pendant la reecriture "
                  "(append concurrent) - rien n'est ecrit, relancer la commande.")
            return 1
        os.replace(tmp, RUNS_PATH)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    print(f"log_run --verdict : run {run.get('run_id') or run.get('ts')} -> {valeur}")
    return 0


def verifier_forme_tache(run: dict) -> str | None:
    """Refus si la forme de tache declaree contredit le vocabulaire ou s'affirme
    `decomposable` sans motif ecrit -- sinon None.

    Trois cas, et le premier est le plus important :
      - champ ABSENT -> None, sans un mot. Non retroactif par construction : un
        avertissement sur les runs anterieurs transformerait une donnee neuve en
        bruit de fond, et la premiere reaction serait de le faire taire.
      - valeur hors vocabulaire -> REFUS si `succes` (un `forme_tache: "mixte"`
        ecrit de bonne foi ne doit pas passer pour une declaration valide), simple
        AVERTISSEMENT sinon : R5 exige que le run rate soit journalise, et le
        refuser sur une faute de frappe en perdrait la trace (meme arbitrage que
        `verifier_etapes_du_plan`, revue bmad-code-review du 2026-09-09).
      - `decomposable` sans motif -> REFUS a tout resultat, celui-la. Ce n'est pas
        une faute de frappe rattrapable : c'est l'affirmation qui justifie de payer
        un fan-out, et une affirmation non motivee est precisement ce que la veille
        reproche au plafond « <= 4 ». L'auteur a toujours l'issue d'omettre le champ
        ou de declarer `inconnu` -- aucune trace n'est perdue.
    """
    if CHAMP_FORME not in run:
        return None
    forme = run.get(CHAMP_FORME)
    if forme not in FORMES_TACHE:
        message = (
            f"{CHAMP_FORME} hors vocabulaire : {forme!r}.\n"
            f"  Attendu : {' | '.join(FORMES_TACHE)} - ou champ absent (un run "
            "anterieur au 2026-09-20 n'en porte aucun, et c'est valide)."
        )
        if run.get("resultat") == "succes":
            return "log_run REFUS : " + message
        print("log_run AVERTISSEMENT : " + message)
        return None
    if forme == FORME_A_JUSTIFIER and not str(
            run.get(CHAMP_FORME_MOTIF) or "").strip():
        return (
            f"log_run REFUS : {CHAMP_FORME} '{FORME_A_JUSTIFIER}' declare sans "
            f"'{CHAMP_FORME_MOTIF}'.\n"
            "  C'est cette declaration qui justifie de payer un fan-out : dire EN "
            "QUOI la tache se decoupe (sous-questions independantes, pas un meme "
            "brief lu en parallele par N salles - ce dernier cas est de la "
            "redondance, pas du decoupage).\n"
            f"  Sinon : '{CHAMP_FORME}': 'inconnu', ou omettre le champ."
        )
    return None


def verifier_etapes_du_plan(run: dict) -> str | None:
    """Refus si le plan contredit le `resultat` — sinon None.

    Veille « OrchestraBench » (arXiv:2608.05263), adoptée le 2026-09-08 : les
    orchestrateurs évalués diluent l'échec d'un sous-agent dans une synthèse lissée,
    et le plan final ne dit plus qu'une branche n'a rien rendu. Le seul point
    DÉTERMINISTE du dispositif étant le journal, c'est ici que le contrôle tient :
    un `succes` dont une étape porte `echec` ou `non-rendu` ne s'écrit pas.

    Le message NOMME l'étape (rang, libellé, agent). « une étape a échoué » ferait
    exactement ce que la trouvaille reproche : dire l'échec sans dire lequel.
    `verification_aval` (veille n7) : champ OPTIONNEL par etape, `ok` | `ko` |
    `non-verifiee`, toute autre valeur est REFUSEE (quel que soit `resultat`).
    Il sert a ATTRIBUER un echec a une etape ; une etape `ko` n'interdit PAS
    `resultat: succes` par elle-meme (choix delibere : pas de nouvelle regle de
    refus, seule l'attribution est visee). Absent = run valide (retrocompatible).

    Le champ reste OPTIONNEL — les runs déjà journalisés n'en portent aucun, et une
    étape mal formée (non-dict) est ignorée plutôt que transformée en TypeError."""
    for rang, etape in enumerate(run.get("plan") or [], start=1):
        if isinstance(etape, dict) and "verification_aval" in etape:
            va = etape["verification_aval"]
            if not (isinstance(va, str) and va in VERIFICATIONS_AVAL):
                return (f"log_run REFUS : etape {rang} ('{etape.get('etape', '')}') : "
                        f"verification_aval invalide : {va!r}.\n"
                        f"  Attendu : {' | '.join(VERIFICATIONS_AVAL)} - ou champ absent.")
    fautives, inconnues = [], []
    for rang, etape in enumerate(run.get("plan") or [], start=1):
        if not isinstance(etape, dict) or "etat" not in etape:
            continue
        etat = etape.get("etat")
        libelle = f"etape {rang} ('{etape.get('etape', '')}', agent '{etape.get('agent', '')}')"
        if etat not in ETATS_ETAPE:
            inconnues.append(f"{libelle} : etat {etat!r}")
        elif etat in ETATS_ETAPE_FAUTIFS:
            fautives.append(f"{libelle} : etat '{etat}'")
    if inconnues:
        message = (
            "etat d'etape hors vocabulaire -\n  "
            + "\n  ".join(inconnues)
            + f"\n  Attendu : {' | '.join(ETATS_ETAPE)} (champ optionnel : une etape "
              "sans 'etat' reste acceptee)."
        )
        # R5 (« verite du journal ») prime sur la police du vocabulaire : un `etat`
        # mal orthographie faisait REFUSER l'ecriture d'un run `echec`/`partiel`,
        # c'est-a-dire perdre la trace du run rate — precisement ce que R5 rend
        # obligatoire de journaliser. Seul un `succes` reste bloque : c'est lui que
        # `"etat": "KO"` rendrait faussement inoffensif (revue bmad-code-review,
        # 2026-09-09).
        if run.get("resultat") == "succes":
            return "log_run REFUS : " + message
        print("log_run AVERTISSEMENT : " + message)
    if run.get("resultat") == "succes" and fautives:
        return (
            "log_run REFUS : resultat 'succes' alors que le plan porte une etape en "
            "echec -\n  "
            + "\n  ".join(fautives)
            + "\n  Un fan-out dont une branche a echoue n'est pas un succes entier. "
              "Journaliser 'partiel' (ce qui a ete rendu) ou 'echec', et dire dans "
              "notes ce que l'etape n'a pas rendu - pas de synthese lissee."
        )
    return None


# --- Piece 1 : le declencheur DECLARE ; piece 2 : la quittance NOMMEE --------
# Salle `inspection-critique` du 2026-09-19, sur pieces : l'appel au role
# utilisateur/QA n'etait obligatoire NULLE PART en fin d'increment (ni dans la
# skill `agent-orchestrator`, ou la validation utilisateur est conditionnelle au
# type de livrable, ni dans `revue-increment`, ou le role utilisateur n'est pas
# une etape, ni dans aucun des 4 playbooks). Mesure : 1 run
# `en-attente-validation` sur 194, contre 165 `succes`. R5 dit quoi ECRIRE,
# jamais ce qu'il faut FAIRE pour que le statut change.
#
# Pourquoi un champ DECLARE et non une detection : typer automatiquement « ce run
# porte-t-il un livrable consomme par un humain ? » est impossible a 0 token
# depuis l'etage deterministe (l'heuristique textuelle `LIVRABLE_UTILISATEUR`
# plus bas, un simple avertissement, le montre : elle ne voit que des mots). Le
# champ deplace le point dur de la DETECTION vers la DECLARATION au moment du
# plan, qui est verifiable a cout nul : absence = refus.
#
# CE QUE CETTE GARDE NE FERME PAS (concede par la salle ; le taire serait
# malhonnete) :
#   - rien ne prouve que l'artefact cite a ete REELLEMENT ouvert : une
#     declaration suffit a passer. Il faudrait un hash du fichier ou un log
#     d'acces pour que `artefact_ouvert` soit une preuve et non une affirmation ;
#   - les executions DIRECTES, hors `log_run.py`, echappent structurellement a
#     toute garde qui vit dedans. Elle protege le journal, pas le travail.
CHAMP_LIVRABLE = "livrable_utilisateur"
CHAMP_LIVRABLE_MOTIF = "livrable_utilisateur_motif"
CHAMPS_QUITTANCE = ("par", "artefact_ouvert", "quand")
# `utilisateur-produit` est un utilisateur SIMULE. Il repond a « qui a ete simule
# en train d'ouvrir la page », pas a « qui a ouvert la page ». Sans le refus (d)
# ci-dessous, la garde SE SIGNERAIT ELLE-MEME : le meme dispositif produirait le
# livrable, simulerait son utilisateur, et signerait la quittance.
AGENT_UTILISATEUR_SIMULE = "utilisateur-produit"
# SIGNAUX_ECHEC_PRODUIT et _texte_quittance ont ete RETIRES le 2026-09-19 : la
# regle « une quittance signee par un agent ne vaut pas quittance » refuse
# desormais l'identite AVANT qu'on ait a lire son rapport, et les elargir aux
# quittances humaines ferait refuser « non operationnel avant correction » ecrit
# honnetement (le refus pousserait a mentir, ce que R5 interdit plus surement
# qu'un faux succes). Ils sont partis plutot que laisses en place : un commentaire
# ecrit ici affirmait qu'ils restaient utilises ailleurs, ce que `vulture
# --min-confidence 60` a dementi le jour meme (instruction de la trouvaille
# « vulture »). Une constante morte gardee « au cas ou » est un filet non appele.

# Identites NON HUMAINES pour la quittance. Liste de MOTIFS, pas de noms : un
# sous-agent neuf ne doit pas passer parce qu'il n'etait pas prevu.
PREFIXES_NON_HUMAINS = ("agent-", "agent ", "sous-agent", "subagent", "bot-",
                        "claude-", "gpt-")
EXACTS_NON_HUMAINS = ("agent", "sous-agent", "subagent", "claude", "claude code",
                      "llm", "ia", "ai", AGENT_UTILISATEUR_SIMULE)


def est_identite_non_humaine(par: str) -> bool:
    """`par` designe-t-il un agent plutot qu'une personne ?

    Regle NEGATIVE inscrite au referentiel le 2026-09-19 : une quittance
    produite par un agent simulant l'utilisateur ne vaut pas quittance. On
    reconnait un agent par son ECRITURE (prefixe `agent-`, mention
    `sous-agent`, nom de modele) - on ne peut pas prouver qu'un nom est humain,
    on peut refuser ceux qui s'annoncent comme ne l'etant pas. Un faux negatif
    (« Jean Agent ») reste possible : la garde exige que la quittance soit
    SIGNEE de facon relisible a la main, elle ne fait pas l'etat civil.
    """
    p = " ".join(str(par or "").strip().lower().replace("_", "-").split())
    if not p:
        return False
    if p in EXACTS_NON_HUMAINS:
        return True
    return p.startswith(PREFIXES_NON_HUMAINS)


def verifier_validation_utilisateur(run: dict, au_solde: bool = False) -> str | None:
    """Les 4 refus mecaniques sur `resultat: succes` - sinon None.

    (a) `livrable_utilisateur` absent du run ;
    (b) `livrable_utilisateur: true` et bloc `validation` absent ;
    (c) `artefact_ouvert` vide ou absent, MEME si `par` est rempli ;
    (d) `par: utilisateur-produit` avec un signal d'echec produit dans son
        rapport (ou dans les notes du run) : `succes` interdit, au mieux
        `en-attente-validation`.

    NON RETROACTIF : au `--solde`, un run qui ne PORTE PAS le champ a ete ecrit
    avant le deploiement - il sort sans aucun controle. Les 194 runs deja
    journalises restent lisibles et soldables. A l'APPEND, le champ est exige :
    tout run ecrit desormais nait avec.

    Meme style que `verifier_etapes_du_plan` : rien n'est ecrit sur refus, et le
    message NOMME le champ fautif plutot que de dire "quittance incomplete"."""
    if run.get("resultat") != "succes":
        return None
    if au_solde and CHAMP_LIVRABLE not in run:
        return None
    if CHAMP_LIVRABLE not in run:                                       # (a)
        return (
            f"log_run REFUS : champ '{CHAMP_LIVRABLE}' (booleen) absent - tout run "
            "orchestre doit DECLARER s'il porte un livrable consomme par un "
            "humain, avec une justification courte.\n"
            f"  Rejouer avec '{CHAMP_LIVRABLE}': true + un bloc 'validation' "
            f"{{{', '.join(CHAMPS_QUITTANCE)}}}, ou '{CHAMP_LIVRABLE}': false + "
            f"'{CHAMP_LIVRABLE_MOTIF}': '<pourquoi aucun humain ne consomme "
            "d'artefact ici>'."
        )
    declare = run.get(CHAMP_LIVRABLE)
    if not isinstance(declare, bool):
        return (f"log_run REFUS : '{CHAMP_LIVRABLE}' doit etre un booleen "
                f"(recu : {declare!r}).")
    if declare is False:
        # Un `false` nu serait la case a cocher qui desarme la garde sans rien
        # dire ; le motif rend la declaration relisible par le superviseur.
        if not str(run.get(CHAMP_LIVRABLE_MOTIF) or "").strip():
            return (
                f"log_run REFUS : '{CHAMP_LIVRABLE}': false sans "
                f"'{CHAMP_LIVRABLE_MOTIF}' - une declaration d'absence de livrable "
                "se justifie, sinon 'false' devient la case a cocher qui desarme "
                "la garde. Ex. : 'run interne, aucun artefact ouvert par un humain'."
            )
        return None
    validation = run.get("validation")
    if not isinstance(validation, dict) or not validation:              # (b)
        return (
            f"log_run REFUS : '{CHAMP_LIVRABLE}': true sans bloc 'validation' - un "
            "livrable consomme par un humain ne se journalise 'succes' qu'avec une "
            "quittance NOMMEE.\n"
            f"  Attendu : 'validation': {{'par': '<sous-agent du plan ou nom "
            "d'humain>', 'artefact_ouvert': '<chemin, URL ou capture>', 'quand': "
            "'<horodatage>'}}. Sans quittance : 'en-attente-validation'."
        )
    par = str(validation.get("par") or "").strip()
    if not par:
        return ("log_run REFUS : 'validation.par' vide - la quittance doit NOMMER "
                "une PERSONNE. Un nom de sous-agent n'y suffit pas (cf. "
                "est_identite_non_humaine) : sans personne pour signer, le run "
                "reste 'en-attente-validation'.")
    if est_identite_non_humaine(par):
        return (
            f"log_run REFUS : 'validation.par' nomme '{par}', une identite "
            "d'AGENT - une quittance produite par un agent simulant "
            "l'utilisateur NE VAUT PAS quittance. Le nom en sortie doit etre "
            "celui d'une PERSONNE.\n"
            "  Mesure : le taux de succes d'un agent varie jusqu'a 9 points de "
            "pourcentage selon le LLM qui joue l'utilisateur, avec une "
            "miscalibration systematique (Lost in Simulation, veille adoptee le "
            "2026-09-19). Mettre le nom d'agent AU PLAN ne repare rien : il "
            "repond a 'qui a ete simule en train d'ouvrir l'artefact', pas a "
            "'qui l a ouvert'.\n"
            "  Sans personne pour signer : 'en-attente-validation'."
        )
    if not str(validation.get("artefact_ouvert") or "").strip():        # (c)
        return (
            "log_run REFUS : 'validation.artefact_ouvert' vide ou absent - MEME "
            f"avec 'par': '{par}' rempli. Un 'succes' sur livrable utilisateur "
            "exige de dire QUEL artefact a ete ouvert : chemin de fichier, URL "
            "servie, ou capture.\n"
            "  (Cette garde ne prouve PAS l'ouverture reelle : elle exige qu'elle "
            "soit nommee, donc verifiable a la main.)"
        )
    if not str(validation.get("quand") or "").strip():
        return ("log_run REFUS : 'validation.quand' vide ou absent - une quittance "
                "sans horodatage ne se rattache a aucune version de l'artefact.")
    # (d) ABSORBE le 2026-09-19. Ce refus visait `par: utilisateur-produit` dont
    # le rapport portait un signal d'echec produit ; depuis que TOUTE identite
    # d'agent est refusee plus haut (regle Lost in Simulation), il ne peut plus
    # etre atteint - un `par` valide est desormais un nom de personne, et les
    # signaux d'echec ne doivent PAS s'y appliquer : un humain qui ecrit
    # "non operationnel avant correction" dans une quittance honnete ne doit pas
    # se faire refuser. Sa constante et son aide de lecture ont ete retirees avec
    # lui (cf. le commentaire en tete de fichier) plutot que laissees mortes.
    return None




# --- Lot nominatif de constats (remede 2, superviseur 2026-09-20) ------------
# Mesure : 172 constats crees contre 156 fermes entre le 2026-07-30 et le
# 2026-09-20 (469 snapshots), avec des pics de creation NETTE les jours memes ou
# l'utilisateur demandait qu'on traite les ecarts (01/09 +14 : la demande
# « traite les 34 constats » a fait passer le compteur de 5 a 19 dans la
# journee). Un `succes` adosse a un compteur vivant ne dit donc RIEN de la
# demande. Un run peut desormais porter `"lot": "<id>"` : la liste NOMINATIVE
# des constats vises, gelee a l'ouverture par
# `.claude/supervision/lot.py --ouvrir`. Le run ne se solde `succes` que si
# 100 % du lot est ferme, et le refus NOMME les manquants.
#
# NON RETROACTIF, comme `livrable_utilisateur` : un run sans champ `lot` (les
# 195 anterieurs, et tous les depots de la flotte ou le lot n'existe pas) n'est
# pas controle. Le canon est propage a 6 depots : aucun signal nouveau ne doit
# s'y allumer par heritage.
#
# DEUX SENS pour le meme champ : `"lot": "<id>"` (chaine) nomme un lot du
# registre ci-dessus ; `"lot": true` (booleen, ecrit par `--lot`, story 9.3)
# MARQUE un lot orchestre et ne nomme aucun lot du registre — `verifier_lot` ne
# le resout donc jamais (mesure 2026-11-02 : lu comme identifiant, il devenait
# 'True', et tout solde `succes` d'un lot GMAH etait refuse « INTROUVABLE »).
# Seul `--lot` l'ecrit (un booleen dans le JSON d'un append brut est refuse) et il
# ne dispense d'aucune preuve de verification (revue a 3 voix, 2026-11-02).
CHAMP_LOT = "lot"


def _module_lot():
    """Charge `.claude/supervision/lot.py` du depot courant, ou None."""
    import importlib.util
    # Remontee des ancetres, jamais un nombre fixe de dirname() : ce fichier vit
    # en canon (.claude/dispositif/canon/) ET en copie generee
    # (.claude/orchestration/) — deux profondeurs differentes.
    chemin, d = None, os.path.dirname(os.path.abspath(__file__))
    while True:
        cand = os.path.join(d, ".claude", "supervision", "lot.py")
        if os.path.exists(cand):
            chemin = cand
            break
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent
    spec = importlib.util.spec_from_file_location("_lot_log_run", chemin)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:                                   # noqa: BLE001
        return None
    return mod


def verifier_lot(run: dict) -> str | None:
    """Refus si `resultat: succes` alors que le lot nomme n'est pas a 100 %.

    Trois refus : (a) lot nomme mais instrument absent ; (b) lot INTROUVABLE —
    refus DUR, solder contre un lot inexistant serait inoperant en silence ;
    (c) lot incomplet — le message NOMME chaque constat qui manque, « lot
    incomplet » ferait exactement ce que ce remede reproche au compteur.

    Le booleen `"lot": true` (marqueur `--lot`, story 9.3) n'est PAS un
    identifiant : il sort sans controle de registre. Seul le booleen est exempte —
    toute autre valeur reste lue comme identifiant, exactement comme avant. Ce
    marqueur ne s'ecrit que par `--lot` (un booleen dans le JSON d'un append brut
    est refuse par `main()`) et ne dispense d'aucune preuve de verification
    (`verifier_preuve_de_verification`)."""
    if run.get("resultat") != "succes":
        return None
    if isinstance(run.get(CHAMP_LOT), bool):
        return None
    lot_id = str(run.get(CHAMP_LOT) or "").strip()
    if not lot_id:
        return None
    mod = _module_lot()
    if mod is None:                                                     # (a)
        return (f"log_run REFUS : le run nomme le lot '{lot_id}' mais "
                ".claude/supervision/lot.py est introuvable dans ce depot - "
                "impossible de verifier que le lot est ferme. Retirer le champ "
                f"'{CHAMP_LOT}' ou installer l'instrument.")
    try:
        fermes, total, restants = mod.etat_lot(lot_id)
    except mod.LotIntrouvable:                                          # (b)
        return (f"log_run REFUS : lot '{lot_id}' INTROUVABLE. Solder un run "
                "'succes' contre un lot qui n'existe pas serait inoperant en "
                "silence : la promesse faite a l'utilisateur ne serait rattachee "
                "a rien. Ouvrir le lot avec "
                "`py .claude/supervision/lot.py --ouvrir <id> --projet <projet>`, "
                "ou corriger l'identifiant.")
    if restants:                                                        # (c)
        return ("log_run REFUS : lot '" + lot_id + f"' a {fermes}/{total} fermes - "
                "un 'succes' declarerait satisfaite une demande qui ne l'est pas.\n  "
                + "\n  ".join(restants)
                + "\n  Journaliser 'partiel' (ce qui a ete ferme), ou fermer les "
                  "constats ci-dessus. Un constat CREE depuis l'ouverture du lot "
                  "n'y entre jamais : il ne peut ni le gonfler ni le sauver.")
    return None


def compter_succes_sans_oracle(runs=None):
    """(sans_oracle, total_succes) — la DETTE laissee par la non-retroactivite.

    `verifier_validation_utilisateur(au_solde=True)` laisse sortir sans aucun
    controle tout run qui ne porte pas `livrable_utilisateur`. C'est DELIBERE
    (les runs anterieurs au deploiement restent soldables), mais la mesure du
    superviseur — 165 des 166 runs `succes` sans le champ — etait muette :
    personne ne pouvait la relire. Cette fonction la rend executable.
    `py log_run.py --dette-oracle`."""
    if runs is None:
        try:
            with open(RUNS_PATH, encoding="utf-8") as fh:
                runs = [json.loads(l) for l in fh if l.strip()]
        except (OSError, ValueError):
            return 0, 0
    succes = [r for r in runs if isinstance(r, dict) and r.get("resultat") == "succes"]
    sans = [r for r in succes if CHAMP_LIVRABLE not in r]
    return len(sans), len(succes)


# --- Ordre du playbook deck : le RENDU avant toute hypothese ----------------
# Cas reel du 2026-09-22 (run « deck PPT Trucks KO ») : 5 hypotheses fausses et 3
# analyses python-pptx infructueuses (geometrie, largeurs de colonnes, marges,
# polices, structure des paragraphes) avant qu'un rendu reel ne montre le defaut
# en une passe. python-pptx est un parseur TOLERANT : il est aveugle par
# construction a ce que le rendu expose. Le playbook `export-ppt-verifie` impose
# donc une etape 0 « rendu comparatif avant toute hypothese ».
# Ce que la garde REFUSE : un plan de CE playbook ou une etape d'analyse
# python-pptx precede la premiere etape de rendu. Ce qu'elle ne ferme pas : un
# plan dont les libelles ne nomment ni l'un ni l'autre n'est pas vu — garde-fou
# textuel, pas preuve.
PLAYBOOK_DECK = "export-ppt-verifie"
_MARQ_RENDU = ("rendu", "render", "libreoffice", "pptx-verify", "screenshot",
               "pymupdf", "capture", "pdf de reference", "com ")
_MARQ_ANALYSE = ("python-pptx", "python pptx", "xml brut", "analyse du xml",
                 "inspection xml", "parse du pptx", "parsing pptx")


def verifier_ordre_playbook_ppt(run: dict) -> str | None:
    """Refus si une analyse python-pptx precede le rendu — sinon None."""
    if str(run.get("playbook") or "") != PLAYBOOK_DECK:
        return None
    rang_rendu = rang_analyse = None
    libelle_analyse = ""
    for rang, etape in enumerate(run.get("plan") or [], start=1):
        if not isinstance(etape, dict):
            continue
        texte = (str(etape.get("etape", "")) + " " + str(etape.get("agent", ""))).lower()
        if rang_analyse is None and any(m in texte for m in _MARQ_ANALYSE):
            rang_analyse, libelle_analyse = rang, str(etape.get("etape", ""))
        if rang_rendu is None and any(m in texte for m in _MARQ_RENDU):
            rang_rendu = rang
    if rang_analyse is None:
        return None
    if rang_rendu is not None and rang_rendu < rang_analyse:
        return None
    ou = (f"le rendu arrive a l'etape {rang_rendu}"
          if rang_rendu is not None else "aucune etape de rendu n'est au plan")
    return (
        f"log_run REFUS : playbook '{PLAYBOOK_DECK}' — analyse python-pptx a "
        f"l'etape {rang_analyse} (« {libelle_analyse} ») alors que {ou}.\n"
        "  Etape 0 OBLIGATOIRE de ce playbook : rendu comparatif (original vs "
        "regenere) AVANT toute hypothese. Mesure du 2026-09-22 : 5 hypotheses "
        "fausses et 3 analyses python-pptx infructueuses avant que le rendu ne "
        "montre le defaut en une passe — python-pptx est aveugle a ce defaut par "
        "construction.\n"
        "  Rejouer en placant l'etape de rendu comparatif AVANT l'analyse."
    )


# --- Interrogateur du journal (--stats) -------------------------------------
# Pourquoi ce mode existe : `runs.jsonl` fait ~486 Ko et un `Read` entier coute
# ~109 000 jetons, donc la regle d'economie du depot ne laissait que `grep`. C'est
# elle qui a fabrique une mesure FAUSSE le 2026-09-22 :
#   grep -c "en-attente-validation" -> 14 « runs en attente » chez VSCode3,
#   alors que 0 run portait ce RESULTAT — la chaine etait dans `notes`, texte
#   libre. Un compte par SOUS-CHAINE n'est pas un compte par CHAMP.
# Le mode lit le fichier LIGNE A LIGNE (streaming, jamais en memoire entiere) et
# compte la valeur d'un CHAMP JSON. `--depot` filtre sur ce que le run NOMME
# (demande + plan + notes) : filtre textuel assume, borne explicitement dans la
# sortie, jamais une preuve d'appartenance.
CHAMPS_STATS = ("resultat", "qualification", "playbook", CHAMP_FORME,
                "reprises", CHAMP_LIVRABLE)


def _texte_du_run(run: dict) -> str:
    morceaux = [str(run.get("demande") or ""), str(run.get("notes") or "")]
    for e in run.get("plan") or []:
        if isinstance(e, dict):
            morceaux.append(str(e.get("etape", "")) + " " + str(e.get("agent", "")))
    return " ".join(morceaux).lower()


def stats(champ: str = "resultat", depot: str | None = None, chemin: str | None = None):
    """(compteur {valeur: n}, total_lu, total_retenu, lignes_illisibles).

    Streaming : une ligne a la fois, rien n'est accumule hors le compteur.
    """
    compteur, total, retenus, illisibles = {}, 0, 0, 0
    with open(chemin or RUNS_PATH, encoding="utf-8") as fh:
        for ligne in fh:
            ligne = ligne.strip()
            if not ligne:
                continue
            total += 1
            try:
                run = json.loads(ligne)
            except ValueError:
                illisibles += 1
                continue
            if not isinstance(run, dict):
                illisibles += 1
                continue
            if depot and depot.lower() not in _texte_du_run(run):
                continue
            retenus += 1
            valeur = run.get(champ, "(absent)")
            if isinstance(valeur, (dict, list)):
                valeur = "(structure)"
            compteur[str(valeur)] = compteur.get(str(valeur), 0) + 1
    return compteur, total, retenus, illisibles


def ratio_faits_infirmes(chemin: str | None = None, jours: int = 30) -> dict:
    """Story 19.3 : infirmes / succes sur `jours` jours, en LIGNES (streaming).

    `non_renseigne` (cle absente) est compte A PART : jamais assimile a 0, jamais au
    denominateur du ratio de `renseignes`. Numerateur = succes avec faits_infirmes > 0 ;
    denominateur = tous les succes de la fenetre (renseignes ou non).
    """
    limite = datetime.datetime.now().astimezone() - datetime.timedelta(days=jours)
    r = {"succes": 0, "infirmes": 0, "zero": 0, "non_renseigne": 0, "invalides": 0,
         "illisibles": 0}
    with open(chemin or RUNS_PATH, encoding="utf-8") as fh:
        for ligne in fh:
            ligne = ligne.strip()
            if not ligne:
                continue
            try:
                run = json.loads(ligne)
                if not isinstance(run, dict) or run.get("resultat") != "succes":
                    continue
                if _aware(datetime.datetime.fromisoformat(str(run["ts"]))) < limite:
                    continue
            except (ValueError, KeyError, TypeError):
                r["illisibles"] += 1
                continue
            r["succes"] += 1
            if "faits_infirmes" not in run:
                r["non_renseigne"] += 1
                continue
            fi = run["faits_infirmes"]
            if not (_entier_positif(fi) and fi <= FAITS_INFIRMES_MAX):
                # cle presente mais hors contrat (chaine, booleen, flottant, > max) :
                # ni absent, ni infirme - compte a part.
                r["invalides"] += 1
            elif fi > 0:
                r["infirmes"] += 1
            else:
                r["zero"] += 1
    return r


def imprimer_stats(argv) -> int:
    opts, i = {}, 0
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    champ = opts.get("champ", "resultat")
    depot = opts.get("depot")
    jours = 30
    if champ == "faits_infirmes":
        if depot:
            # le ratio lit tout le journal du hub : un filtre --depot y serait
            # ignore en silence - on refuse plutot que d'afficher un faux filtre.
            print("log_run --stats : --depot non supporte avec --champ faits_infirmes "
                  "(le ratio porte sur tout le journal).")
            return 2
        if "--jours" in argv and "jours" not in opts:
            print("log_run --stats : --jours sans valeur (attendu : entier >= 1).")
            return 2
        # Validation AVANT toute impression : une fenetre absurde ne doit jamais
        # laisser des stats partielles a l'ecran.
        brut = opts.get("jours", "30")
        try:
            jours = int(brut)
            if jours < 1:
                raise ValueError
            datetime.datetime.now().astimezone() - datetime.timedelta(days=jours)
        except (ValueError, OverflowError):
            print(f"log_run --stats : --jours invalide : {brut!r} "
                  "(attendu : entier >= 1, fenetre representable en date).")
            return 2
    try:
        compteur, total, retenus, illisibles = stats(champ, depot)
    except OSError as exc:
        print(f"log_run --stats : journal illisible ({exc})")
        return 1
    entete = f"log_run --stats : champ '{champ}'"
    if champ not in CHAMPS_STATS:
        entete += " (hors champs usuels : " + ", ".join(CHAMPS_STATS) + ")"
    if depot:
        entete += (f" · filtre textuel '{depot}' — le run le NOMME dans demande/plan/"
                   "notes ; un run qui ne le nomme pas n'est pas vu")
    print(entete)
    print(f"  {retenus} run(s) retenu(s) sur {total} lu(s)"
          + (f", {illisibles} ligne(s) illisible(s)" if illisibles else ""))
    for valeur, n in sorted(compteur.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:5d}  {valeur}")
    if not compteur:
        print("  (aucun run retenu)")
    if champ == "faits_infirmes":
        try:
            q = ratio_faits_infirmes(None, jours)
        except (OSError, ValueError) as exc:
            print(f"log_run --stats : ratio illisible ({exc})")
            return 1
        print(f"  RATIO faits_infirmes>0 / succes ({jours} j) : "
              f"{q['infirmes']}/{q['succes']}  (succes sans faits_infirmes = "
              "non renseigne, jamais compte comme 0)")
        print(f"  renseigne a 0 : {q['zero']}")
        print(f"  non renseigne : {q['non_renseigne']}")
        print(f"  invalides : {q['invalides']}  (cle presente hors contrat : "
              f"ni entier, ou > {FAITS_INFIRMES_MAX} - jamais compte comme infirme)")
        renseignes = q["infirmes"] + q["zero"]
        print(f"  couverture : {renseignes}/{q['succes']} succes renseigne(s)  "
              "(lire le ratio a l'aune de cette couverture)")
        print(f"  illisibles (ratio) : {q['illisibles']}")
        print(f"  fenetre ratio : {jours} jours (repartition : tout le journal)")
    return 0


def lister_runs(champ: str, valeur: str, chemin: str | None = None):
    """Itere (numero_de_ligne, run) pour les runs dont `champ` vaut `valeur`.

    Streaming, calque sur `stats()` : une ligne a la fois, rien n'est accumule.
    `runs.jsonl` fait 526 Ko au hub et un `Read` entier coute ~109 000 tokens —
    materialiser les 231 runs pour en afficher 39 serait payer ce prix-la.
    Tolerance identique a `stats()` : une ligne illisible est sautee, jamais
    fatale.
    """
    with open(chemin or RUNS_PATH, encoding="utf-8") as fh:
        for numero, ligne in enumerate(fh, start=1):
            ligne = ligne.strip()
            if not ligne:
                continue
            try:
                run = json.loads(ligne)
            except ValueError:
                continue
            if not isinstance(run, dict):
                continue
            brut = run.get(champ, "(absent)")
            if isinstance(brut, (dict, list)):
                brut = "(structure)"
            if str(brut) == str(valeur):
                yield numero, run


def lister(argv) -> int:
    """--lister <champ> <valeur> — LECTURE SEULE : les runs qui matchent.

    Rend le numero de ligne, le `ts` et les `notes` INTEGRALES. Pas de coupe :
    on ne decide pas de solder (ou de classer sans suite) un run dont l'objet
    est illisible — meme motif que `read_runs` dans `scripts/scan_projets.py`.
    Aucun classement automatique ouvert/ferme : l'outil PRESENTE, l'humain
    requalifie (un classement qui se trompe solderait un reste reel, R5).
    """
    if len(argv) < 2:
        print("log_run --lister : usage : --lister <champ> <valeur>"
              f"  (champs usuels : {', '.join(CHAMPS_STATS)})")
        return 1
    champ, valeur = argv[0], argv[1]
    n = 0
    try:
        print(f"log_run --lister : runs dont '{champ}' == '{valeur}' "
              "(lecture seule, aucun run n'est solde)")
        for numero, run in lister_runs(champ, valeur):
            n += 1
            ts = run.get("ts")
            # `or ''` et pas `get(..., '')` : le journal porte des `null`, et un
            # `ts: null` s'affiche « None » — c'est justement le cas que cette
            # commande doit rendre VISIBLE (2 runs du hub, mesure 2026-09-27).
            print(f"  L{numero:<5d} ts={ts!s:<26} {str(run.get('demande') or '')[:70]}")
            print(f"         notes: {str(run.get('notes') or '')}")
    except OSError as exc:
        print(f"log_run --lister : journal illisible ({exc})")
        return 1
    print(f"  {n} run(s) liste(s).")
    if n:
        print("  Solder l'un d'eux : --solde <prefixe-ts> <resultat> \"note\","
              " ou --solde --demande <fragment de demande> <resultat> \"note\""
              " quand le `ts` est absent.")
    return 0


# --- Candidats et choix (GMAH, comparateur fantome) ---------------------------
# Deux champs OPTIONNELS du run, poses par flags : `--candidats-json '<liste>'` et
# `--choix NOM`. Tout-ou-rien ; invalide = refus, RIEN n'est ecrit ; absents =
# comportement strictement inchange. Validation STRUCTURELLE : le canon ne peut pas
# importer `gravite.py` (absent de certains projets) ; les noms de champs copient
# `gravite.score` (un test les egalise avec la source quand elle est presente).
FLAG_CANDIDATS = "--candidats-json"
FLAG_CHOIX = "--choix"
CANDIDATS_MAX = 20
CANDIDATS_OCTETS_MAX = 4096
_CHAMPS_SCORE = ("priorite", "fit", "preuve", "reuse", "distance",
                 "cout", "tokens", "latence", "charge", "risque", "contexte")
_CHAMPS_TEXTE = ("modele", "perimetre")
_MODES_EXCLUSIFS = ("--solde", "--verdict", "--stats", "--lister", "--dette-oracle")


def verifier_candidats_choix(brut, choix):
    """(liste_validee, None) ou (None, message de refus)."""
    if brut is None or choix is None:
        return None, (f"log_run REFUS : {FLAG_CANDIDATS} et {FLAG_CHOIX} vont ensemble "
                      "(les deux ou aucun).")
    if len(brut.encode("utf-8", "replace")) > CANDIDATS_OCTETS_MAX:
        return None, f"log_run REFUS : candidats > {CANDIDATS_OCTETS_MAX} octets."
    try:
        cands = json.loads(brut)
    except ValueError as exc:
        return None, f"log_run REFUS : candidats : JSON invalide ({exc})."
    if not isinstance(cands, list) or not cands:
        return None, "log_run REFUS : candidats : une liste non vide est attendue."
    if len(cands) > CANDIDATS_MAX:
        return None, f"log_run REFUS : candidats : {CANDIDATS_MAX} au maximum."
    noms = []
    permis = ("nom", "requiert_arbitrage") + _CHAMPS_TEXTE + _CHAMPS_SCORE
    for i, c in enumerate(cands):
        if not isinstance(c, dict):
            return None, f"log_run REFUS : candidats[{i}] : un objet est attendu."
        inconnus = sorted(set(c) - set(permis))
        if inconnus:
            return None, (f"log_run REFUS : candidats[{i}] : champ(s) inconnu(s) "
                          f"{inconnus} (permis : {', '.join(permis)}).")
        nom = c.get("nom")
        if not isinstance(nom, str) or not nom.strip() or len(nom) > 64:
            return None, f"log_run REFUS : candidats[{i}] : 'nom' = chaine non vide de 64 car. max."
        if not nom.isprintable():
            return None, f"log_run REFUS : candidats[{i}].nom : caractere non imprimable interdit."
        if nom in noms:
            return None, f"log_run REFUS : candidats : nom en double {nom!r}."
        noms.append(nom)
        for k in _CHAMPS_SCORE:
            if k not in c:
                continue
            v = c[k]
            # int d'abord : un entier JSON geant fait lever OverflowError a isfinite/float
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                bon = False
            elif isinstance(v, int):
                bon = 0 <= v <= 1
            else:
                bon = 0 <= v <= 1   # NaN/Inf: comparaisons fausses, donc refuses
            if not bon:
                return None, (f"log_run REFUS : candidats[{i}].{k} : nombre fini "
                              f"dans [0, 1] attendu, recu {repr(v)[:40]}.")
        for k in _CHAMPS_TEXTE:
            if k in c and (not isinstance(c[k], str) or len(c[k]) > 200):
                return None, f"log_run REFUS : candidats[{i}].{k} : chaine de 200 car. max."
            if k in c and not c[k].isprintable():
                return None, f"log_run REFUS : candidats[{i}].{k} : caractere non imprimable interdit."
        if "requiert_arbitrage" in c and not isinstance(c["requiert_arbitrage"], bool):
            return None, f"log_run REFUS : candidats[{i}].requiert_arbitrage : booleen attendu."
    if choix not in noms:
        return None, (f"log_run REFUS : choix {choix!r} ne nomme aucun candidat "
                      f"({', '.join(map(repr, noms))}).")
    return cands, None


# --- Trace de decision rejouable (story 8.10) ------------------------------------
# Champ OPTIONNEL `trace_decision`, pose par `--trace-decision '<json>'` : exige
# `--candidats-json` ET `--choix`. Validation STRUCTURELLE (le canon n'importe pas
# `gravite.py`) ; la verification arithmetique est le travail de
# `scripts/rejouer_decisions.py`. Invalide = refus, RIEN n'est ecrit ; flag absent =
# ligne de journal strictement inchangee.
FLAG_TRACE = "--trace-decision"
TRACE_OCTETS_MAX = 8192
TRACE_PROFONDEUR_MAX = 6
TRACE_VERSION = 1
TRACE_TOTAL_MAX = 1000.0
_TRACE_POIDS = ("w_attr", "kappa", "eps", "rho", "cout", "tokens", "latence", "charge",
                "risque", "contexte")
_TRACE_CLES = ("version", "poids", "contexte", "decisions", "plancher", "classement_ombre")
_TRACE_DECISION_CLES = ("nom", "eligible", "raison", "total")


def _profondeur(x) -> int:
    """Nesting depth of a parsed JSON value, iterative (no recursion on hostile input)."""
    maxi, pile = 0, [(x, 1)]
    while pile:
        v, d = pile.pop()
        if isinstance(v, (dict, list)):
            maxi = max(maxi, d)
            if maxi > TRACE_PROFONDEUR_MAX:
                return maxi
            pile.extend((e, d + 1) for e in (v.values() if isinstance(v, dict) else v))
    return maxi


def _refus_constante(nom):
    raise ValueError(f"constante {nom} interdite")


def _sans_doublon(paires):
    d = {}
    for k, v in paires:
        if k in d:
            raise ValueError(f"cle en double {k!r}")
        d[k] = v
    return d


def _nombre_fini(v) -> bool:
    return (not isinstance(v, bool) and isinstance(v, (int, float))
            and (isinstance(v, int) or v - v == 0))


def _contenu_sain(x) -> bool:
    """No non-finite number, no non-printable string anywhere in the value."""
    pile = [x]
    while pile:
        v = pile.pop()
        if isinstance(v, dict):
            for k, e in v.items():
                if not isinstance(k, str) or not k.isprintable():
                    return False
                pile.append(e)
        elif isinstance(v, list):
            pile.extend(v)
        elif isinstance(v, str):
            if not v.isprintable():
                return False
        elif isinstance(v, float):
            if v - v != 0:
                return False
    return True


def verifier_trace(brut, noms, ombre_permise=False):
    """(trace_validee, None) ou (None, message de refus). Jamais de pile.
    `classement_ombre` n'est accepte que si `ombre_permise` (chemin automatique seul)."""
    pre = "log_run REFUS : trace_decision"
    if len(brut.encode("utf-8", "replace")) > TRACE_OCTETS_MAX:
        return None, f"{pre} > {TRACE_OCTETS_MAX} octets."
    try:
        t = json.loads(brut, parse_constant=_refus_constante, object_pairs_hook=_sans_doublon)
    except (ValueError, RecursionError) as exc:
        return None, f"{pre} : JSON invalide ({str(exc)[:80]})."
    if not isinstance(t, dict):
        return None, f"{pre} : un objet est attendu."
    if _profondeur(t) > TRACE_PROFONDEUR_MAX:
        return None, f"{pre} : imbrication > {TRACE_PROFONDEUR_MAX}."
    inconnus = sorted(set(t) - set(_TRACE_CLES))
    if inconnus:
        return None, f"{pre} : cle(s) inconnue(s) {inconnus} (permis : {', '.join(_TRACE_CLES)})."
    for k in ("version", "poids", "decisions", "plancher"):
        if k not in t:
            return None, f"{pre} : '{k}' absent."
    if isinstance(t["version"], bool) or t["version"] != TRACE_VERSION \
            or not isinstance(t["version"], int):
        return None, f"{pre} : version {TRACE_VERSION} attendue."
    if not _contenu_sain(t):
        return None, f"{pre} : nombre non fini ou caractere non imprimable."
    p = t["poids"]
    if not isinstance(p, dict) or set(p) != set(_TRACE_POIDS):
        return None, f"{pre}.poids : exactement les cles {', '.join(_TRACE_POIDS)}."
    for k, v in p.items():
        if not _nombre_fini(v) or not 0 <= v <= 1e6:
            return None, f"{pre}.poids.{k} : nombre fini dans [0, 1e6] attendu."
    if not _nombre_fini(t["plancher"]) or abs(t["plancher"]) > TRACE_TOTAL_MAX:
        return None, f"{pre}.plancher : nombre fini dans [-{TRACE_TOTAL_MAX:g}, {TRACE_TOTAL_MAX:g}] attendu."
    if "contexte" in t and not isinstance(t["contexte"], dict):
        return None, f"{pre}.contexte : un objet est attendu."
    if "classement_ombre" in t and not ombre_permise:
        return None, f"{pre}.classement_ombre : reserve a la trace automatique."
    if "classement_ombre" in t:  # story 14.18 : classement GMAH en ombre, jamais decisif
        o = t["classement_ombre"]
        if not isinstance(o, list) or len(o) > CANDIDATS_MAX or len(set(map(str, o))) != len(o)                 or not all(isinstance(n, str) and n in noms for n in o):
            return None, f"{pre}.classement_ombre : liste de noms de candidats distincts attendue."
    d = t["decisions"]
    if not isinstance(d, list) or not d or len(d) > CANDIDATS_MAX:
        return None, f"{pre}.decisions : liste de 1 a {CANDIDATS_MAX} objets attendue."
    vus = []
    for i, e in enumerate(d):
        if not isinstance(e, dict) or set(e) != set(_TRACE_DECISION_CLES):
            return None, f"{pre}.decisions[{i}] : exactement les cles {', '.join(_TRACE_DECISION_CLES)}."
        if not isinstance(e["nom"], str) or e["nom"] not in noms or e["nom"] in vus:
            return None, f"{pre}.decisions[{i}].nom : nom de candidat inconnu ou en double."
        vus.append(e["nom"])
        if not isinstance(e["eligible"], bool):
            return None, f"{pre}.decisions[{i}].eligible : booleen attendu."
        if e["eligible"]:
            ok = _nombre_fini(e["total"]) and abs(e["total"]) <= TRACE_TOTAL_MAX \
                and e["raison"] is None
        else:
            ok = e["total"] is None and isinstance(e["raison"], str) and 0 < len(e["raison"]) <= 64
        if not ok:
            return None, (f"{pre}.decisions[{i}] : eligible = total fini dans "
                          f"[-{TRACE_TOTAL_MAX:g}, {TRACE_TOTAL_MAX:g}] sans raison ; "
                          "non eligible = raison texte sans total.")
    if set(vus) != set(noms):
        return None, f"{pre}.decisions : un candidat sans decision."
    return t, None


# --- Trace de decision AUTOMATIQUE (story 14.7) ----------------------------------
# Run route (`--candidats-json` + `--choix`) journalise pendant que le mode est VERIFIE
# actif : `log_run` construit lui-meme la trace via `scripts/construire_trace_decision.py`
# (hub uniquement ; absent dans une cible => mode eteint, rien n'est fait). Mode eteint ou
# non verifiable : rien, sans bruit. Mode actif et trace impossible, ou run `orchestre` sans
# candidats : avertissement NON bloquant + marqueur `trace_absente`.
CHAMP_TRACE_ABSENTE = "trace_absente"


def _charger_constructeur():
    """Module `construire_trace_decision` du hub, ou None (cible, fichier illisible)."""
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        p = os.path.join(d, "scripts", "construire_trace_decision.py")
        if os.path.isfile(p):
            try:
                import importlib.util
                spec = importlib.util.spec_from_file_location("construire_trace_decision_auto", p)
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                return mod
            except Exception:
                return None
        d = os.path.dirname(d)
    return None


def _mode_actif(mod) -> bool:
    """True seulement si le mode est verifie actif ; toute erreur = eteint (fail-open)."""
    try:
        return mod is not None and bool(mod.rejouer.gravite().actif_verifie())
    except Exception:
        return False


def trace_automatique(cands):
    """(etat, trace, detail) : etat 'eteint' (rien a faire), 'ok' ou 'echec' (mode actif)."""
    mod = _charger_constructeur()
    if not _mode_actif(mod):
        return "eteint", None, ""
    try:
        brut = json.dumps(mod.rejouer.construire_trace(cands, {}, None),
                          ensure_ascii=False, allow_nan=False)
    except Exception as exc:
        return "echec", None, f"calcul impossible ({str(exc)[:80]})"
    noms = [c["nom"] for c in cands]
    trace, refus = verifier_trace(brut, noms)
    if refus:
        return "echec", None, refus
    return "ok", _avec_classement_ombre(mod, cands, noms, trace), ""


def _avec_classement_ombre(mod, cands, noms, trace):
    """`trace` + `classement_ombre` (story 14.18). OMBRE : le choix effectif et le reste de la
    ligne ne changent jamais ; toute panne ou classement invalide = trace inchangee + avertissement."""
    try:
        import copy
        res = mod.rejouer.gravite().classer(copy.deepcopy(cands), {}, None)
        if not isinstance(res, list):
            raise TypeError("classement non liste")
        ordre = [c.get("nom") if isinstance(c, dict) else None for c in res]
        brut = json.dumps({**trace, "classement_ombre": ordre}, ensure_ascii=False, allow_nan=False)
        valide, refus = verifier_trace(brut, noms, ombre_permise=True)
        if refus:
            raise ValueError(refus)
        return valide
    except Exception as exc:  # fail-open : jamais bloquant, jamais decisif
        print(f"log_run AVERTISSEMENT : classement_ombre non ecrit ({type(exc).__name__}: "
              f"{str(exc)[:80]}) ; choix et trace inchanges.")
        return trace


def appliquer_trace_automatique(run, avec_candidats):
    """Pose `trace_decision` ou `trace_absente` sur `run` (mode actif seulement), jamais bloquant."""
    if "trace_decision" in run:
        return
    if avec_candidats:
        etat, trace, detail = trace_automatique(run["candidats"])
        if etat == "ok":
            run["trace_decision"] = trace
        elif etat == "echec":
            run[CHAMP_TRACE_ABSENTE] = True
            print(f"log_run AVERTISSEMENT : trace_decision non construite ({detail}) ; "
                  f"run marque {CHAMP_TRACE_ABSENTE}.")
    elif run.get("qualification") == "orchestre" and _mode_actif(_charger_constructeur()):
        run[CHAMP_TRACE_ABSENTE] = True
        print(f"log_run AVERTISSEMENT : run oriente sans candidats alors que le mode est actif ; "
              f"pas de trace_decision, run marque {CHAMP_TRACE_ABSENTE} "
              f"(voir {FLAG_CANDIDATS} / {FLAG_CHOIX}).")


def extraire_trace(argv):
    """(argv sans le flag, brut|None, present, erreur|None)."""
    reste, brut, present, i = [], None, False, 0
    while i < len(argv):
        if argv[i] == FLAG_TRACE:
            if present:
                return argv, None, True, f"log_run REFUS : {FLAG_TRACE} donne deux fois."
            if i + 1 >= len(argv):
                return argv, None, True, f"log_run REFUS : {FLAG_TRACE} attend une valeur."
            brut, present = argv[i + 1], True
            i += 2
            continue
        reste.append(argv[i])
        i += 1
    return reste, brut, present, None


# --- Couverture des couts (story 8.14) -------------------------------------------
# Champ OPTIONNEL `cout_couverture`, pose par `--cout-couverture complet|partiel|inconnu`.
# Autre valeur = refus, RIEN n'est ecrit ; flag absent = ligne de journal inchangee.
FLAG_COUT_COUV = "--cout-couverture"
COUT_COUVERTURES = ("complet", "partiel", "inconnu")


def extraire_cout_couverture(argv):
    """(argv sans le flag, valeur|None, present, erreur|None)."""
    reste, val, present, i = [], None, False, 0
    while i < len(argv):
        if argv[i] == FLAG_COUT_COUV:
            if present:
                return argv, None, True, f"log_run REFUS : {FLAG_COUT_COUV} donne deux fois."
            if i + 1 >= len(argv):
                return argv, None, True, f"log_run REFUS : {FLAG_COUT_COUV} attend une valeur."
            val, present = argv[i + 1], True
            i += 2
            continue
        reste.append(argv[i])
        i += 1
    if present and val not in COUT_COUVERTURES:
        return argv, None, True, (f"log_run REFUS : {FLAG_COUT_COUV} {val!r} invalide "
                                  f"(attendu : {' | '.join(COUT_COUVERTURES)}).")
    return reste, val, present, None


# --- Refus (story 8.25) ----------------------------------------------------------
# Champ OPTIONNEL booleen `refus`, pose par `--refus oui|non`. Autre valeur = refus,
# RIEN n'est ecrit ; flag absent = ligne de journal inchangee.
FLAG_REFUS = "--refus"
REFUS_VALEURS = {"oui": True, "non": False}


def extraire_refus(argv):
    """(argv sans le flag, bool|None, present, erreur|None)."""
    reste, val, present, i = [], None, False, 0
    while i < len(argv):
        if argv[i] == FLAG_REFUS:
            if present:
                return argv, None, True, f"log_run REFUS : {FLAG_REFUS} donne deux fois."
            if i + 1 >= len(argv):
                return argv, None, True, f"log_run REFUS : {FLAG_REFUS} attend une valeur."
            val, present = argv[i + 1], True
            i += 2
            continue
        reste.append(argv[i])
        i += 1
    if present and val not in REFUS_VALEURS:
        return argv, None, True, (f"log_run REFUS : {FLAG_REFUS} {val!r} invalide "
                                  f"(attendu : {' | '.join(REFUS_VALEURS)}).")
    return reste, REFUS_VALEURS.get(val), present, None


def extraire_candidats_choix(argv):
    """(argv sans les flags, brut|None, choix|None, presents, erreur|None)."""
    reste, vals, i = [], {}, 0
    while i < len(argv):
        if argv[i] in (FLAG_CANDIDATS, FLAG_CHOIX):
            if argv[i] in vals:
                return argv, None, None, True, f"log_run REFUS : {argv[i]} donne deux fois."
            if i + 1 >= len(argv):
                return argv, None, None, True, f"log_run REFUS : {argv[i]} attend une valeur."
            vals[argv[i]] = argv[i + 1]
            i += 2
            continue
        reste.append(argv[i])
        i += 1
    return reste, vals.get(FLAG_CANDIDATS), vals.get(FLAG_CHOIX), bool(vals), None


FLAG_LOT = "--lot"
RESULTAT_LOT = "en-attente-validation"  # R5 : un lot ne se solde jamais a l'append


def _constructeur_dans_ma_racine(mod) -> bool:
    """True seulement si `mod` vient de `<racine>/scripts/` ou `<racine>` est le depot qui
    porte CE log_run (parent du dossier `.claude` ancetre). Un module trouve plus haut dans
    l'arborescence (copie plantee, depot parent) n'est pas cru : `--lot` echoue ferme."""
    try:
        d = os.path.dirname(os.path.abspath(__file__))
        while os.path.basename(d) != ".claude":
            parent = os.path.dirname(d)
            if parent == d:
                return False
            d = parent
        racine = os.path.realpath(os.path.dirname(d))
        f = getattr(mod, "__file__", None)
        if not f:
            return False
        return os.path.realpath(os.path.dirname(os.path.dirname(f))) == racine
    except Exception:
        return False


def _mode_actif_lot() -> bool:
    """Signal GMAH pour `--lot` : etat signe (HMAC + arbitrage) relu par `actif_verifie`, lu
    depuis le depot de ce log_run seulement. Ni argv ni l'environnement ne le fournissent ;
    toute anomalie = False (ferme)."""
    mod = _charger_constructeur()
    return mod is not None and _constructeur_dans_ma_racine(mod) and _mode_actif(mod)


def _lot_deja_journalise(run_id) -> bool:
    """True si une ligne de lot (`lot` vrai) porte deja ce run_id (cle d'idempotence)."""
    try:
        with open(RUNS_PATH, encoding="utf-8") as fh:
            for ligne in fh:
                if run_id in ligne:
                    try:
                        d = json.loads(ligne)
                    except ValueError:
                        continue
                    if d.get("run_id") == run_id and d.get("lot") is True:
                        return True
    except OSError:
        return False
    return False


def extraire_lot(argv):
    """(argv sans `--lot`, present). Drapeau booleen : un lot orchestre (story 9.3)."""
    return [a for a in argv if a != FLAG_LOT], FLAG_LOT in argv


def main(argv) -> int:
    # `--help`/`-h` seul : usage et code 0 (sinon lu comme un JSON invalide).
    if len(argv) == 1 and argv[0] in ("--help", "-h"):
        print((__doc__ or "log_run : voir l'en-tete du script").strip())
        return 0
    argv, _lot = extraire_lot(argv)
    argv, _trace_brut, _flag_trace, _err_trace = extraire_trace(argv)
    argv, _cands_brut, _choix_brut, _flags_cc, _err_cc = extraire_candidats_choix(argv)
    argv, _cout_couv, _flag_cc2, _err_cc2 = extraire_cout_couverture(argv)
    argv, _refus_val, _flag_refus, _err_refus = extraire_refus(argv)
    if _err_refus or (_flag_refus and argv and argv[0] in _MODES_EXCLUSIFS):
        print(_err_refus or f"log_run REFUS : {FLAG_REFUS} n'existe qu'a l'append d'un run.")
        return 1
    if _err_cc2 or (_flag_cc2 and argv and argv[0] in _MODES_EXCLUSIFS):
        print(_err_cc2 or f"log_run REFUS : {FLAG_COUT_COUV} n'existe qu'a l'append d'un run.")
        return 1
    if _err_trace or _err_cc or ((_flags_cc or _flag_trace) and argv and argv[0] in _MODES_EXCLUSIFS):
        print(_err_trace or _err_cc or f"log_run REFUS : {FLAG_CANDIDATS}/{FLAG_CHOIX}/{FLAG_TRACE} n'existent qu'a l'append d'un run.")
        return 1
    if _flag_trace and (_cands_brut is None or _choix_brut is None):
        print(f"log_run REFUS : {FLAG_TRACE} exige {FLAG_CANDIDATS} et {FLAG_CHOIX} "
              "(ensemble).")
        return 1
    if "--solde-par" in argv and not (argv and argv[0] == "--solde"):
        print("log_run : --solde-par n'a de sens qu'avec --solde (refuse)")
        return 1
    if argv and argv[0] == "--solde":
        return solder(argv[1:])
    if argv and argv[0] == "--verdict":
        return verdict(argv[1:])
    if argv and argv[0] == "--stats":
        return imprimer_stats(argv[1:])
    # AVANT le repli d'append (`raw = argv[0]` plus bas) : sans ce routage, un
    # `--lister` mal forme tomberait dans le parseur JSON d'append et se
    # plaindrait d'un « JSON invalide ». Meme motif que la porte de derriere
    # de `--solde` documentee dans `solder()`.
    if argv and argv[0] == "--lister":
        return lister(argv[1:])
    if argv and argv[0] == "--dette-oracle":
        sans, total = compter_succes_sans_oracle()
        print(f"log_run : {sans} run(s) 'succes' sur {total} ne portent aucun "
              f"'{CHAMP_LIVRABLE}' - non controles au solde (non-retroactivite "
              "deliberee). La dette est desormais mesuree, plus muette.")
        return 0
    raw = argv[0] if argv else sys.stdin.read()
    try:
        run = json.loads(raw)
    except ValueError as exc:
        print(f"log_run : JSON invalide ({exc})")
        return 1
    if not isinstance(run, dict):
        print("log_run : un objet JSON est attendu")
        return 1
    # Le marqueur booleen `lot` (story 9.3) ne s'ecrit QUE par `--lot` : mode GMAH verifie
    # actif, candidats/choix, R5. Pose a la main dans le JSON, il forgeait une ligne de lot
    # (`_lot_deja_journalise` cle sur `lot is True`) et, depuis que `verifier_lot` ne le
    # resout plus, un `succes` sans preuve (revue a 3 voix du 2026-11-02). `false` aussi :
    # aucun booleen ne nomme un lot du registre, qui se nomme par une chaine.
    if not _lot and isinstance(run.get(CHAMP_LOT), bool):
        print(f"log_run REFUS : '{CHAMP_LOT}': {json.dumps(run[CHAMP_LOT])} dans le JSON du "
              f"run - le marqueur booleen de lot orchestre ne s'ecrit que par {FLAG_LOT} "
              "(mode GMAH verifie actif, candidats/choix, R5). Un lot nominatif du "
              "registre se nomme par une chaine : \"lot\": \"<id>\".")
        return 1
    if _lot:
        # Story 9.3 : un lot orchestre ne se journalise QUE mode verifie actif, avec candidats+choix.
        if not _flags_cc:
            print(f"log_run REFUS : {FLAG_LOT} exige {FLAG_CANDIDATS} et {FLAG_CHOIX}.")
            return 1
        if not _mode_actif_lot():
            print(f"log_run : {FLAG_LOT} mode GMAH eteint ou non verifiable, lot non ecrit "
                  "(regle du 2026-09-07 : seulement une correction ou un bug traite).")
            return 0
        # R5 mecanique : une ligne de lot reste en attente de validation, jamais soldee ici.
        if run.get("resultat", RESULTAT_LOT) != RESULTAT_LOT:
            print(f"log_run REFUS : {FLAG_LOT} n'ecrit que resultat={RESULTAT_LOT!r} "
                  "(R5 : le solde passe par --solde apres le OK de l'utilisateur).")
            return 1
        run["resultat"] = RESULTAT_LOT
        # Cle d'idempotence = run_id (obligatoire) : rejouer le meme lot n'ajoute aucune ligne.
        if not run.get("run_id"):
            print(f"log_run REFUS : {FLAG_LOT} exige un run_id (cle d'idempotence du lot).")
            return 1
        if _lot_deja_journalise(run["run_id"]):
            print(f"log_run : lot {run['run_id']!r} deja journalise, rien n'est ajoute.")
            return 0
        run["lot"] = True
    if "trace_decision" in run and not _flag_trace:
        print(f"log_run REFUS : trace_decision ne s'ecrit que par {FLAG_TRACE} (jamais dans le JSON du run).")
        return 1
    if "cout_couverture" in run:
        print(f"log_run REFUS : cout_couverture ne s'ecrit que par {FLAG_COUT_COUV} (jamais dans le JSON du run).")
        return 1
    if _flag_cc2:
        run["cout_couverture"] = _cout_couv
    if _flag_refus:
        if "refus" in run:
            print(f"log_run REFUS : refus donne a la fois par {FLAG_REFUS} et dans le JSON du run.")
            return 1
        run["refus"] = _refus_val
    if _flags_cc:
        if "candidats" in run or "choix" in run:
            print("log_run REFUS : candidats/choix donnes a la fois par flag et dans le JSON du run.")
            return 1
        _cands, _refus_cc = verifier_candidats_choix(_cands_brut, _choix_brut)
        if _refus_cc:
            print(_refus_cc)
            return 1
        run["candidats"], run["choix"] = _cands, _choix_brut
        if _flag_trace:
            if "trace_decision" in run:
                print("log_run REFUS : trace_decision donnee a la fois par flag et dans le JSON du run.")
                return 1
            _trace, _refus_tr = verifier_trace(_trace_brut, [c["nom"] for c in _cands])
            if _refus_tr:
                print(_refus_tr)
                return 1
            run["trace_decision"] = _trace
    missing = [k for k in ("demande", "qualification") if not run.get(k)]
    if missing:
        print(f"log_run : champ(s) requis manquant(s) : {', '.join(missing)}")
        return 1
    if run["qualification"] not in QUALIFICATIONS:
        print(f"log_run : qualification invalide (attendu : {' | '.join(QUALIFICATIONS)})")
        return 1
    # `resultat` ABSENT reste accepte (un run peut s'ouvrir sans) ; present, il doit
    # etre l'un des etats connus — sinon le journal accumule des valeurs qu'aucun
    # calcul de taux ne sait lire.
    if "resultat" in run and run["resultat"] not in RESULTATS_APPEND:
        print(f"log_run : resultat invalide ({run['resultat']!r}) — attendu : "
              f"{' | '.join(RESULTATS_APPEND)}")
        return 1
    # AVANT `verifier_revue_increment` : un plan qui se contredit lui-meme doit etre
    # signale pour ce qu'il est, pas renvoye vers la boucle de revue.
    refus_etapes = verifier_etapes_du_plan(run)
    if refus_etapes:
        print(refus_etapes)
        return 1
    refus_ordre = verifier_ordre_playbook_ppt(run)
    if refus_ordre:
        print(refus_ordre)
        return 1
    refus_forme = verifier_forme_tache(run)
    if refus_forme:
        print(refus_forme)
        return 1
    refus_gt = verifier_gabarit_topologie(run)
    if refus_gt:
        print(refus_gt)
        return 1
    refus_salle = verifier_champs_salle_requis(run)
    if refus_salle:
        print(refus_salle)
        return 1
    _strict = not _lot and journal_strict()   # stories 19.1/19.2 (D11) : append seul, opt-in hub
    if _strict:
        refus_topo = verifier_topologie_obligatoire(run)
        if refus_topo:
            print(refus_topo)
            return 1
    if "verdict_aval" in run:
        print("log_run REFUS : verdict_aval ne s'ecrit pas a l'append.\n"
              "  Utiliser : --verdict <run_id|prefixe-ts> <valeur> <preuve>.")
        return 1
    if "run_id" in run and run_id_existe(run["run_id"]):
        print(f"log_run REFUS : run_id deja present ou journal illisible : {run['run_id']!r}.")
        return 1
    run.setdefault("run_id", nouveau_run_id())
    run.update(inferer_debut(run))
    _nb_fenetre = FENETRE_USAGE_LARGE if run.get("debut_infere") else FENETRE_USAGE_COURTE
    _jl = _jointure_lignes(run, nb_lignes=_nb_fenetre)   # UNE jointure pour tokens ET couverture
    run.update(jointure_cout(run, nb_lignes=_nb_fenetre, jointure=_jl))
    if "cout_couverture" not in run:   # le drapeau explicite (8.14) reste prioritaire
        _cc_derivee = couverture_jointure(run, nb_lignes=_nb_fenetre, jointure=_jl)
        if _cc_derivee:
            run["cout_couverture"] = _cc_derivee
    if _strict:
        completer_cout_inconnu(run, _jl)
    refus_validation = verifier_validation_utilisateur(run, au_solde=False)
    if refus_validation:
        print(refus_validation)
        return 1
    refus_lot = verifier_lot(run)
    if refus_lot:
        print(refus_lot)
        return 1
    refus_preuve = verifier_preuve_de_verification(run)
    if refus_preuve:
        print(refus_preuve)
        return 1
    refus_revue = verifier_revue_increment(run)
    if refus_revue:
        print(refus_revue)
        return 1
    appliquer_trace_automatique(run, _flags_cc)
    run.setdefault("ts", datetime.datetime.now().astimezone().isoformat(timespec="seconds"))
    with open(RUNS_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(run, ensure_ascii=False) + "\n")
    print(f"log_run : run journalise ({run['qualification']}, {len(run.get('plan', []))} etape(s))")
    avertir_validation_utilisateur(run)
    return 0


# Marqueurs d'un livrable CONSOMMÉ par l'utilisateur (deck exporté, écran) et
# d'une validation utilisateur explicite dans les notes. Diagnostic superviseur
# 2026-07-23 (arbitré) : 0/47 runs « en-attente-validation » alors que la règle
# l'exigeait — le garde-fou devient exécutable, en avertissement NON bloquant.
LIVRABLE_UTILISATEUR = ("deck", "slide", "pptx", "ecran", "écran", "export")
VALIDATION_UTILISATEUR = ("valide par l'utilisateur", "validé par l'utilisateur",
                          "valide par utilisateur", "ok utilisateur")


# --- Succes sans preuve de verification (revue 2026-10-19 F4) ----------------
# Un `succes` dont les notes ne portent AUCUN marqueur de verification etait
# accepte sans condition ; seul le scan le comptait apres coup (21 %). Refus a
# l'append, sauf qualification explicite `verification: "non-verifiee"`.
# COPIE de `scripts/scan_projets.MARQUEURS_VERIFICATION` (le scan n'est pas
# deploye avec le canon) : un test egalise les deux listes. Seules les `notes`
# comptent : un marqueur dans une autre cle ne prouve rien.
CHAMP_VERIFICATION = "verification"
VERIFICATION_NON_VERIFIEE = "non-verifiee"
MARQUEURS_VERIFICATION = (
    r"pytest",
    r"py -m",
    r"mesur",
    r"rendu regard",
    r"\bouvert",
    r"\b(?=[0-9]*[a-f])[0-9a-f]{7,40}\b",
    r"\bpassed\b",
    r"--check",
)


# Route COMMANDE (option 1) : « mesur », « rendu regard » et « ouvert » ne designent
# aucune commande ; ils restent dans MARQUEURS_VERIFICATION (copie du scan, qui MESURE)
# mais ne declenchent plus la route commande -- un tel succes tombe dans le refus
# « aucune preuve ». La preuve visuelle a sa propre route (ligne stricte).
MARQUEURS_HORS_COMMANDE = (r"mesur", r"rendu regard", r"\bouvert")
MARQUEURS_COMMANDE = tuple(m for m in MARQUEURS_VERIFICATION if m not in MARQUEURS_HORS_COMMANDE)


def _a_plat(txt) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", str(txt)).encode("ascii", "ignore").decode().lower()


# Negation (diagnostic 2026-10-19) : « fait, rien mesure » ou « pytest pas lance »
# portaient un marqueur sans verification. Un marqueur est NIE si, dans la meme
# proposition (coupee a , ; . ! ? saut de ligne et « mais »), un negateur le precede
# de moins de 4 mots ou le suit de 2 mots. « ne ... pas » compte pour UNE negation
# (« ne » seul ignore). Un nombre pair de negateurs du meme cote s'annule
# (« jamais sans pytest » passe). « non-execute » se lit « non » + « execute ».
# Option 1 (utilisateur, 2026-10-24) : BORNER ET FIGER, pas etendre. Mesure sur le
# journal reel (214 succes, 89 avec marqueur, 14 avec un negateur proche) : 0 negation
# reelle, 14 innocentes (« sans ecart », « aucun dechet »). Le lexique ne gagne donc
# que les mots du corpus de tests/test_log_run_negation_corpus.py, chacun avec un
# contre-cas honnete accepte.
# LIMITE ASSUMEE : cette negation LEXICALE est une FRICTION pour l'erreur honnete, PAS
# une protection contre la mauvaise foi : rien ne relie les notes a une execution
# reelle (« pytest 12 passed » s'ecrit sans avoir lance pytest). Friction connue :
# « passed pas de regression » ou « nothing to report: pytest 12 passed » sont refuses
# a tort (separer par une virgule), « pytest 12 passed sans erreur » reste accepte.
_NEGATEURS_AVANT = frozenset({
    "rien", "pas", "non", "sans", "jamais", "aucun", "aucune",
    "ni", "impossible", "omis", "omise", "skipped", "unable", "nothing", "none",
    "absent", "absente",
})
_NEGATEURS_APRES = frozenset({"pas", "non", "jamais", "impossible", "omis", "omise"})
# « absent » nie juste apres le marqueur (« pytest absent »), pas dans « absent de regression ».
_ABSENTS_APRES = frozenset({"absent", "absente"})
_DE_APRES_ABSENT = frozenset({"de", "du", "des", "d"})
# Mots d'echec : nient jusqu'a 8 mots apres un marqueur DANS LA PROPOSITION (« pytest failed »,
# « 12 passed 0 failed 3 failed »), sauf un compte nul juste devant CE mot (« 0 failed »).
# « skipped » est de plus exempt derriere un nombre (« 4 skipped » n'est pas un echec).
# FRICTION CONNUE, VOULUE (journal reel, run 230 : « 2585 passed / 2 failed puis les 2
# qualifies et fermes ») : « N failed » apres un compte de passed est refuse ; contournement :
# une virgule ou une reformulation (« 2585 passed, 2 failed puis ... »).
_ECHECS_APRES = frozenset({"skipped", "failed", "echec", "echecs"})
_ZEROS_AVANT_ECHEC = frozenset({"0", "zero", "aucun", "aucune", "sans", "no"})
FENETRE_ECHEC = 8
_COUPURE_PROPOSITION = re.compile(r"[,;.!?\n]|\bmais\b")


# Round 3 : un mot d'echec dans un CHEMIN (tests/test_failed_login.py) n'est pas un echec.
_MARQUES_CHEMIN = ("/", chr(92), "_", ".py")


def _mots_echec(texte: str) -> list:
    """Mots [a-z0-9]+ de `texte`, sauf ceux d'un morceau qui ressemble a un chemin
    (remplace par '#') : seul ce morceau est ignore, le reste de la proposition compte."""
    mots = []
    for morceau in texte.split():
        if any(x in morceau for x in _MARQUES_CHEMIN):
            mots.append("#")
        else:
            mots.extend(re.findall(r"[a-z0-9]+", morceau))
    return mots


def _echec_apres(mots) -> bool:
    for k, w in enumerate(mots):
        if w not in _ECHECS_APRES:
            continue
        prec = mots[k - 1] if k else ""
        if prec in _ZEROS_AVANT_ECHEC:
            continue
        if w == "skipped" and prec.isdigit():
            continue
        return True
    return False


def _marqueur_affirme(notes: str, motif: str) -> bool:
    """Vrai si `motif` apparait dans `notes` au moins une fois sans negation proche."""
    return _etat_marqueur(notes, motif)[0]


def _etat_marqueur(notes: str, motif: str):
    """(affirme, rejete_par_echec) : `rejete_par_echec` vaut vrai si au moins une
    occurrence a ete ecartee a cause d'un mot d'echec qui la suit (message du refus)."""
    par_echec = False
    coupures = [(c.start(), c.end()) for c in _COUPURE_PROPOSITION.finditer(notes)]
    fins = [e for _s, e in coupures]
    debuts = [s for s, _e in coupures]
    for m in re.finditer(motif, notes):
        i = bisect.bisect_right(fins, m.start())
        debut = max(fins[i - 1] if i else 0, m.start() - 200)
        j = bisect.bisect_left(debuts, m.end())
        fin = min(debuts[j] if j < len(debuts) else len(notes), m.end() + 200)
        avant = re.findall(r"[a-z0-9]+", notes[debut:m.start()])[-4:]
        apres = re.findall(r"[a-z0-9]+", notes[m.end():fin])[:2]
        nb_av = sum(1 for w in avant if w in _NEGATEURS_AVANT)
        nb_ap = sum(1 for w in apres if w in _NEGATEURS_APRES)
        nb_ap += sum(1 for k, w in enumerate(apres)
                     if w in _ABSENTS_APRES and not (k + 1 < len(apres) and apres[k + 1] in _DE_APRES_ABSENT))
        if _echec_apres(_mots_echec(notes[m.end():fin])[:FENETRE_ECHEC]):
            par_echec = True
            continue  # un mot d'echec reel apres le marqueur : jamais une parite
        if nb_av % 2 == 0 and nb_ap % 2 == 0:
            return True, par_echec
    return False, par_echec


# --- Contrat de sortie executable (GMAH lot 1.2, arbitre 2026-10-23) ----------
# Un marqueur seul (« mesure », « ouvert », un sha) ne prouve pas qu'une commande a
# tourne. Un `succes` doit citer une COMMANDE et un JETON DE RESULTAT, tous deux
# affirmes (meme negation que ci-dessus). Vocabulaire tire de
# MARQUEURS_VERIFICATION ; seul « exit 0 » s'ajoute, comme jeton de resultat.
COMMANDES_PREUVE = (r"pytest", r"py -m", r"--check")
RESULTATS_PREUVE = (r"\bpassed\b", r"\bexit 0\b", r"\b(?=[0-9]*[a-f])[0-9a-f]{7,40}\b")


def element_manquant_preuve(notes: str) -> str | None:
    """None si `notes` (deja mises a plat) portent commande ET resultat affirmes ;
    sinon le nom de l'element manquant : 'commande', 'resultat' ou les deux."""
    manque = []
    if not any(_marqueur_affirme(notes, m) for m in COMMANDES_PREUVE):
        manque.append("commande")
    if not any(_marqueur_affirme(notes, m) for m in RESULTATS_PREUVE):
        manque.append("resultat")
    return " et ".join(manque) or None


def refus_preuve_executable(notes: str) -> str | None:
    manque = element_manquant_preuve(notes)
    if not manque:
        return None
    par_echec = any(
        (lambda e: not e[0] and e[1])(_etat_marqueur(notes, m))
        for m in COMMANDES_PREUVE + RESULTATS_PREUVE)
    indice = ""
    if par_echec:
        indice = (
            "  Un mot d'echec (" + ", ".join(sorted(_ECHECS_APRES)) + ") suit la commande ou le "
            "resultat dans la meme proposition : mettre une virgule avant ou reformuler "
            "(ex. '3 failed au premier essai, apres correctif 15 passed' sans le melanger a la "
            "commande).\n")
    return (
        f"log_run REFUS : resultat 'succes' sans preuve executable : element manquant = {manque}.\n"
        + indice +
        "  Attendu dans notes : une commande (pytest | py -m ... | --check) ET un jeton de "
        "resultat (N passed | exit 0 | sha de commit), non nies.\n"
        f"  Sinon qualifier : '{CHAMP_VERIFICATION}': '{VERIFICATION_NON_VERIFIEE}' "
        "(journalise et compte comme non verifie), ou un resultat 'partiel' / "
        "'en-attente-validation'."
    )


# Option A, FORME STRICTE (decisions utilisateur 2026-10-23 puis 2026-10-24, option b) :
# un livrable VISUEL peut prouver par une LIGNE qui vaut exactement
#     rendu regardé: <chemin>
# seule sur sa ligne (blancs de bord tolérés), sans commande. Aucun pliage, aucune
# analyse de négation : tout autre texte sur la ligne, un homoglyphe, un caractère de
# format ou un diacritique combinant font simplement NE PAS reconnaitre la ligne
# (fail-closed). Le chemin doit être un artefact visuel (EXTENSIONS_VISUELLES), fichier
# regulier non vide existant AU MOMENT DU LOG, sous C:/tmp ou sous le cwd s'il est la
# racine d'un depot git.
# FRICTION, PAS PREUVE : un fichier ancien ou renommé passe (aucun contrôle de mtime) ;
# une contradiction écrite sur UNE AUTRE ligne (« en fait pas regardé ») n'est pas vue.
MOTIF_RENDU_REGARDE = r"rendu regarde"
_RE_LIGNE_RENDU = re.compile(r"rendu regardé: +(\S+)", re.IGNORECASE)  # accent, ':' collé, 1+ espaces
_RE_DEBUT_RENDU = re.compile(r"rendu regard", re.IGNORECASE)
RACINES_RENDU = ("C:/tmp",)
EXTENSIONS_VISUELLES = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf",
                        ".html", ".htm", ".pptx", ".docx")
MESSAGE_PERIMETRE_VISUEL = ("preuve visuelle réservée aux livrables visuels (image, pdf, page, "
                            "deck) ; pour du code, une commande et son résultat")
MAX_OCCURRENCES_RENDU = 50
MAX_LONGUEUR_NOTES_VISUEL = 20000
MAX_LONGUEUR_NOTES = 20000  # borne AVANT tout _a_plat (NFKD peut multiplier x18)
GABARIT_RENDU = "rendu regardé: <chemin>"


def _lignes_rendu(notes_brutes: str):
    """(chemins des lignes au format strict, lignes candidates, trop).

    Candidate = ligne qui COMMENCE par « rendu regard » (apres strip) ; seule une
    candidate qui vaut exactement le gabarit fournit un chemin. Au plus
    MAX_OCCURRENCES_RENDU candidates (au-dela : trop)."""
    chemins, candidates = [], 0
    for ligne in notes_brutes.splitlines():
        ligne = ligne.strip()
        if not _RE_DEBUT_RENDU.match(ligne):
            continue
        candidates += 1
        if candidates > MAX_OCCURRENCES_RENDU:
            return chemins, candidates, True
        m = _RE_LIGNE_RENDU.fullmatch(ligne)
        if m:
            chemins.append(m.group(1))
    return chemins, candidates, False


def chemin_rendu(notes_brutes: str) -> str | None:
    """Chemin de la premiere ligne au format strict, sinon None (revue a posteriori)."""
    if len(notes_brutes) > MAX_LONGUEUR_NOTES_VISUEL:
        return None
    chemins = _lignes_rendu(notes_brutes)[0]
    return chemins[0] if chemins else None


def _racines_rendu() -> list:
    racines = [os.path.realpath(r) for r in RACINES_RENDU]
    cwd = os.path.realpath(os.getcwd())
    if os.path.exists(os.path.join(cwd, ".git")):
        racines.append(cwd)
    return racines


def _defaut_chemin_visuel(chemin: str) -> str | None:
    if ":" in re.sub(r"^[A-Za-z]:", "", chemin):  # flux de donnees alternatif a.txt:s.png
        return f"':' interdit dans le chemin hors lettre de lecteur : {chemin}"
    if os.path.splitext(chemin)[1].lower() not in EXTENSIONS_VISUELLES:
        return f"{MESSAGE_PERIMETRE_VISUEL} (extension refusee : {chemin})"
    absolu = os.path.normcase(os.path.realpath(os.path.abspath(chemin)))
    if not any(absolu == os.path.normcase(r) or absolu.startswith(os.path.normcase(r).rstrip(os.sep) + os.sep)
               for r in _racines_rendu()):
        return ("chemin hors des racines autorisees (C:/tmp, ou cwd racine d'un depot git) : "
                f"{chemin}")
    if not os.path.exists(absolu):
        return f"fichier introuvable : {chemin}"
    if not os.path.isfile(absolu):
        return f"pas un fichier regulier (dossier ?) : {chemin}"
    if os.path.getsize(absolu) == 0:
        return f"fichier vide : {chemin}"
    return None


def _cause_rendu(notes_brutes: str) -> str:
    """Cause probable du rejet d'une ligne candidate (la premiere reconnue)."""
    import unicodedata
    for ligne in notes_brutes.splitlines():
        ligne = ligne.strip()
        if not _RE_DEBUT_RENDU.match(ligne):
            continue
        if any(unicodedata.category(c) in ("Mn", "Cf") for c in ligne):
            return ("caractere invisible ou accent decompose : reecrire la ligne en ASCII + "
                    "« é » precompose")
        if "\uff1a" in ligne:
            return "deux-points pleine chasse : utiliser le « : » ASCII"
        if re.match(r"rendu regard.[ \t\u00a0\u2000-\u200a\u202f\u3000]+:", ligne, re.IGNORECASE):
            return "espace, tabulation ou NBSP avant le « : » : le coller au mot"
        if re.match(r"rendu regarde", ligne, re.IGNORECASE):
            return "accent manquant : ecrire « regardé » avec « é »"
    return "texte avant ou apres, ou chemin absent"


def verifier_preuve_visuelle(notes_brutes: str) -> str | None:
    """'' si aucune ligne ne commence par « rendu regard » (route non applicable) ;
    None si une ligne au format strict cite un fichier valide ; sinon un refus qui
    nomme le defaut et donne le gabarit a copier."""
    tete = "log_run REFUS : preuve visuelle 'rendu regarde' invalide : "
    pied = f"\n  Gabarit : une ligne a part, exactement « {GABARIT_RENDU} », rien d'autre sur la ligne."
    if len(notes_brutes) > MAX_LONGUEUR_NOTES_VISUEL:
        return tete + f"notes de plus de {MAX_LONGUEUR_NOTES_VISUEL} caracteres." + pied
    chemins, candidates, trop = _lignes_rendu(notes_brutes)
    if trop:
        return tete + f"plus de {MAX_OCCURRENCES_RENDU} lignes 'rendu regarde'." + pied
    if not candidates:
        return ""
    if not chemins:
        return tete + "aucune ligne au format strict (" + _cause_rendu(notes_brutes) + ")." + pied
    defauts = []
    for chemin in chemins:
        d = _defaut_chemin_visuel(chemin)
        if d is None:
            return None
        defauts.append(d)
    return tete + defauts[0] + pied


def verifier_preuve_de_verification(run: dict) -> str | None:
    """Refus si `resultat: succes` sans marqueur de verification dans `notes`.

    Exemptions : tout autre resultat, un run qui NOMME un lot du registre (`lot`
    identifiant, non booleen : verifie par `verifier_lot`, qui passe avant), et la
    qualification explicite `verification: "non-verifiee"` (le run reste `succes`
    mais se declare non verifie, donc mesurable). Le marqueur booleen `lot`
    (story 9.3) n'exempte PAS : `verifier_lot` ne le controle pas (revue a 3 voix
    du 2026-11-02 : `str(True)` valait 'True', et un append brut `lot: true`
    passait les deux gardes sans aucune preuve). Le `--solde` ne passe pas par
    ici. Le marqueur se cherche sur les seules `notes`, mises a plat (minuscules,
    sans accents).

    La negation lexicale (_NEGATEURS_*) est une FRICTION pour l'erreur honnete, PAS une
    protection contre la mauvaise foi : rien ne relie les notes a une execution reelle."""
    lot = run.get(CHAMP_LOT)
    if run.get("resultat") != "succes" or (
            not isinstance(lot, bool) and str(lot or "").strip()):
        return None
    if _a_plat(str(run.get(CHAMP_VERIFICATION) or "")[:64]).strip() == VERIFICATION_NON_VERIFIEE:
        return None
    brutes = str(run.get("notes") or "")
    if len(brutes) > MAX_LONGUEUR_NOTES:
        return (f"log_run REFUS : notes de {len(brutes)} caracteres (> {MAX_LONGUEUR_NOTES}) : "
                "trop longues pour chercher une preuve ; resumer la commande et son resultat.")
    notes = _a_plat(brutes)
    visuel = verifier_preuve_visuelle(brutes)
    if visuel != "":
        if visuel is None or refus_preuve_executable(notes) is None:
            return None
        return visuel
    if any(_marqueur_affirme(notes, m) for m in MARQUEURS_COMMANDE):
        return refus_preuve_executable(notes)
    return (
        "log_run REFUS : resultat 'succes' sans aucune preuve de verification dans "
        "'notes'.\n"
        "  Ajouter dans notes la commande rejouee et son resultat (ex. 'pytest 12 "
        "passed', 'py -m ... --check'), un sha de commit, ou 'rendu regarde'.\n"
        f"  Sinon qualifier : '{CHAMP_VERIFICATION}': '{VERIFICATION_NON_VERIFIEE}' "
        "(le run reste journalise, declare non verifie), ou un resultat "
        "'partiel' / 'en-attente-validation'.\n"
        f"  Un marqueur nie a proximite ({', '.join(sorted(_NEGATEURS_AVANT | _NEGATEURS_APRES))}) "
        "ne compte pas ; un mot d'echec apres lui non plus (" + ", ".join(sorted(_ECHECS_APRES)) + ").\n"
        "  Exemptes : un compte nul devant le mot d'echec (" + ", ".join(sorted(_ZEROS_AVANT_ECHEC))
        + ", ex. '0 failed'), 'N skipped', et '" + "|".join(sorted(_ABSENTS_APRES)) + " "
        + "|".join(sorted(_DE_APRES_ABSENT)) + "' (ex. 'absent de regression').\n"
        "  Cette garde est une FRICTION, pas une preuve : elle cherche un marqueur "
        "dans les notes et ne verifie pas que la commande a ete lancee. Un sha n'est "
        "PAS verifie dans le depot courant (un run du hub cite des commits d'AUTRES "
        "depots) : il peut etre invente."
    )


def verifier_revue_increment(run: dict) -> str | None:
    """REFUS franchissable par motif explicite (finding
    `VScode5:revue-obligatoire-sautee-sept-runs-sur-dix`, 2026-09-04) : un run
    orchestré journalisé `succes` doit porter une étape terminale revue-increment
    dans son plan, sa trace dans les notes (revue de campagne couvrant plusieurs
    runs), OU une dérogation motivée explicite (champ `derogation_revue`).

    Remplace l'ancien `avertir_revue_increment`, un simple print() NON bloquant
    (finding playbook:evolution-flotte, 2026-07-29) dont l'avertissement se
    déclenchait sur 51 des 74 runs éligibles (68 %, mesuré 2026-09-04) sans
    JAMAIS bloquer une seule fois en 43 jours de service — la mesure promise par
    son propre commentaire d'origine (« on mesure d'abord … avant tout garde-fou
    dur ») a été faite, et le résultat est qu'un avertissement ignorable 51 fois
    de suite n'est plus un garde-fou, c'est du bruit. Retourne le message de
    refus si aucune des trois échappatoires n'est présente, sinon None (le run
    s'écrit normalement)."""
    if run.get("resultat") != "succes" or run.get("qualification") != "orchestre":
        return None
    plan = run.get("plan") or []
    etapes = " ".join(str(e.get("etape", "")) + " " + str(e.get("agent", ""))
                      for e in plan if isinstance(e, dict)).lower()
    notes = str(run.get("notes", "")).lower()
    if "revue-increment" in etapes or "revue-increment" in notes:
        return None
    if str(run.get("derogation_revue") or "").strip():
        return None
    return (
        "log_run REFUS : run 'succes' orchestre sans etape terminale "
        "revue-increment (ni trace dans notes, ni derogation motivee) — la "
        "boucle de revue de fin d'increment est obligatoire depuis le "
        "2026-07-29. Rejouer avec soit une etape revue-increment au plan, soit "
        "une mention 'revue-increment' dans notes (revue de campagne couvrant "
        "plusieurs runs de la seance), soit le champ "
        "'derogation_revue': '<raison explicite>' si aucune des deux ne "
        "s'applique."
    )


def avertir_validation_utilisateur(run: dict) -> None:
    if run.get("resultat") != "succes":
        return
    texte = " ".join(str(run.get(k, "")) for k in ("demande", "notes")).lower()
    if any(m in texte for m in LIVRABLE_UTILISATEUR) and not any(
        v in texte for v in VALIDATION_UTILISATEUR
    ):
        print(
            "log_run AVERTISSEMENT : livrable utilisateur detecte sans mention de "
            "validation — « en-attente-validation » est le statut attendu tant que "
            "l'utilisateur n'a pas valide l'artefact exact (sinon, noter « valide "
            "par l'utilisateur » dans notes)."
        )


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
