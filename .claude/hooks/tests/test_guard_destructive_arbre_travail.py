"""Le volet ARBRE du garde-fou git, backporté de VSCode2 le 2026-09-07.

`guard_destructive_git.py` ne connaissait que deux commandes qui touchent
l'HISTORIQUE (`push --force`, `reset --hard`). Un incident réel du 2026-09-02 (VSCode2) a
montré la classe manquante : les commandes qui écrasent le travail non commité d'un
fichier dans l'ARBRE (`git checkout -- <chemin>`, `git restore <chemin>`, `git clean -f`,
`git stash drop/clear`). VSCode2 avait écrit le correctif sans test — ce fichier ferme ce
trou ici aussi.

Chaque cas est vérifié par le CHEMIN RÉEL (stdin JSON, stdout JSON), plus un contrôle par
EFFET RÉEL sur un dépôt jetable pour `checkout --` : sans ça on bloquerait une syntaxe sur
la foi d'un raisonnement, pas d'une preuve.
"""

import json
import os
import subprocess
import sys

HOOK = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "guard_destructive_git.py")


def _bloque(commande, cwd=None):
    env = dict(os.environ)
    if cwd is not None:
        env["CLAUDE_PROJECT_DIR"] = str(cwd)
    r = subprocess.run(
        [sys.executable, HOOK],
        input=json.dumps({"tool_input": {"command": commande}}),
        capture_output=True, text=True, encoding="utf-8",
        cwd=str(cwd) if cwd is not None else None, env=env)
    # Sans ce controle, un hook casse a l'import (returncode != 0) rendait
    # "deny" absent de stdout comme un hook sain qui laisse passer -- les
    # assertions `not _bloque(...)` passaient TOUTES au vert sur un
    # garde-fou entierement mort (revue adversariale du 2026-09-07).
    assert r.returncode == 0 and not r.stderr, (
        f"le hook a plante au lieu de repondre : code={r.returncode} stderr={r.stderr!r}")
    return "deny" in r.stdout


