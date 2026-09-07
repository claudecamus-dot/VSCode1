r"""PreToolUse hook (Bash/PowerShell) — deterministic backstop blocking
`git push --force` (without `--force-with-lease`), `git reset --hard`, and the
commands that destroy a file's uncommitted work in the tree (`git checkout --
<path>`, `git restore <path>`, `git clean -f`, `git stash drop/clear`).

Complements the git safety protocol already stated in prompt instructions
with something that can't be talked past by a persuasive-sounding reason in
context. Fails open (any parsing/edge-case error -> allow) so a bug here
never blocks unrelated shell usage.

Parsing (2026-07-16, merged from a sibling project's independent
implementation — its `shlex`-based tokenizer correctly handled leading
`VAR=value` env-var assignments and quote-safe tokenization, catching
`FOO=1 git push --force` where this hook's earlier regex-anchored version
(`^git\s+push\b`) silently let it through since the segment didn't start
with the literal string "git push"):
1. strip heredoc bodies first (always data, never a command to execute —
   e.g. a commit message *describing* this hook via
   `git commit -F - <<'EOF' ... EOF`, this project's own documented
   convention);
2. split on shell operators (&&, ||, ;, |, newline) without breaking segments
   apart inside quotes;
3. `shlex.split()` each segment and skip any leading `VAR=value` tokens
   before checking whether the first real token is `git`.
"""
import json
import os
import re
import shlex
import sys

_HEREDOC_START = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")


def _strip_heredocs(cmd: str) -> str:
    out = []
    i = 0
    for m in _HEREDOC_START.finditer(cmd):
        if m.start() < i:
            continue  # inside a heredoc body we already stripped
        out.append(cmd[i:m.end()])
        delim = m.group(2)
        nl = cmd.find("\n", m.end())
        if nl == -1:
            i = len(cmd)
            break
        body_start = nl + 1
        end_pat = re.compile(r"^[ \t]*" + re.escape(delim) + r"[ \t]*$", re.MULTILINE)
        end_m = end_pat.search(cmd, body_start)
        i = end_m.end() if end_m else len(cmd)
    out.append(cmd[i:])
    return "".join(out)


def _segments(cmd: str):
    """Les parentheses sont neutralisees ICI, en amont du decoupage : sans cela
    `(git push --force)` et `echo $(git push --force)` collaient le `(` au token de
    tete, qui n'etait donc plus `git` (verifie en rejouant le hook, 2026-08-31).
    Entre quotes elles restent intactes : `git commit -m "fix (bug)"` n'est pas coupe.

    Split on &&, ||, ;, |, (, ), newline — but not when inside '...' or "...". """
    segs = []
    buf = []
    quote = None
    i = 0
    n = len(cmd)
    while i < n:
        c = cmd[i]
        if quote:
            buf.append(c)
            if c == quote:
                quote = None
            i += 1
            continue
        if c in ("'", '"'):
            quote = c
            buf.append(c)
            i += 1
            continue
        if cmd[i : i + 2] in ("&&", "||"):
            segs.append("".join(buf))
            buf = []
            i += 2
            continue
        if c in (";", "|", "(", ")", "\n"):
            segs.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    segs.append("".join(buf))
    return [s.strip() for s in segs]


# Wrappers qui EXECUTENT leur argument : sans les reconnaitre,
# `eval "git push --force"` et `bash -c "git push --force"` passaient, le token de
# tete n'etant pas le mot `git`.
_WRAPPERS = frozenset({
    "eval", "exec", "command", "builtin", "env", "sudo", "doas", "nohup", "nice",
    "time", "xargs", "sh", "bash", "zsh", "dash", "ksh", "busybox",
    # `&` est l OPERATEUR D APPEL de PowerShell — le shell PRIMAIRE de cet
    # environnement, et ce hook est monte sur le matcher `Bash|PowerShell`. Il execute
    # ce qui le suit exactement comme `eval` : `& git push --force` passait, alors que
    # `git push --force` etait bloque. Verifie que l operateur lance bien git avant de
    # le traiter comme un wrapper (revue de securite du 2026-09-01).
    "&", ".",
})


