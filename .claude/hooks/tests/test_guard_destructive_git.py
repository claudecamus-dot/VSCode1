"""Tests du hook guard_destructive_git (garde-fou déterministe git).
Run: python .claude/hooks/tests/test_guard_destructive_git.py

Couvre : la fonction pure _blocked_reason (push --force / reset --hard, avec
préfixe VAR=value, short -f, --force-with-lease toléré), l'anti-faux-positif
(mêmes mots en DONNÉE dans un -m "..." ou un corps de heredoc), et le
bout-en-bout (schéma de sortie hookSpecificOutput.permissionDecision=deny)."""
import json
import os
import subprocess
import sys

HOOKS = os.path.join(os.path.dirname(__file__), "..")
HOOK = os.path.join(HOOKS, "guard_destructive_git.py")
sys.path.insert(0, HOOKS)
import guard_destructive_git as H  # noqa: E402


# --- _blocked_reason : cas bloqués ---
def test_plain_push_force_blocked():
    assert H._blocked_reason("git push --force origin main") is not None


def test_short_f_flag_blocked():
    assert H._blocked_reason("git push -f origin main") is not None


def test_env_prefix_push_force_blocked():
    # Régression clé : l'ancienne regex ^git\s+push\b laissait passer ce cas.
    assert H._blocked_reason("FOO=1 git push --force origin main") is not None


def test_force_equals_value_blocked():
    assert H._blocked_reason("git push --force=origin main") is not None


def test_reset_hard_blocked():
    assert H._blocked_reason("git reset --hard HEAD~1") is not None


def test_reset_hard_with_env_prefix_blocked():
    assert H._blocked_reason("GIT_PAGER=cat git reset --hard") is not None


# --- _blocked_reason : cas tolérés ---
def test_force_with_lease_allowed():
    assert H._blocked_reason("git push --force-with-lease origin main") is None


def test_force_with_lease_equals_allowed():
    assert H._blocked_reason("git push --force-with-lease=origin/main") is None


def test_plain_push_allowed():
    assert H._blocked_reason("git push origin main") is None


def test_status_allowed():
    assert H._blocked_reason("git status") is None


def test_reset_soft_allowed():
    assert H._blocked_reason("git reset --soft HEAD~1") is None


def test_non_git_command_allowed():
    assert H._blocked_reason("echo git push --force") is None


def test_force_as_quoted_message_data_allowed():
    # -m "... git push --force ..." : shlex garde l'argument en un seul token,
    # « push » n'est donc pas un token isolé de la commande git.
    assert H._blocked_reason('git commit -m "docs: git push --force expliqué"') is None


def test_unbalanced_quotes_fail_open():
    assert H._blocked_reason('git push --force "oops') is None


# --- _segments : bornes de commande ---
def test_segments_split_on_operators():
    segs = H._segments("git status && git push --force")
    assert any(H._blocked_reason(s) for s in segs)


def test_segments_do_not_split_inside_quotes():
    # Le point-virgule est dans une chaîne quotée -> une seule commande git commit.
    segs = H._segments('git commit -m "a; git push --force"')
    assert all(H._blocked_reason(s) is None for s in segs)


# --- _strip_heredocs : corps de heredoc = donnée ---
def test_heredoc_body_is_data_not_command():
    cmd = "git commit -F - <<'EOF'\ngit push --force\nEOF\n"
    stripped = H._strip_heredocs(cmd)
    assert all(H._blocked_reason(s) is None for s in H._segments(stripped))


# --- bout-en-bout : schéma de sortie du hook ---
def _run_hook(command):
    p = subprocess.run(
        [sys.executable, HOOK],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True, text=True, timeout=30,
    )
    return p.stdout.strip()


def _is_deny(out):
    if not out:
        return False
    d = json.loads(out).get("hookSpecificOutput", {})
    return d.get("hookEventName") == "PreToolUse" and d.get("permissionDecision") == "deny"


def test_e2e_push_force_denies():
    assert _is_deny(_run_hook("git push --force origin main"))


def test_e2e_env_prefix_push_force_denies():
    assert _is_deny(_run_hook("FOO=1 git push --force origin main"))


def test_e2e_force_with_lease_is_silent():
    assert _run_hook("git push --force-with-lease origin main") == ""


def test_e2e_benign_is_silent():
    assert _run_hook("git status") == ""


def test_e2e_malformed_json_fails_open():
    p = subprocess.run([sys.executable, HOOK], input="not json",
                       capture_output=True, text=True, timeout=30)
    assert p.stdout.strip() == ""


def main():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print("ok ", fn.__name__)
    print(f"\nALL {len(fns)} TESTS PASSED")


if __name__ == "__main__":
    main()
