---
updated: 2026-07-21
generated-by: .claude/supervision/scan_transcripts.py (superviseur d'agents, étage 1)
---

# Supervision des agents — tableau de bord d'usage

> ⚠️ **Page générée automatiquement** (hook SessionStart → `.claude/supervision/scan_transcripts.py`).
> **Ne pas éditer à la main** — toute modification serait écrasée au prochain scan.
> Conception et phasage : [../../reflexions/agent-superviseur.md](../../reflexions/agent-superviseur.md).

Dernier scan : 2026-07-21T11:29:18+02:00 · **14 sessions** (transcripts) · **12** invocations de skills · **9** lancements de sous-agents.

## Skills — usage réel

| Skill | Famille | Invocations | Première | Dernière |
| --- | --- | --- | --- | --- |
| `roadmap-keeper` | global | 4 | 2026-06-22 | 2026-07-01 |
| `skill-creator` | global | 3 | 2026-06-24 | 2026-07-07 |
| `run` | (builtin/session) | 2 | 2026-06-22 | 2026-07-01 |
| `agent-supervisor` | projet | 1 | 2026-07-21 | 2026-07-21 |
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

**projet** — 5/6 jamais invoqués :

`agent-orchestrator`, `pptx-framed-image`, `restitution-ppt`, `revue-increment`, `slide-text-polish`

**BMAD** — 46/46 jamais invoqués :

<details><summary>Voir la liste</summary>

`bmad-advanced-elicitation`, `bmad-agent-analyst`, `bmad-agent-architect`, `bmad-agent-dev`, `bmad-agent-pm`, `bmad-agent-tech-writer`, `bmad-agent-ux-designer`, `bmad-architecture`, `bmad-brainstorming`, `bmad-check-implementation-readiness`, `bmad-checkpoint-preview`, `bmad-code-review`, `bmad-correct-course`, `bmad-create-architecture`, `bmad-create-epics-and-stories`, `bmad-create-prd`, `bmad-create-story`, `bmad-customize`, `bmad-dev-auto`, `bmad-dev-story`, `bmad-document-project`, `bmad-domain-research`, `bmad-edit-prd`, `bmad-editorial-review-prose`, `bmad-editorial-review-structure`, `bmad-forge-idea`, `bmad-generate-project-context`, `bmad-help`, `bmad-index-docs`, `bmad-market-research`, `bmad-party-mode`, `bmad-prd`, `bmad-prfaq`, `bmad-product-brief`, `bmad-qa-generate-e2e-tests`, `bmad-quick-dev`, `bmad-retrospective`, `bmad-review-adversarial-general`, `bmad-review-edge-case-hunter`, `bmad-shard-doc`, `bmad-spec`, `bmad-sprint-planning`, `bmad-sprint-status`, `bmad-technical-research`, `bmad-ux`, `bmad-validate-prd`

</details>

**global** — 2/5 jamais invoqués :

`pptx-deck`, `restitution-deck-design`

## TODO agents (constats automatiques)

1. **Trier les skills BMAD** : 46 installés, 0 invocation à ce jour — décider lesquels garder, customiser ou désinstaller.
2. **Skills projet sans usage** : `agent-orchestrator`, `pptx-framed-image`, `restitution-ppt`, `slide-text-polish` — vérifier pertinence et déclencheurs.

## Arbitrages enregistrés

_Constats clos par décision humaine (`.claude/supervision/arbitrages.json`) — l'usage réel reste mesuré ci-dessus._

- **`revue-increment`** (2026-07-21) : Constat #1 (vérif de fin d'incrément systématiquement sautée) accepté. Réponse retenue : un garde-fou au COMMIT plutôt que de forcer l'invocation de revue-increment — hook PreToolUse .claude/hooks/warn_verif_before_commit.py, non bloquant, ciblé app/, silencieux si une vraie vérif (npm test / pptx-verify / revue-increment) a tourné dans la session. La vérif est ainsi rappelée au bon instant ; l'usage réel de revue-increment reste mesuré et re-challengeable.

## Diagnostic qualitatif (étage 2 — `agent-supervisor`)

_Diagnostic à jour._

1. **Les skills PPT (restitution-ppt, pptx-framed-image, slide-text-polish, pptx-deck, restitution-deck-design) apparaissent « jamais utilises » mais ne sont probablement PAS morts : le compteur etage 1 ne voit que le thread principal, pas les invocations internes au sous-agent ppt-designer.** — Ne PAS desinstaller les skills PPT sur le seul signal n=0 ; les traiter « couverts par sous-agent » et non « morts » tant que la mesure ne voit pas l'interieur des sous-agents. · **Proposition** : Soit faire loguer par ppt-designer les skills qu'il invoque (leve l'angle mort de mesure), soit sortir les skills « a usage principalement sous-agent » de la liste jamais_utilises du wiki, pour eviter une decision de desinstallation basee sur une mesure aveugle.
2. **46 skills BMAD a 0 usage en 5 jours : trop tot pour les declarer morts, le vrai blocage est l'arbitrage de flotte non tranche (CLAUDE.md), pas une inutilite intrinseque.** — Ne pas trancher par desinstallation maintenant ; fixer une echeance de decision (30 j -> 2026-08-16) et tester le cycle BMAD une fois via bmad-help sur la prochaine feature, sinon basculer BMAD en_sommeil en bloc. · **Proposition** : Consigner dans arbitrages.json une decision datee « flotte canonique = .claude/agents jusqu'au 2026-08-16, BMAD en observation » ; si toujours 0 usage a l'echeance, desinstaller/en_sommeil en bloc plutot que skill par skill.

---

_Étage O-C (croisement modèle × tâche × reprises, exploitation de `runs.jsonl`) : voir `.claude/orchestration/routing-hints.json`, régénéré à chaque session._