def _nom_binaire(tok: str) -> str:
    """Nom du binaire invoque : `git`, `git.exe`, `/usr/bin/git` ou un chemin Windows
    absolu -> `git`. Le test litteral `lower[start] != "git"` exigeait le mot nu et
    laissait donc passer toute autre forme d'invocation (verifie en rejouant le hook
    avec un payload PreToolUse reel, 2026-08-31). `os.path.basename` decoupe sur `/`
    comme sur le separateur Windows."""
    nom = os.path.basename(tok).lower()
    if nom.endswith(".exe"):
        nom = nom[:-4]
    return nom


def _analyser(cmd: str, profondeur: int = 0):
    for seg in _segments(cmd):
        raison = _blocked_reason(seg, profondeur)
        if raison:
            return raison
    return None


def _blocked_reason(segment: str, profondeur: int = 0):
    # shlex respects quoting, so a quoted string like -m "... git push
    # --force ..." collapses into a single token instead of being split
    # into separate "git"/"push"/"--force" words.
    try:
        tokens = shlex.split(segment, posix=True)
    except ValueError:
        return None  # unbalanced quotes etc. — fail open, don't guess
    if not tokens:
        return None

    lower = [t.lower() for t in tokens]

    # Skip leading VAR=value env-var assignments so `FOO=1 git push --force`
    # is still recognized as a `git` invocation, not dismissed because the
    # segment doesn't start with the literal string "git".
    start = 0
    while start < len(tokens) and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[start]):
        start += 1

    if start >= len(tokens):
        return None
    tete = _nom_binaire(tokens[start])

    # `eval "git push --force"` : la vraie commande est dans les arguments du wrapper.
    # Profondeur bornee (fail-open assume : on ne devine pas au-dela).
    if tete in _WRAPPERS:
        if profondeur >= 3:
            return None
        restants = tokens[start + 1 :]
        for candidat in [*restants, " ".join(restants)]:
            raison = _analyser(candidat, profondeur + 1)
            if raison:
                return raison
        return None

    if tete != "git":
        return None
    rest = lower[start + 1 :]

    if "push" in rest:
        has_force = any(t in ("--force", "-f") or t.startswith("--force=") for t in rest)
        has_lease = any(
            t == "--force-with-lease" or t.startswith("--force-with-lease=") for t in rest
        )
        # La forme LA PLUS COURANTE du push force ne contient pas le mot `--force` :
        # `git push origin +main` force la mise a jour. Reproduit sur un remote
        # jetable : `git push origin master` refuse (non fast-forward), `+master`
        # accepte avec « (forced update) ».
        has_plus = any(t.startswith("+") and len(t) > 1 for t in rest)
        if has_plus and not has_lease:
            return (
                "git push avec une refspec forcee (« + » devant la ref) est bloque par "
                "un hook projet : c'est un push force qui ne dit pas son nom. Utilisez "
                "--force-with-lease si necessaire, ou confirmez explicitement avec "
                "l'utilisateur."
            )
        if has_force and not has_lease:
            return (
                "git push --force (sans --force-with-lease) est bloqué par un hook projet. "
                "Utilisez --force-with-lease si nécessaire, ou confirmez explicitement avec "
                "l'utilisateur avant de contourner ce garde-fou."
            )

    # git accepte tout PREFIXE NON AMBIGU d une option longue : `--har`, `--ha` et
    # meme `--h` font un reset dur complet — verifie par execution, le travail non
    # commite est bien detruit. Le test litteral `"--hard" in rest` les laissait tous
    # passer. On borne a 3 caracteres (`--h`), la plus courte forme que git accepte
    # ici, et on exige que ce soit un prefixe de `--hard` : `--hi` n est pas bloque,
    # un garde-fou qui crie a tort finit desarme.
    def _vaut_hard(t: str) -> bool:
        return t.startswith("--h") and "--hard".startswith(t)

    if "reset" in rest and any(_vaut_hard(t) for t in rest):
        return (
            "git reset --hard est bloqué par un hook projet (perte de modifications non "
            "commitées). Utilisez git stash, ou confirmez explicitement avec l'utilisateur."
        )

    raison = _blocked_worktree(tokens[start + 1 :], rest)
    if raison:
        return raison

    return None


