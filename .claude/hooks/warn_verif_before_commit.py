r"""PreToolUse hook (Bash/PowerShell) — soft, NON-blocking reminder that warns
when application code (`app/**`) is about to be committed without a real
verification having run in the current session.

Provenance : proposition du constat #1 du superviseur d'agents (étage 2),
arbitrée puis appliquée le 2026-07-21. Le diagnostic (voir
`docs/wiki/technical/agents-supervision.md`) montrait que la vérif réelle de
fin d'incrément (`npm test` + rendu réel via `/revue-increment` / `pptx-verify`)
était systématiquement sautée : `revue-increment` n=0 sur 14 sessions,
`pptx-verify` figé à 1 usage, alors que du code continuait d'être commité. Le
rappel SessionStart passif (`remind_revue_increment.py`) ne suffit pas — rien
n'oblige à le suivre. Ce hook déplace le rappel AU BON INSTANT : le commit.

Conception (delta assumé vs. la proposition brute) :
- **Non bloquant** : émet un `systemMessage` (visible utilisateur) + un
  `additionalContext` (visible modèle si supporté), SANS `permissionDecision`.
  Le commit passe — on avertit, on ne bloque pas (cf. guard_destructive_git.py,
  lui, bloque : ce sont deux niveaux de sévérité volontairement distincts).
- **Ciblé `app/**` uniquement**, PAS `docs/wiki/**` : le wiki est régénéré
  automatiquement par le scan (dashboard, index) — l'y inclure noierait le
  signal sous des commits de doc auto-générée. La vérif « réelle » (tests +
  rendu) concerne le code applicatif.
- **Détection de trace de vérif = vraie exécution d'outil**, pas une simple
  mention : on parse le transcript de la session (tool_use Bash `npm test`… /
  Skill `pptx-verify`/`revue-increment`), même structure que
  scan_transcripts.py — sinon toute session qui *parle* de vérif se
  faux-négativerait.
- **Fail-open partout** : toute erreur (parsing, git indisponible, transcript
  illisible, import) rend la main SANS avertir. Un bug ici ne doit jamais
  ajouter de friction ni bloquer un commit.

Le tokenizer shell robuste (heredocs, segments quote-safe) est réutilisé de
`guard_destructive_git.py` (même répertoire) pour ne pas diverger d'un second
parseur du même problème ; si l'import échoue, dégradation en silence.

Second signal — trace de definition-of-done (constats #1 et #2 du superviseur du
2026-07-28, arbitrés le jour même). Le diagnostic montrait deux trous jumeaux :
`runs.jsonl` s'était arrêté au 2026-07-23 alors que ~10 commits étaient livrés
(orchestrations non journalisées), et `revue-increment` n'avait plus tourné
depuis le 2026-07-21 malgré 4 commits de code produit. Le contrat arbitré le
2026-07-23 (« soit `revue-increment` tourne, soit la DoD allégée est écrite dans
les `notes` du run ») s'appuyait sur un artefact OPTIONNEL — sans run journalisé,
aucune de ses deux branches n'était vérifiable. La trace est donc déplacée sur
l'artefact obligatoire : le **commit**. Sur un commit `app/**`, le hook se tait
si l'une de ces trois traces existe — `revue-increment` réellement lancée, run
journalisé via `log_run.py` dans la session, ou DoD explicitement assumée dans le
message de commit (« DoD allégée : … »). Ce dernier cas rend la trace versionnée
et re-vérifiable par le superviseur via `git log`, sans dépendre de `runs.jsonl`.
Les deux avertissements sont indépendants et peuvent tomber ensemble : des tests
verts (1er signal) ne valent PAS une definition-of-done (2nd signal).
"""
import json
import os
import re
import shlex
import subprocess
import sys

try:  # réutilise le tokenizer éprouvé du guard voisin ; sinon, dégrade en silence
    from guard_destructive_git import _strip_heredocs, _segments
except Exception:  # pragma: no cover - fail-open
    _strip_heredocs = None
    _segments = None

# Zone sous vérification : le code applicatif (tests + rendu réel). Volontairement
# PAS docs/wiki/ (généré par le scan) pour garder le signal haut.
_WATCHED_PREFIXES = ("app/",)

