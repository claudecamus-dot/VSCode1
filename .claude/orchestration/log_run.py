"""Journal des orchestrations (étage O-A) — append d'un run dans runs.jsonl.

Usage : py .claude/orchestration/log_run.py '<json>'   (ou JSON sur stdin)
Champs requis : demande (str), qualification (orchestre|direct-signale).
Champs usuels : plan (liste d'étapes {etape, agent, mode, modele}), resultat
(succes|en-attente-validation|partiel|echec), reprises (int), notes (str), playbook
(str|null : nom du playbook instancié, incrément O-B — null en composition libre).
`ts` est ajouté si absent. Consommé à terme par le superviseur étage 2 (métrique
« plan vs réel »).

Garde-fou exécutable (constat superviseur VSCode2 2026-07-23, repris ici — le statut
« en-attente-validation » introduit le 2026-07-22 n'était utilisé nulle part) : un run
« succes » dont la demande/les notes évoquent un livrable consommé par l'utilisateur
(deck, slide, écran, export) sans mention d'une validation utilisateur déclenche un
avertissement NON bloquant rappelant le statut attendu.
"""
import datetime
import json
import os
import re
import sys

RUNS_PATH = os.environ.get("AGENT_ORCHESTRATION_RUNS") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "runs.jsonl"
)
QUALIFICATIONS = ("orchestre", "direct-signale")
LIVRABLE_RE = re.compile(r"deck|slide|écran|ecran|export|pptx", re.IGNORECASE)
VALIDATION_RE = re.compile(r"valid\w*\s+par\s+l.utilisateur|utilisateur\s+a\s+valid", re.IGNORECASE)


def avertir_si_validation_manquante(run) -> None:
    """Avertissement non bloquant : livrable utilisateur loggé « succes » sans validation."""
    if run.get("resultat") != "succes":
        return
    texte = " ".join(str(run.get(k) or "") for k in ("demande", "notes"))
    if LIVRABLE_RE.search(texte) and not VALIDATION_RE.search(texte):
        print(
            "log_run : AVERTISSEMENT — livrable utilisateur détecté (deck/slide/écran/export) "
            "loggé « succes » sans mention d'une validation utilisateur. Statut attendu : "
            "« en-attente-validation » tant que l'utilisateur n'a pas validé l'artefact exact "
            "(évol 2026-07-22). Le run est journalisé tel quel."
        )


def main(argv) -> int:
    raw = argv[0] if argv else sys.stdin.read()
    try:
        run = json.loads(raw)
    except ValueError as exc:
        print(f"log_run : JSON invalide ({exc})")
        return 1
    if not isinstance(run, dict):
        print("log_run : un objet JSON est attendu")
        return 1
    missing = [k for k in ("demande", "qualification") if not run.get(k)]
    if missing:
        print(f"log_run : champ(s) requis manquant(s) : {', '.join(missing)}")
        return 1
    if run["qualification"] not in QUALIFICATIONS:
        print(f"log_run : qualification invalide (attendu : {' | '.join(QUALIFICATIONS)})")
        return 1
    avertir_si_validation_manquante(run)
    run.setdefault("ts", datetime.datetime.now().astimezone().isoformat(timespec="seconds"))
    with open(RUNS_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(run, ensure_ascii=False) + "\n")
    print(f"log_run : run journalise ({run['qualification']}, {len(run.get('plan', []))} etape(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