# --------------------------------------------------------------------------- #
# Commandes qui DÉTRUISENT le travail non commité d'un fichier
# --------------------------------------------------------------------------- #
# Ajouté le 2026-09-02 (VSCode2), backporté ici le 2026-09-07 sur un incident réel :
# un sous-agent de revue, dont le mandat dit pourtant qu'il « ne corrige rien », a joué
# `git checkout --` sur deux templates pour mesurer le code d'avant. Les correctifs non
# commités de la session appelante ont disparu du disque. Ils ont pu être reconstruits
# depuis des copies hors dépôt, mais rien dans le dispositif ne s'y opposait : le
# garde-fou ne connaissait que `push --force` et `reset --hard`, deux commandes qui
# touchent l'HISTORIQUE, alors que le travail perdu ce jour-là était dans l'ARBRE. C'est
# la classe entière qu'il fallait couvrir, pas le cas vu.
#
# Le remède n'est pas d'interdire de mesurer le code d'avant : c'est un besoin légitime
# d'une revue. Le message dit donc comment le faire sans rien détruire
# (`git show HEAD:<fichier>`, qui écrit sur la sortie standard).

_CREATION_DE_BRANCHE = frozenset({"-b", "-B", "--orphan", "--track", "--no-track", "--detach"})

_ALTERNATIVE = (
    "Pour lire le code d'avant sans toucher au disque : `git show HEAD:<fichier>` "
    "(ou `git diff` pour l'écart). Si l'écrasement est réellement voulu, copiez "
    "d'abord le fichier hors du dépôt et confirmez avec l'utilisateur."
)


def _est_un_chemin_du_depot(tok: str) -> bool:
    """Vrai si `tok` désigne un fichier ou un dossier réellement présent.

    C'est ce qui sépare `git checkout main` (une branche : rien à écraser) de
    `git checkout app/templates/x.html` (un fichier : ses modifications non
    commitées disparaissent). Deviner sur la forme du nom ne marcherait pas —
    une branche s'appelle souvent `feature/x`, avec une barre oblique comme un
    chemin. On regarde donc le disque, et on échoue en laissant passer."""
    if tok in (".", "./", ":/"):
        return True
    try:
        racine = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
        return os.path.exists(os.path.join(racine, tok)) or os.path.exists(tok)
    except Exception:
        return False


def _flags_courts_groupes(rest: list) -> str:
    """Les lettres de tous les groupes de drapeaux courts (`-fdx` -> 'fdx').
    Sans ce dépliage, chercher `-f` laissait passer `git clean -fd`, qui est
    exactement la forme qu'on écrit en pratique."""
    lettres = []
    for t in rest:
        if t.startswith("-") and not t.startswith("--") and len(t) > 1:
            lettres.append(t[1:])
    return "".join(lettres)


# Options GLOBALES de `git` (avant la sous-commande) qui prennent leur valeur
# dans un TOKEN SEPARE : `git -C . checkout ...`, `git -c core.pager=cat push
# ...`. Sans les reconnaitre, chercher « le premier token qui ne commence pas
# par - » prenait la VALEUR pour la sous-commande, ce qui desarmait tout le
# volet arbre -- reproduit par revue adversariale le 2026-09-07 :
# `git -C . checkout -- f.txt` passait, alors que `-C` est precisement la
# forme employee pour agir sur un depot tiers, le metier de ce hub (R2/R3).
# Deja en minuscules ici : `rest` est lowercased avant d'atteindre cette
# fonction, donc `-C` (chemin) et `-c` (config) y sont indiscernables --
# les deux prennent un token separe, le traitement est donc identique.
_GLOBALES_AVEC_VALEUR = frozenset({
    "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
    "--super-prefix", "--config-env",
})