class TestCheckoutDeChemin:
    def test_checkout_double_tiret_chemin_bloque(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert _bloque("git checkout -- f.txt", cwd=tmp_path)

    def test_checkout_chemin_existant_sans_double_tiret_bloque(self, tmp_path):
        (tmp_path / "app").mkdir()
        (tmp_path / "app" / "x.html").write_text("v1\n", encoding="utf-8")
        assert _bloque("git checkout app/x.html", cwd=tmp_path)

    def test_checkout_branche_reste_autorise(self, tmp_path):
        assert not _bloque("git checkout main", cwd=tmp_path)
        assert not _bloque("git checkout -b feature/x", cwd=tmp_path)

    def test_checkout_effet_reel_ecrase_le_travail_non_commite(self, tmp_path):
        depot = tmp_path / "d"
        depot.mkdir()

        def git(*a):
            return subprocess.run(["git", *a], cwd=str(depot), capture_output=True,
                                   text=True, encoding="utf-8")
        git("init", "-q")
        git("config", "user.email", "t@t")
        git("config", "user.name", "t")
        (depot / "f.txt").write_text("v1\n", encoding="utf-8")
        git("add", "-A")
        git("commit", "-qm", "c1")
        (depot / "f.txt").write_text("TRAVAIL-NON-COMMITE\n", encoding="utf-8")
        r = git("checkout", "--", "f.txt")
        assert r.returncode == 0, f"git a refuse le checkout : {r.stderr}"
        assert (depot / "f.txt").read_text(encoding="utf-8") == "v1\n", (
            "le checkout ne détruit rien — le garde-fou n'aurait pas à le bloquer")


class TestRestoreDeChemin:
    def test_restore_chemin_bloque(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert _bloque("git restore f.txt", cwd=tmp_path)

    def test_restore_staged_seul_reste_autorise(self, tmp_path):
        assert not _bloque("git restore --staged f.txt", cwd=tmp_path)

    def test_restore_staged_et_worktree_bloque(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert _bloque("git restore --staged --worktree f.txt", cwd=tmp_path)


class TestCleanForce:
    def test_clean_f_bloque(self, tmp_path):
        assert _bloque("git clean -f", cwd=tmp_path)

    def test_clean_fd_groupe_bloque(self, tmp_path):
        assert _bloque("git clean -fd", cwd=tmp_path)

    def test_clean_dry_run_reste_autorise(self, tmp_path):
        assert not _bloque("git clean -n", cwd=tmp_path)


class TestStashDropClear:
    def test_stash_drop_bloque(self, tmp_path):
        assert _bloque("git stash drop", cwd=tmp_path)

    def test_stash_clear_bloque(self, tmp_path):
        assert _bloque("git stash clear", cwd=tmp_path)

    def test_stash_push_et_pop_restent_autorises(self, tmp_path):
        assert not _bloque("git stash push -u", cwd=tmp_path)
        assert not _bloque("git stash pop", cwd=tmp_path)
        assert not _bloque("git stash list", cwd=tmp_path)


class TestCommandesInoffensivesToujoursAutorisees:
    def test_status_et_diff_passent(self, tmp_path):
        assert not _bloque("git status", cwd=tmp_path)
        assert not _bloque("git diff", cwd=tmp_path)

    def test_show_reste_le_chemin_recommande(self, tmp_path):
        assert not _bloque("git show HEAD:f.txt", cwd=tmp_path)


class TestCorrectifsRevueAdversariale20260907:
    """Bugs trouves par la revue bmad-code-review du 2026-09-07 sur le volet
    arbre fraichement fusionne, chacun reproduit ici pour verrouiller le
    correctif (le hub/VSCode1/VSCode3 partagent le meme code corrige)."""

    def test_option_globale_C_ne_desarme_plus_checkout(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert _bloque("git -C . checkout -- f.txt", cwd=tmp_path), (
            "B1 : `-C <valeur>` etait pris pour la sous-commande, desarmant "
            "tout le volet arbre -- forme employee pour agir sur un depot tiers")

    def test_option_globale_c_ne_desarme_plus_clean(self, tmp_path):
        assert _bloque("git -c core.pager=cat clean -fd", cwd=tmp_path)

    def test_option_globale_C_ne_desarme_plus_stash(self, tmp_path):
        assert _bloque("git -C . stash drop", cwd=tmp_path)

    def test_checkout_force_bloque_meme_sans_chemin(self, tmp_path):
        assert _bloque("git checkout -f master", cwd=tmp_path), (
            "B2 : checkout -f ecrase tout l'arbre suivi, pas seulement un chemin")
        assert _bloque("git checkout --force master", cwd=tmp_path)

    def test_switch_discard_changes_bloque(self, tmp_path):
        assert _bloque("git switch --discard-changes master", cwd=tmp_path)

    def test_switch_ordinaire_reste_autorise(self, tmp_path):
        assert not _bloque("git switch main", cwd=tmp_path)

    def test_restore_S_majuscule_bloque_correctement(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert not _bloque("git restore -S f.txt", cwd=tmp_path), (
            "A1 : -S (majuscule, --staged) etait compare a une liste "
            "minusculisee, jamais reconnu -- bloquait a tort un restore "
            "qui ne touche que l'index")

    def test_restore_staged_et_W_majuscule_bloque(self, tmp_path):
        (tmp_path / "f.txt").write_text("v1\n", encoding="utf-8")
        assert _bloque("git restore --staged -W f.txt", cwd=tmp_path), (
            "A1 : -W (majuscule, --worktree) invisible faisait passer un "
            "restore destructeur")

    def test_clean_dry_run_et_force_ensemble_reste_autorise(self, tmp_path):
        assert not _bloque("git clean -nfd", cwd=tmp_path), (
            "A3 : -n/--dry-run ne supprime rien, meme cumule avec -f")
        assert not _bloque("git clean --dry-run --force", cwd=tmp_path)

    def test_restore_help_reste_autorise(self, tmp_path):
        assert not _bloque("git restore --help", cwd=tmp_path)
        assert not _bloque("git restore -h", cwd=tmp_path)


class TestCorrectifsMineursRevue20260907:
    """M2/M3 de la revue bmad-code-review du 2026-09-07 -- couverture
    etendue au-dela des bugs bloquants B1/B2 et des correctifs A1/A3."""

    def test_stash_message_contenant_drop_reste_autorise(self, tmp_path):
        assert not _bloque('git stash push -m "drop le cache"', cwd=tmp_path), (
            "M2 : chercher drop/clear n'importe ou dans les tokens bloquait "
            "a tort un message de stash qui contient ce mot")

    def test_stash_message_contenant_clear_reste_autorise(self, tmp_path):
        assert not _bloque('git stash push -m "clear le cache"', cwd=tmp_path)

    def test_stash_drop_reel_reste_bloque(self, tmp_path):
        assert _bloque("git stash drop", cwd=tmp_path)
        assert _bloque("git stash clear", cwd=tmp_path)

    def test_rm_force_bloque(self, tmp_path):
        assert _bloque("git rm -f f.txt", cwd=tmp_path), (
            "M3 : git rm -f supprime le fichier du disque ET de l'index, "
            "jamais couvert")
        assert _bloque("git rm --force f.txt", cwd=tmp_path)

    def test_rm_sans_force_reste_autorise(self, tmp_path):
        assert not _bloque("git rm f.txt", cwd=tmp_path)

    def test_rm_cached_reste_autorise(self, tmp_path):
        assert not _bloque("git rm --cached f.txt", cwd=tmp_path)

    def test_worktree_remove_force_bloque(self, tmp_path):
        assert _bloque("git worktree remove --force wt", cwd=tmp_path), (
            "M3 : worktree remove --force supprime tout un arbre, jamais couvert")
        assert _bloque("git worktree remove -f wt", cwd=tmp_path)

    def test_worktree_remove_sans_force_reste_autorise(self, tmp_path):
        assert not _bloque("git worktree remove wt", cwd=tmp_path)

    def test_worktree_list_reste_autorise(self, tmp_path):
        assert not _bloque("git worktree list", cwd=tmp_path)
