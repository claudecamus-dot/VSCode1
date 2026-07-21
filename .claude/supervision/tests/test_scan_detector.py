"""Tests du détecteur non_invocation_skills + du split routing-hints (constat
superviseur #2 : distinguer les skills bibliothèque/référence des « morts »).
Run: python .claude/supervision/tests/test_scan_detector.py

Déterministe : monte un REPO temporaire (.claude/agents + .claude/skills/<n>/scripts)
et n'utilise que des noms de skills absents de ~/.claude/skills, pour ne dépendre
ni de l'état réel du projet ni du home."""
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import scan_transcripts as S


def _detect(agents_text, scripts, fam):
    repo = tempfile.mkdtemp()
    os.makedirs(os.path.join(repo, ".claude", "agents"))
    with open(os.path.join(repo, ".claude", "agents", "an-agent.md"), "w", encoding="utf-8") as fh:
        fh.write(agents_text)
    for name in scripts:
        os.makedirs(os.path.join(repo, ".claude", "skills", name, "scripts"))
    old_repo, old_cache = S.REPO, S._AGENTS_TEXT
    try:
        S.REPO = repo
        S._AGENTS_TEXT = None  # forcer relecture des agents du faux repo
        return S.non_invocation_skills(fam)
    finally:
        S.REPO, S._AGENTS_TEXT = old_repo, old_cache
        shutil.rmtree(repo, ignore_errors=True)


def test_scripts_dir_classifies_as_library():
    lib = _detect("rien", ["zz-lib-code"], {"zz-lib-code": "projet"})
    assert "zz-lib-code" in lib, lib


def test_path_citation_in_agent_classifies_as_reference():
    lib = _detect("voir `.claude/skills/zz-ref/` pour la structure", [], {"zz-ref": "projet"})
    assert "zz-ref" in lib, lib


def test_bare_mention_not_classified():
    # Régression réelle (agent-orchestrator) : un nom juste mentionné en prose,
    # sans chemin `skills/`, ne doit PAS être classé bibliothèque/référence.
    lib = _detect("within zz-plain you are a node", [], {"zz-plain": "projet"})
    assert "zz-plain" not in lib, lib


def test_bmad_excluded():
    lib = _detect("voir `.claude/skills/bmad-x/`", [], {"bmad-x": "BMAD"})
    assert "bmad-x" not in lib, lib


def test_unreferenced_stays_unused():
    # Ni scripts/ ni chemin cité = vrai jamais-utilisé (pas de preuve inventée).
    lib = _detect("rien de pertinent", [], {"zz-orphan": "projet"})
    assert "zz-orphan" not in lib, lib


def test_hyphenated_name_not_matched_as_prefix():
    # `skills/zz-ref` ne doit pas matcher un nom plus long `zz-ref-extra`.
    lib = _detect("voir `.claude/skills/zz-ref-extra/`", [], {"zz-ref": "projet"})
    assert "zz-ref" not in lib, lib


def test_routing_hints_moves_libref_out_of_jamais():
    # Le split : les biblio/référence quittent jamais_utilises pour bibliotheque_reference.
    old = S.non_invocation_skills
    try:
        S.non_invocation_skills = lambda fam: {"zz-lib"}
        fam = {"zz-lib": "projet", "zz-dead": "projet"}
        state = {"skills": {}, "subagents": {}}
        hints = S.build_routing_hints(state, fam, {}, {}, None, runs=[], arbitrages=[])
        assert "zz-lib" not in hints["jamais_utilises"], hints["jamais_utilises"]
        assert "zz-lib" in hints["bibliotheque_reference"], hints
        assert "zz-dead" in hints["jamais_utilises"], hints["jamais_utilises"]
    finally:
        S.non_invocation_skills = old


def main():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn(); print("ok ", fn.__name__)
    print(f"\nALL {len(fns)} TESTS PASSED")


if __name__ == "__main__":
    main()