def _sous_commande_index(rest: list):
    """Index de la vraie sous-commande dans `rest` (tokens apres `git`, deja
    en minuscules), en sautant les options globales et leur valeur quand
    elle est un token separe. None si aucune sous-commande trouvee."""
    i = 0
    n = len(rest)
    while i < n:
        t = rest[i]
        if not t.startswith("-"):
            return i
        if "=" not in t and t in _GLOBALES_AVEC_VALEUR and i + 1 < n:
            i += 2  # saute le drapeau ET sa valeur (token separe)
            continue
        i += 1
    return None


def _blocked_worktree(tokens_apres_git: list, rest: list):
    idx = _sous_commande_index(rest)
    if idx is None:
        return None
    sous_commande = rest[idx]
    args = tokens_apres_git[idx + 1 :]  # tokens ORIGINAUX (casse preservee), apres la sous-commande
    bas = rest[idx + 1 :]               # memes tokens, en minuscules

    if sous_commande == "checkout":
        # `-f`/`--force` ecrase TOUT l'arbre suivi, la forme la plus
        # destructive de la commande -- ne depend d'aucun chemin cite.
        # Reproduit (revue 2026-09-07) : `git checkout -f master` passait.
        if any(t in ("-f", "--force") for t in bas):
            return (
                "git checkout -f/--force est bloqué par un hook projet : il ÉCRASE les "
                "modifications non commitées de TOUS les fichiers suivis, pas seulement "
                "d'un chemin. " + _ALTERNATIVE
            )
        # `git checkout … -- <chemin>` : tout ce qui suit `--` est un chemin, la
        # forme la plus explicite et la plus destructive.
        if "--" in bas:
            i = bas.index("--")
            if args[i + 1 :]:
                return (
                    "git checkout -- <chemin> est bloqué par un hook projet : il ÉCRASE "
                    "les modifications non commitées du fichier, sans copie de secours. "
                    + _ALTERNATIVE
                )
        if any(t in _CREATION_DE_BRANCHE for t in bas):
            return None  # création/bascule de branche : rien de l'arbre n'est perdu
        for t in args:
            if not t.startswith("-") and _est_un_chemin_du_depot(t):
                return (
                    "git checkout <chemin> est bloqué par un hook projet : `%s` existe "
                    "sur le disque, ses modifications non commitées seraient écrasées. "
                    "Pour changer de branche, le nom ne doit pas être celui d'un fichier "
                    "existant. " % t + _ALTERNATIVE
                )
        return None

    if sous_commande == "switch":
        # Forme moderne de `checkout <branche>` : `--discard-changes` (et
        # `-f`/`--force`, alias) ecrase l'arbre exactement comme
        # `checkout -f`. Reproduit (revue 2026-09-07) : passait sans ce bloc.
        if any(t in ("--discard-changes", "-f", "--force") for t in bas):
            return (
                "git switch --discard-changes est bloqué par un hook projet : il ÉCRASE "
                "les modifications non commitées, comme git checkout -f. " + _ALTERNATIVE
            )
        return None

    if sous_commande == "restore":
        # `-h`/`--help` n'ecrase rien : uniquement de la lecture.
        if "-h" in bas or "--help" in bas:
            return None
        # `git restore --staged <chemin>` ne touche QUE l'index : il désindexe,
        # il ne détruit rien. Il reste donc autorisé — sauf s'il est cumulé avec
        # `--worktree`, qui lui écrase bien le fichier. `-S`/`-W` sont les
        # formes courtes de git, EN MAJUSCULES (`-s` minuscule est un drapeau
        # different, --source) : les comparer a `bas` (deja en minuscules)
        # les rendait invisibles par construction -- reproduit (revue
        # 2026-09-07) : `git restore -S f.txt` bloquait a tort, `git restore
        # --staged -W f.txt` passait a tort. Compares ici aux tokens
        # ORIGINAUX (`args`), casse preservee.
        a_staged = "--staged" in bas or "-S" in args
        a_worktree = "--worktree" in bas or "-W" in args
        if a_staged and not a_worktree:
            return None
        return (
            "git restore <chemin> est bloqué par un hook projet : il ÉCRASE les "
            "modifications non commitées du fichier. `git restore --staged` (qui ne "
            "touche que l'index) reste autorisé. " + _ALTERNATIVE
        )

    if sous_commande == "clean":
        # `-n`/`--dry-run` ne supprime rien -- y compris cumule avec `-f`
        # dans un SEUL token groupe (`git clean -nfd`, precisement la forme
        # que le message de refus recommande pour lister avant de
        # confirmer) : verifie via _flags_courts_groupes, pas une egalite
        # de token entiere -- `"-n" in bas` ne matchait jamais "-nfd".
        # Reproduit (revue 2026-09-07) : `git clean -nfd` bloquait a tort.
        if "--dry-run" in bas or "n" in _flags_courts_groupes(args):
            return None
        if "--force" in bas or "f" in _flags_courts_groupes(args):
            return (
                "git clean -f est bloqué par un hook projet : il SUPPRIME les fichiers "
                "non suivis, donc tout fichier neuf pas encore ajouté (un test qu'on "
                "vient d'écrire, par exemple). Listez-les d'abord avec `git clean -n`, "
                "puis confirmez avec l'utilisateur."
            )
        return None

    if sous_commande == "stash":
        # Seul le PREMIER token qui n'est pas un drapeau, juste apres
        # `stash`, est la vraie sous-sous-commande -- chercher "drop"/
        # "clear" n'importe ou dans `bas` bloquait a tort un message qui
        # contient ce mot (`git stash push -m "clear le cache"`, un seul
        # token vu shlex). Reproduit (revue 2026-09-07, M2).
        stash_sous_commande = next((t for t in bas if not t.startswith("-")), None)
        if stash_sous_commande in ("drop", "clear"):
            return (
                "git stash drop/clear est bloqué par un hook projet : la remise ainsi "
                "supprimée n'est plus récupérable par aucune commande ordinaire. "
                "Confirmez avec l'utilisateur."
            )
        return None

    if sous_commande == "rm":
        # `git rm -f <chemin>` supprime le fichier du disque ET de l'index,
        # y compris ses modifications non commitees, sans copie de secours
        # -- meme classe que `clean -f`, jamais couverte (revue 2026-09-07,
        # M3). Sans -f, git refuse deja de lui-meme un fichier modifie.
        if "--force" in bas or "f" in _flags_courts_groupes(args):
            return (
                "git rm -f est bloqué par un hook projet : il SUPPRIME le fichier du "
                "disque ET de l'index, y compris ses modifications non commitées. "
                "Confirmez avec l'utilisateur, ou `git rm --cached` pour ne toucher que "
                "l'index."
            )
        return None

    if sous_commande == "worktree":
        # `git worktree remove --force` supprime un arbre de travail entier
        # -- pas un fichier, un arbre -- y compris tout travail non commite
        # qu'il contient. Classe differente, jamais couverte (revue
        # 2026-09-07, M3).
        sous_sous = next((t for t in bas if not t.startswith("-")), None)
        if sous_sous == "remove" and ("--force" in bas or "f" in _flags_courts_groupes(args)):
            return (
                "git worktree remove --force est bloqué par un hook projet : il SUPPRIME "
                "tout un arbre de travail, y compris son travail non commité. Confirmez "
                "avec l'utilisateur."
            )
        return None

    return None


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    cmd = _strip_heredocs(cmd)

    blocked = _analyser(cmd)

    if blocked:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": blocked,
            }
        }))


if __name__ == "__main__":
    main()
