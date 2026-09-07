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