# Signaux d'une vraie exécution de vérif dans la session (commandes Bash / skills).
_VERIF_BASH = ("npm test", "npm run test", "node --test", "scripts/test-", "npm run lint")
_VERIF_SKILL = ("pptx-verify", "revue-increment")

# Signaux de definition-of-done : la boucle DoD complète (skill), ou le run
# d'orchestration journalisé (où la DoD assumée se trace dans `notes`).
_DOD_SKILL = ("revue-increment",)
_JOURNAL_BASH = ("log_run.py",)
# Échappatoire versionnée : DoD assumée explicitement dans le message de commit.
# Volontairement PAS « revue-increment » : sur ce dépôt, des commits parlent du skill
# lui-même (« Versionne le skill revue-increment ») — le citer suffirait à faire taire
# le garde-fou sans que la boucle ait tourné. Seul le mot DoD marque l'intention.
_DOD_MESSAGE_MARKERS = ("definition-of-done", "definition of done")
_DOD_MESSAGE_RE = re.compile(r"\bdod\b", re.IGNORECASE)

_GIT_OPTS_WITH_VALUE = ("-C", "-c", "--git-dir", "--work-tree", "--namespace")


def _git_commit_flags(segment):
    """-> liste des tokens d'un `git commit` réel, ou None si le segment n'en est pas un."""
    try:
        tokens = shlex.split(segment, posix=True)
    except ValueError:
        return None  # quotes déséquilibrées, substitution… — on ne devine pas
    if not tokens:
        return None
    start = 0
    while start < len(tokens) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[start]):
        start += 1  # saute les affectations VAR=value en tête
    if start >= len(tokens) or tokens[start].lower() != "git":
        return None
    rest = tokens[start + 1:]
    # Sous-commande = premier token non-option (en sautant -C/-c <val> globaux).
    i = 0
    sub = None
    while i < len(rest):
        t = rest[i]
        if t.startswith("-"):
            i += 2 if t in _GIT_OPTS_WITH_VALUE else 1
            continue
        sub = t
        break
    if sub != "commit":
        return None
    if "--dry-run" in rest:
        return None  # ne crée pas de commit
    return rest


def _commit_message(commit_flags):
    """-> message du commit reconstitué depuis les -m/--message (chaîne vide si aucun)."""
    parts = []
    i = 0
    while i < len(commit_flags):
        t = commit_flags[i]
        if t in ("-m", "--message"):
            if i + 1 < len(commit_flags):
                parts.append(commit_flags[i + 1])
                i += 2
                continue
        elif t.startswith("--message="):
            parts.append(t.split("=", 1)[1])
        elif t.startswith("-") and not t.startswith("--") and "m" in t:
            # options courtes groupées : -mwip, -am wip, -amwip
            after = t[t.index("m") + 1:]
            if after:
                parts.append(after)
            elif i + 1 < len(commit_flags):
                parts.append(commit_flags[i + 1])
                i += 2
                continue
        i += 1
    return "\n".join(parts)


def _dod_assumee(message):
    """True si le message de commit assume explicitement la definition-of-done."""
    low = (message or "").lower()
    return bool(_DOD_MESSAGE_RE.search(low) or any(m in low for m in _DOD_MESSAGE_MARKERS))


def _staged_watched(cwd, commit_flags):
    """Fichiers surveillés (app/**) qui seront réellement commités, ou None si indéterminable."""
    def _run(args):
        try:
            r = subprocess.run(
                ["git"] + args, cwd=cwd or None,
                capture_output=True, text=True, timeout=8,
            )
        except Exception:
            return None
        if r.returncode != 0:
            return None
        return [ln.strip().replace("\\", "/") for ln in r.stdout.splitlines() if ln.strip()]

    files = _run(["diff", "--cached", "--name-only"])
    if files is None:
        return None
    # `git commit -a/--all` valide aussi les modifs de fichiers suivis non stagés :
    # les ajouter, sinon on manquerait le périmètre réel du commit.
    if any(f in ("-a", "--all") for f in commit_flags):
        unstaged = _run(["diff", "--name-only"])
        if unstaged:
            files = list(dict.fromkeys(files + unstaged))
    return [f for f in files if f.startswith(_WATCHED_PREFIXES)]


