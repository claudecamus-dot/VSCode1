---
name: agent-orchestrator
description: Orchestrateur des agents et skills du projet — qualifie une demande de travail, compose un plan (cascade / parallèle / asynchrone, modèle par étape), l'exécute en s'appuyant sur le catalogue et les données du superviseur, puis journalise le run. À charger quand une demande de travail implique plusieurs étapes dépendantes, plusieurs agents/skills, ou des vérifications obligatoires — ou sur invocation explicite (le hook UserPromptSubmit qui le route sur chaque prompt non-slash est branché depuis le 2026-07-21, flotte arbitrée, voir « Portée sur ce projet »).
---

# Agent orchestrateur (étages O-A + O-B + O-C)

Conception : `docs/reflexions/agent-orchestrateur.md` (doc de référence **portée depuis le
projet source**, voir son en-tête). Données de routage : `.claude/orchestration/catalogue.md`
(recommandations), `.claude/orchestration/routing-hints.json` (hints générés par le
superviseur à chaque session : `eprouves`/`jamais_utilises`/`en_sommeil`,
`verifications_oubliees` à insérer d'office, stats plan-vs-réel par playbook/agent,
`prudence` issu du diagnostic étage 2), `docs/wiki/technical/agents-supervision.md` (tableau
de bord humain des mêmes données) et `.claude/orchestration/playbooks/` (workflows
récurrents — format dans `playbooks/FORMAT.md`).

## Portée sur ce projet (import du 2026-07-21 ; flotte arbitrée le 2026-07-21)

