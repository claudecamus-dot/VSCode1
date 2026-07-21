"""Tests du hook warn_verif_before_commit (garde-fou vérif au commit, constat #1).
Run: python .claude/hooks/tests/test_warn_verif_before_commit.py

Couvre : détection d'un git commit réel, détection d'une VRAIE exécution de vérif
dans le transcript (vs simple mention en prose), et le bout-en-bout warn/silence
sur un dépôt git temporaire."""
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

HOOKS = os.path.join(os.path.dirname(__file__), "..")
HOOK = os.path.join(HOOKS, "warn_verif_before_commit.py")
sys.path.insert(0, HOOKS)
import warn_verif_before_commit as H  # noqa: E402


# --- détection git commit (fonction pure) ---
def test_detects_plain_commit():
    assert H._git_commit_flags("git commit -m x") is not None


def test_detects_commit_with_env_prefix():
    assert H._git_commit_flags("FOO=1 git commit") is not None


def test_detects_commit_with_global_opts():
    assert H._git_commit_flags("git -C /p commit -a") is not None


def test_dry_run_is_not_a_commit():
    assert H._git_commit_flags("git commit --dry-run") is None


def test_status_is_not_a_commit():
    assert H._git_commit_flags("git status") is None


def test_echo_commit_is_not_a_commit():
    assert H._git_commit_flags("echo git commit") is None


def test_push_is_not_a_commit():
    assert H._git_commit_flags("git push") is None


# --- détection d'une vraie exécution de vérif ---
def _transcript(*events):
    fh = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8")
    for e in events:
        fh.write(json.dumps(e) + "\n")
    fh.close()
    return fh.name


def test_verif_trace_from_bash_npm_test():
    tp = _transcript(
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "je parle de npm test"}]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": "cd app && npm test"}}]}},
    )
    try:
        assert H._verif_ran(tp) is True
    finally:
        os.unlink(tp)


def test_prose_mention_is_not_a_trace():
    # Anti-faux-positif : parler de « npm test »/« revue-increment » sans les lancer.
    tp = _transcript(
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "on mentionne npm test et revue-increment"}]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": "git status"}}]}},
    )
    try:
        assert H._verif_ran(tp) is False
    finally:
        os.unlink(tp)


def test_verif_trace_from_skill():
    tp = _transcript({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Skill", "input": {"skill": "pptx-verify"}}]}})
    try:
        assert H._verif_ran(tp) is True
    finally:
        os.unlink(tp)


def test_missing_transcript_is_no_trace():
    assert H._verif_ran("/no/such/file") is False


# --- bout-en-bout sur dépôt git temporaire ---
def _run_hook(payload):
    p = subprocess.run([sys.executable, HOOK], input=json.dumps(payload),
                       capture_output=True, text=True, timeout=30)
    return p.stdout.strip()


def _repo():
    repo = tempfile.mkdtemp()
    def git(*a): subprocess.run(["git"] + list(a), cwd=repo, capture_output=True, text=True)
    git("init"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
    os.makedirs(os.path.join(repo, "app"))
    pathlib.Path(repo, "app", "x.js").write_text("x")
    pathlib.Path(repo, "docs.md").write_text("d")
    return repo, git


def test_e2e_app_staged_no_verif_warns():
    repo, git = _repo()
    try:
        git("add", "app/x.js")
        out = _run_hook({"tool_name": "Bash", "tool_input": {"command": "git commit -m wip"},
                         "cwd": repo, "transcript_path": "/no/file"})
        assert out and "systemMessage" in out, out
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_e2e_app_staged_with_verif_is_silent():
    repo, git = _repo()
    tp = _transcript({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Bash", "input": {"command": "npm test"}}]}})
    try:
        git("add", "app/x.js")
        out = _run_hook({"tool_name": "Bash", "tool_input": {"command": "git commit -m wip"},
                         "cwd": repo, "transcript_path": tp})
        assert out == "", out
    finally:
        shutil.rmtree(repo, ignore_errors=True); os.unlink(tp)


def test_e2e_docs_only_is_silent():
    repo, git = _repo()
    try:
        git("add", "docs.md")
        out = _run_hook({"tool_name": "Bash", "tool_input": {"command": "git commit -m doc"},
                         "cwd": repo, "transcript_path": "/no/file"})
        assert out == "", out
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_e2e_commit_a_with_unstaged_app_warns():
    repo, git = _repo()
    try:
        git("add", "app/x.js"); git("commit", "-m", "base")
        pathlib.Path(repo, "app", "x.js").write_text("modifié")  # suivi, non stagé
        out = _run_hook({"tool_name": "Bash", "tool_input": {"command": "git commit -a -m wip"},
                         "cwd": repo, "transcript_path": "/no/file"})
        assert out and "systemMessage" in out, out
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_e2e_non_commit_is_silent():
    repo, git = _repo()
    try:
        out = _run_hook({"tool_name": "Bash", "tool_input": {"command": "git status"},
                         "cwd": repo, "transcript_path": "/no/file"})
        assert out == "", out
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def main():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print("ok ", fn.__name__)
    print(f"\nALL {len(fns)} TESTS PASSED")


if __name__ == "__main__":
    main()
