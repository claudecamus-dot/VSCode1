---
updated: 2026-07-21
generated-by: .claude/supervision/scan_transcripts.py (superviseur d'agents, étage 1)
---

# Supervision des agents — tableau de bord d'usage

> ⚠️ **Page générée automatiquement** (hook SessionStart → `.claude/supervision/scan_transcripts.py`).
> **Ne pas éditer à la main** — toute modification serait écrasée au prochain scan.
> Conception et phasage : [../../reflexions/agent-superviseur.md](../../reflexions/agent-superviseur.md).

Dernier scan : 2026-07-21T16:11:00+02:00 · **15 sessions** (transcripts) · **16** invocations de skills · **11** lancements de sous-agents.

## Skills — usage réel

| Skill | Famille | Invocations | Première | Dernière |
| --- | --- | --- | --- | --- |
| `roadmap-keeper` | global | 4 | 2026-06-22 | 2026-07-01 |
| `revue-increment` | projet | 3 | 2026-07-21 | 2026-07-21 |
| `skill-creator` | global | 3 | 2026-06-24 | 2026-07-07 |
| `run` | (builtin/session) | 2 | 2026-06-22 | 2026-07-01 |
| `agent-orchestrator` | projet | 1 | 2026-07-21 | 2026-07-21 |
| `agent-supervisor` | projet | 1 | 2026-07-21 | 2026-07-21 |
| `artifact-design` | (builtin/session) | 1 | 2026-07-07 | 2026-07-07 |
| `pptx-verify` | global | 1 | 2026-07-01 | 2026-07-01 |

## Sous-agents

| Sous-agent | Lancements | Premier | Dernier |
| --- | --- | --- | --- |
| `ppt-designer` | 3 | 2026-06-24 | 2026-07-21 |
| `ui-designer` | 2 | 2026-07-01 | 2026-07-01 |
| `ux-designer` | 2 | 2026-07-01 | 2026-07-01 |
| `Explore` | 1 | 2026-07-08 | 2026-07-08 |
| `documentarian` | 1 | 2026-07-01 | 2026-07-01 |
| `onboarder` | 1 | 2026-07-07 | 2026-07-07 |
| `reviewer` | 1 | 2026-07-21 | 2026-07-21 |

## Jamais utilisés

**BMAD** — 46/46 jamais invoqués :

<details><summary>Voir la liste</summary>

`bmad-advanced-elicitation`, `bmad-agent-analyst`, `bmad-agent-architect`, `bmad-agent-dev`, `bmad-agent-pm`, `bmad-agent-tech-writer`, `bmad-agent-ux-designer`, `bmad-architecture`, `bmad-brainstorming`, `bmad-check-implementation-readiness`, `bmad-checkpoint-preview`, `bmad-code-review`, `bmad-correct-course`, `bmad-create-architecture`, `bmad-create-epics-and-stories`, `bmad-create-prd`, `bmad-create-story`, `bmad-customize`, `bmad-dev-auto`, `bmad-dev-story`, `bmad-document-project`, `bmad-domain-research`, `bmad-edit-prd`, `bmad-editorial-review-prose`, `bmad-editorial-review-structure`, `bmad-forge-idea`, `bmad-generate-project-context`, `bmad-help`, `bmad-index-docs`, `bmad-market-research`, `bmad-party-mode`, `bmad-prd`, `bmad-prfaq`, `bmad-product-brief`, `bmad-qa-generate-e2e-tests`, `bmad-quick-dev`, `bmad-retrospective`, `bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`, `bmad-shard-doc`, `bmad-spec`, `bmad-sprint-planning`, `bmad-sprint-status`, `bmad-technical-research`, `bmad-ux`, `bmad-validate-prd`

</details>

## Skills bibliothèque / référence

_Consommés en lisant/exécutant leurs `scripts/`, ou via un sous-agent qui les suit (ex. `ppt-designer`, qui n'a pas l'outil Skill) — le compteur d'invocations ne peut structurellement pas les voir. `n=0` n'y vaut donc PAS « mort » : ne pas désinstaller sur ce seul signal (constat superviseur #2)._

`pptx-deck`, `pptx-framed-image`, `restitution-deck-design`, `restitution-ppt`, `slide-text-polish`

## TODO agents (constats automatiques)

_(aucun constat — rien à signaler sur les données actuelles)_

## Arbitrages enregistrés

_Constats clos par décision humaine (`.claude/supervision/arbitrages.json`) — l'usage réel reste mesuré ci-dessus._

- **`revue-increment`** (2026-07-21) : Constat #1 (vérif de fin d'incrément systématiquement sautée) accepté. Réponse retenue : un garde-fou au COMMIT plutôt que de forcer l'invocation de revue-increment — hook PreToolUse .claude/hooks/warn_verif_before_commit.py, non bloquant, ciblé app/, silencieux si une vraie vérif (npm test / pptx-verify / revue-increment) a tourné dans la session. La vérif est ainsi rappelée au bon instant ; l'usage réel de revue-increment reste mesuré et re-challengeable.
- **`famille:BMAD`** (2026-07-21) : Constat #3 : 46 skills BMAD à 0 usage à J+5 (installés le 2026-07-16). Décision d'OBSERVATION (pas de tri tranché maintenant) : BMAD n'est pas routé par défaut — déjà le cas, l'orchestrateur n'y route que sur demande explicite via bmad-help. Revue datée à l'échéance 2026-08-16 : si toujours 0 usage réel mesuré, désinstaller / mettre en sommeil en bloc plutôt que skill par skill. NB : la flotte canonique a été arbitrée le 2026-07-21 — .claude/agents/ est la flotte de rôles canonique (gate agent-orchestrator branché en UserPromptSubmit), BMAD conservé pour le cycle produit uniquement (cf. CLAUDE.md § Skills & agents). Décision réversible, re-challengeable par le superviseur avec des données nouvelles.

## Diagnostic qualitatif (étage 2 — `agent-supervisor`)

_Diagnostic à jour — rien à signaler, tous les constats précédents ont été arbitrés._

---

_Étage O-C (croisement modèle × tâche × reprises, exploitation de `runs.jsonl`) : voir `.claude/orchestration/routing-hints.json`, régénéré à chaque session._