def _iter_tool_uses(obj):
    msg = obj.get("message")
    if not isinstance(msg, dict):
        return
    content = msg.get("content")
    if not isinstance(content, list):
        return
    for blk in content:
        if isinstance(blk, dict) and blk.get("type") == "tool_use":
            yield blk


def _session_signals(transcript_path):
    """-> {"verif": bool, "dod": bool, "journal": bool} d'après les VRAIES exécutions
    d'outils du transcript de session (une seule lecture pour les deux garde-fous)."""
    sig = {"verif": False, "dod": False, "journal": False}
    if not transcript_path or not os.path.isfile(transcript_path):
        return sig
    try:
        with open(transcript_path, encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if '"tool_use"' not in line:
                    continue  # préfiltre octet bon marché (cf. scan_transcripts.py)
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                for blk in _iter_tool_uses(obj):
                    name = blk.get("name")
                    inp = blk.get("input") or {}
                    if name == "Bash":
                        cmd = (inp.get("command") or "").lower()
                        if any(k in cmd for k in _VERIF_BASH):
                            sig["verif"] = True
                        if any(k in cmd for k in _JOURNAL_BASH):
                            sig["journal"] = True
                    elif name == "Skill":
                        skill = (inp.get("skill") or "").lower()
                        if skill in _VERIF_SKILL:
                            sig["verif"] = True
                        if skill in _DOD_SKILL:
                            sig["dod"] = True
                if all(sig.values()):
                    return sig
    except Exception:
        return {"verif": False, "dod": False, "journal": False}
    return sig


def _verif_ran(transcript_path):
    """True si une vraie exécution de vérif est présente dans le transcript de session."""
    return _session_signals(transcript_path)["verif"]


_WARNING = (
    "⚠️ Vérif de fin d'incrément non détectée dans cette session : des fichiers "
    "app/ sont sur le point d'être commités sans trace de `npm test` ni de rendu "
    "réel (`/revue-increment` ou `pptx-verify`). Lancer la vérif RÉELLE avant de "
    "committer le code applicatif, ou confirmer que c'est volontaire. "
    "(Garde-fou projet non bloquant — constat superviseur #1.)"
)

_WARNING_DOD = (
    "⚠️ Trace de definition-of-done absente : ce commit touche app/ sans que "
    "`/revue-increment` ait tourné, sans run journalisé (`log_run.py`) et sans DoD "
    "assumée dans le message. Des tests verts ne valent PAS une definition-of-done. "
    "Trois sorties : lancer /revue-increment, journaliser le run d'orchestration, ou "
    "assumer explicitement la DoD allégée dans le message de commit (ex. « DoD allégée : "
    "tests verts, pas de rendu réel »). "
    "(Garde-fou projet non bloquant — constats superviseur #1 et #2 du 2026-07-28.)"
)


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    strip = _strip_heredocs or (lambda s: s)
    segs = _segments(cmd) if _segments else [cmd]
    try:
        cmd = strip(cmd)
        segs = _segments(cmd) if _segments else [cmd]
    except Exception:
        return  # fail-open

    commit_flags = None
    for seg in segs:
        commit_flags = _git_commit_flags(seg)
        if commit_flags is not None:
            break
    if commit_flags is None:
        return  # pas un git commit

    watched = _staged_watched(data.get("cwd"), commit_flags)
    if not watched:
        return  # rien sous app/ dans ce commit (ou git indéterminable) — silence

    sig = _session_signals(data.get("transcript_path"))
    avertissements = []
    if not sig["verif"]:
        avertissements.append(_WARNING)  # aucune vérif réelle cette session
    if not (sig["dod"] or sig["journal"] or _dod_assumee(_commit_message(commit_flags))):
        avertissements.append(_WARNING_DOD)  # DoD ni faite, ni journalisée, ni assumée
    if not avertissements:
        return

    message = "\n\n".join(avertissements)
    print(json.dumps({
        "systemMessage": message,
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": message,
        },
    }))


if __name__ == "__main__":
    main()