Ce projet a **déjà** une flotte `.claude/agents/orchestrator` + `orchestrator-dev`
(héritée d'un setup OpenCode, pilotage par tickets Beads) et le routeur BMAD `bmad-help`.
Le recouvrement de ces systèmes de routage a été **tranché le 2026-07-21** (voir CLAUDE.md
§ « Skills & agents » et `.claude/orchestration/catalogue.md` § « Flotte de routage ») : la
flotte de rôles canonique est `.claude/agents/`, pilotée par cette skill. En conséquence, le
hook `UserPromptSubmit` (`.claude/hooks/orchestrator_gate.py`) est désormais **branché** dans
`settings.json` — `agent-orchestrator` reçoit une grille de qualification (~50 tokens,
silencieuse sur les slash-commands) sur *chaque* prompt non-slash, et est le point d'entrée
par défaut des demandes multi-étapes/multi-agents. `.opencode/agents/` (doublon) a été
supprimé ; `.opencode/skills/` reste (bibliothèque de protocoles des agents `.claude/agents/`).
BMAD est conservé pour son cycle produit, pas comme fleet de rôles concurrente.

## Méthode — 5 étapes

### 1. Qualifier (silencieux, jamais mentionné à l'utilisateur si exécution directe)

- **Exécution directe** (pas d'orchestration, pas de journal) : une seule étape, un seul
  agent/skill évident, micro-tâche, question, correction en cours de tâche.
- **Orchestrer** : ≥ 2 étapes dépendantes, ≥ 2 agents/skills, vérifications obligatoires
  en jeu (voir table), ou action difficilement réversible au milieu d'un enchaînement.

### 2. Composer le plan

**D'abord, chercher un playbook.** Si la demande matche les `declencheurs` d'un playbook
de `.claude/orchestration/playbooks/`, l'instancier plutôt que composer à vide : adapter
ses étapes à la demande **sans en retirer les vérifications obligatoires ni les
checkpoints**, ne garder que les étapes conditionnelles applicables. Playbooks actuels :

| Playbook | Pour | Statut |
| --- | --- | --- |
| `dev-verifie` | Implémentation/correction dans `app/` avec tests + vérif réelle + `revue-increment` avant commit | Éprouvé (pratique effective du projet) |
| `export-ppt-verifie` | Livrable = le deck de restitution (`app/scripts/pptx_deck.py`, `export-restitution-ppt.py`) : génération + enrichissements conditionnels (cadres photo, polish, design) + `pptx-verify` obligatoire | Éprouvé (génération + 1 vérification réelle constatées) |
| `revue-design-parallele` | Revue multi-angles d'un livrable en fan-out puis consolidation | Jamais joué sur ce projet — pattern porté depuis le projet source |
| `cycle-produit-bmad` | Cycle produit BMAD complet (généré depuis `_bmad/_config/bmad-help.csv`) — **sur demande explicite uniquement** | Jamais joué (46 skills BMAD, 0 invocation à ce jour) |

Sinon composition libre depuis le catalogue + `routing-hints.json` : préférer les
`eprouves`, prudence explicite sur les `jamais_utilises` et les cibles listées dans
`prudence`, insérer d'office les `verifications_oubliees`. Pour chaque étape :
**agent/skill**, **mode**, **modèle** (sous-agents uniquement), **contrat de sortie**.
Suivre le plan avec TodoWrite. Règle de mode — *la dépendance de données décide* :

| Mode | Quand | Garde-fous |
| --- | --- | --- |
| Synchrone (cascade) | L'étape suivante a besoin du résultat | Contrat de sortie vérifié avant de continuer |
| Parallèle (fan-out) | Étapes indépendantes en lecture/analyse | ≤ 4 sous-agents, jamais d'écritures concurrentes sur les mêmes fichiers, consolidation obligatoire |
| Asynchrone (arrière-plan) | Long, autonome, non bloquant | Attendre la notification — ne JAMAIS anticiper/fabriquer le résultat ; 1 seul chantier async lourd à la fois |
| Irréversible (commit, suppression, publication) | — | Toujours synchrone + confirmation utilisateur, hooks/permissions jamais contournés |

**Aucun agent/skill ne couvre le besoin ?** Ne pas improviser sans le signaler — escalade
en trois temps, dans cet ordre :

1. **Mémoire git** : `py .claude/orchestration/git_agents_inventory.py` inventorie tous
   les agents/skills que git connaît — **présents et supprimés**. `--json` pour la version
   structurée.
2. **Restauration** : si un agent supprimé matche, montrer son contenu
   (`git show <commit>^:<chemin>`, la commande exacte est dans la colonne « Restaurer »)
   et **proposer** sa restauration — décision utilisateur, jamais de restauration
   silencieuse.
3. **Évolution ou création** : sinon, proposer soit l'évolution de l'agent/skill existant
   le plus proche (étendre ses déclencheurs/son périmètre), soit la création d'un nouveau
   via `skill-creator` — avec un mini-brief (nom, déclencheurs, périmètre, ce qui manque
   aux existants). C'est une décision de périmètre : toujours la faire arbitrer par
   l'utilisateur avant d'écrire quoi que ce soit.

Dans les trois cas, noter la résolution dans le `notes` du run journalisé
(`"resolution: restauration <nom>"` / `"resolution: evolution <nom>"` /
`"resolution: creation <nom>"`) — le superviseur s'en servira pour détecter les trous
récurrents du catalogue.

### 3. Valider

Présenter le plan à l'utilisateur **seulement si** : > 3 sous-agents, coût manifestement
élevé, ou étape irréversible/hors périmètre de la demande. Sinon exécuter directement —
la demande vaut mandat, la validation systématique tuerait l'usage.

### 4. Exécuter

Après chaque étape, vérifier son **contrat de sortie** (artefact attendu présent, test
vert, vérification réelle faite). Échec → **une** relance ciblée, puis escalade à
l'utilisateur avec l'état réel. Vérifications obligatoires à insérer d'office dans les
plans (leçons payées du projet — mémoires `feedback_*`/`reference_*`) :

| Si le plan touche… | Alors le plan contient… |
| --- | --- |
| Pages HTML/CSS/JS de `app/src/public/` | Screenshot réel via le skill `run` (pas seulement les tests) |
| `app/scripts/pptx_deck.py`, `export-restitution-ppt.py`, `build-synthese-ppt.py`, ou le deck retravaillé via le sous-agent `ppt-designer` | `pptx-verify` (rendu réel — python-pptx est un parseur tolérant, mémoire `reference_rendu_pptx_verification.md`) |
| Fin d'incrément / avant commit | `revue-increment` en étape terminale |
| Exploration volumineuse | Sous-agent en lecture seule (`Explore`, ou `pathfinder`/`onboarder` du fleet projet), jamais la session principale |
| Skills BMAD | Uniquement sur demande explicite, via `bmad-help` |
| Libellés/indicateurs dans un livrable client | Pas d'abréviation cryptique (mémoire `feedback_pas_d_abreviations_cryptiques.md`) — vérifiable via `slide-text-polish` pour les slides |

### 5. Journaliser

À la fin du run (succès **ou** échec), une ligne dans `.claude/orchestration/runs.jsonl` :

```bash
py .claude/orchestration/log_run.py '{"demande": "résumé court", "qualification": "orchestre", "playbook": "dev-verifie", "plan": [{"etape": "revue design", "agent": "Explore", "mode": "parallele", "modele": "haiku"}], "resultat": "succes", "reprises": 0, "notes": ""}'
```

(JSON aussi accepté sur stdin. `qualification` : `orchestre` | `direct-signale` ;
`resultat` : `succes` | `partiel` | `echec` ; `playbook` : nom du playbook instancié ou
`null` en composition libre. Les exécutions directes ne se journalisent pas — le journal
trace les orchestrations, pas la conversation.)

## Politique de modèle (sous-agents uniquement)

La session principale — donc les skills inline — reste sur le modèle choisi par
l'utilisateur : l'orchestrateur peut **proposer** une bascule (`/model`), jamais l'imposer.
Certains agents du fleet projet (`.claude/agents/*.md`) déclarent déjà un `model:` par
défaut en frontmatter (`orchestrator`/`orchestrator-dev`/`pathfinder`/`planner` en sonnet,
`reviewer` en opus, `auditor-subagent` en haiku ; les autres héritent du thread principal) —
le paramètre modèle d'un lancement de sous-agent **prend le pas** sur ce défaut si besoin.

| Modèle | Pour | Exemple |
| --- | --- | --- |
| Haiku | Fan-out mécanique : recherches simples, extraction, inventaires | `auditor-subagent`, 4 × `Explore` sur des questions factuelles |
| Sonnet | Défaut dev : exploration de code, implémentation standard, revue ciblée | `developer`, `general-purpose` sur une feature bornée |
| Opus / Fable | Structurant : architecture, plan complexe, revue adversariale, arbitrage | `reviewer`, `Plan`, revue de conception |

Arbitrage par défaut : qualité d'abord sur le structurant, économe sur le fan-out — le
superviseur croisera modèle × tâche × reprises pour ajuster poste par poste au fil des
runs journalisés.
