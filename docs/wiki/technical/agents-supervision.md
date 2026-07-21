---
updated: 2026-07-21
generated-by: .claude/supervision/scan_transcripts.py (superviseur d'agents, étage 1)
---

# Supervision des agents — tableau de bord d'usage

> ⚠️ **Page générée automatiquement** (hook SessionStart → `.claude/supervision/scan_transcripts.py`).
> **Ne pas éditer à la main** — toute modification serait écrasée au prochain scan.
> Conception et phasage : [../../reflexions/agent-superviseur.md](../../reflexions/agent-superviseur.md).

Dernier scan : 2026-07-21T11:11:24+02:00 · **14 sessions** (transcripts) · **11** invocations de skills · **9** lancements de sous-agents.

## Skills — usage réel

| Skill | Famille | Invocations | Première | Dernière |
| --- | --- | --- | --- | --- |
| `roadmap-keeper` | global | 4 | 2026-06-22 | 2026-07-01 |
| `skill-creator` | global | 3 | 2026-06-24 | 2026-07-07 |
| `run` | (builtin/session) | 2 | 2026-06-22 | 2026-07-01 |
| `artifact-design` | (builtin/session) | 1 | 2026-07-07 | 2026-07-07 |
| `pptx-verify` | global | 1 | 2026-07-01 | 2026-07-01 |

## Sous-agents

| Sous-agent | Lancements | Premier | Dernier |
| --- | --- | --- | --- |
| `ppt-designer` | 2 | 2026-06-24 | 2026-07-08 |
| `ui-designer` | 2 | 2026-07-01 | 2026-07-01 |
| `ux-designer` | 2 | 2026-07-01 | 2026-07-01 |
| `Explore` | 1 | 2026-07-08 | 2026-07-08 |
| `documentarian` | 1 | 2026-07-01 | 2026-07-01 |
| `onboarder` | 1 | 2026-07-07 | 2026-07-07 |

## Jamais utilisés

**projet** — 6/6 jamais invoqués :

`agent-orchestrator`, `agent-supervisor`, `pptx-framed-image`, `restitution-ppt`, `revue-increment`, `slide-text-polish`

**BMAD** — 46/46 jamais invoqués :

<details><summary>Voir la liste</summary>

`bmad-advanced-elicitation`, `bmad-agent-analyst`, `bmad-agent-architect`, `bmad-agent-dev`, `bmad-agent-pm`, `bmad-agent-tech-writer`, `bmad-agent-ux-designer`, `bmad-architecture`, `bmad-brainstorming`, `bmad-check-implementation-readiness`, `bmad-checkpoint-preview`, `bmad-code-review`, `bmad-correct-course`, `bmad-create-architecture`, `bmad-create-epics-and-stories`, `bmad-create-prd`, `bmad-create-story`, `bmad-customize`, `bmad-dev-auto`, `bmad-dev-story`, `bmad-document-project`, `bmad-domain-research`, `bmad-edit-prd`, `bmad-editorial-review-prose`, `bmad-editorial-review-structure`, `bmad-forge-idea`, `bmad-generate-project-context`, `bmad-help`, `bmad-index-docs`, `bmad-market-research`, `bmad-party-mode`, `bmad-prd`, `bmad-prfaq`, `bmad-product-brief`, `bmad-qa-generate-e2e-tests`, `bmad-quick-dev`, `bmad-retrospective`, `bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`, `bmad-shard-doc`, `bmad-spec`, `bmad-sprint-planning`, `bmad-sprint-status`, `bmad-technical-research`, `bmad-ux`, `bmad-validate-prd`

</details>

**global** — 2/5 jamais invoqués :

`pptx-deck`, `restitution-deck-design`

## TODO agents (constats automatiques)

1. **Trier les skills BMAD** : 46 installés, 0 invocation à ce jour — décider lesquels garder, customiser ou désinstaller.
2. **`revue-increment` jamais invoquée** malgré le rappel SessionStart à chaque session — revoir son déclencheur (l'ancrer au flux de commit ?) ou la simplifier.
3. **Skills projet sans usage** : `agent-orchestrator`, `agent-supervisor`, `pptx-framed-image`, `restitution-ppt`, `slide-text-polish` — vérifier pertinence et déclencheurs.

## Diagnostic qualitatif (étage 2 — `agent-supervisor`)

_Jamais lancé — invoquer la skill `agent-supervisor` (intégrée à `revue-increment`) pour un diagnostic qualitatif (KO répétés, efficacité, interactions entre agents)._

---

_Étage O-C (croisement modèle × tâche × reprises, exploitation de `runs.jsonl`) : voir `.claude/orchestration/routing-hints.json`, régénéré à chaque session._
