# Catalogue des agents — routage orchestrateur

> Utilisé par la skill `agent-orchestrator` pour composer ses plans. Descriptions et
> recommandations maintenues à la main ; les **statuts d'usage vivants** (invocations,
> dates, jamais-utilisés) sont dans `routing-hints.json` (généré à chaque session par le
> scan superviseur, avec les stats plan-vs-réel de `runs.jsonl`) et, en version lisible,
> dans `docs/wiki/technical/agents-supervision.md` — toujours les vérifier avant de router
> vers un agent « jamais utilisé ». Statuts ci-dessous : instantané du **2026-07-21**,
> premier scan réel après import de `agent-orchestrator`/`agent-supervisor` (voir
> `docs/reflexions/`, doc de référence portée depuis le projet source Interview-to-Deck).
> Les décisions humaines qui closent un constat d'usage sont dans
> `.claude/supervision/arbitrages.json` (vide à l'import — rien n'a encore été arbitré
> sur ce projet).
> Si **aucune entrée ne couvre le besoin** : inventaire git présents + supprimés via
> `py .claude/orchestration/git_agents_inventory.py`, puis proposition de
> restauration/évolution/création (procédure dans la skill, étape 2).

## Trois flottes de routage — non unifiées (cf. CLAUDE.md « Skills & agents »)

Ce projet a accumulé trois systèmes de coordination distincts, chacun avec sa propre
logique ; CLAUDE.md documente déjà le recouvrement comme **non tranché**, à arbitrer par
l'équipe — ce catalogue le reflète sans trancher à sa place :

| Flotte | Nature | Point d'entrée | Statut du recouvrement |
| --- | --- | --- | --- |
| Skills + sous-agents natifs (ce catalogue) | Skill inline (session principale) + sous-agents Claude Code natifs | `agent-orchestrator` (invocation manuelle ici, hook `UserPromptSubmit` volontairement non branché) | — |
| `.claude/agents/orchestrator` + `orchestrator-dev` | Sous-agents (Task), hérités d'un setup OpenCode, pilotage par tickets **Beads** (non garanti installé) | Invocation directe de l'agent | Recoupe `agent-orchestrator` sur le rôle « point d'entrée multi-agents » — **aucune priorité posée** |
| BMAD (`bmad-*`, 46 skills) | Skills, cycle produit→dev par personas | `bmad-help` (routeur) | Recoupe partiellement `.claude/agents/` (mêmes rôles dev/architecte/reviewer sous d'autres noms) |

Conséquence pour le routage au quotidien : les **agents-feuille** du fleet `.claude/agents/`
(`ppt-designer`, `ui-designer`, `ux-designer`, `documentarian`, `onboarder`, `developer*`,
`qa-engineer`, `reviewer`, `debugger`, `auditor*`) n'ont pas d'équivalent dans ce catalogue
et se routent normalement — ils ne sont pas en concurrence avec `agent-orchestrator`, qui
ne fait pas ce qu'ils font. Seuls `orchestrator` et `orchestrator-dev` (rôle « point
d'entrée »/« pilote de workflow ») chevauchent directement `agent-orchestrator` : ne pas
les ériger en pipeline par défaut au même titre qu'un playbook tant que l'équipe n'a pas
choisi la flotte canonique.

## Skills projet

| Skill | Quand l'utiliser | Mode typique | Modèle | Statut (2026-07-21) |
| --- | --- | --- | --- | --- |
| `run` | Lancer/screenshoter l'app, vérifier un changement UI réel | Synchrone | (session) | Éprouvé (×2) |
| `revue-increment` | Definition-of-done : fin d'incrément, avant commit | Synchrone, étape terminale obligatoire des plans de dev | (session) | Jamais invoquée (comme skill) malgré le rappel SessionStart — à réhabiliter via l'orchestrateur |
| `pptx-framed-image` | Remplir les cadres photo d'un template PPT — étape conditionnelle du playbook `export-ppt-verifie` | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — n=0 en direct ≠ mort (usage via le sous-agent, § Bundle PPT) ; pertinence : `reference_octo_cadre_frame_layout.md` (cadre = shape du slideLayout) |
| `slide-text-polish` | Lint de la qualité rédactionnelle des slides — étape conditionnelle du playbook `export-ppt-verifie` | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — n=0 en direct ≠ mort (usage via le sous-agent, § Bundle PPT) ; pertinence : `feedback_pas_d_abreviations_cryptiques.md` (indicateurs en clair dans les livrables client) |
| `restitution-ppt` | Générer/améliorer le PPT de restitution (US6.4) — structure du deck lue par le sous-agent `ppt-designer` (§ Bundle PPT) | Synchrone | (session) | **Référence du bundle `ppt-designer`** — n=0 en direct ≠ mort : la génération réelle passe par le sous-agent (§ Bundle PPT) |
| `agent-orchestrator` | Point d'entrée des demandes multi-étapes/multi-agents (invocation manuelle — hook non branché) | Synchrone | (session) | Neuf (import 2026-07-21) |
| `agent-supervisor` | Diagnostic qualitatif des agents (étage 2) — depuis `revue-increment` ou sur signal SessionStart | Synchrone, ≤ 1×/14 j | (session) | Neuf (import 2026-07-21) |

## Skills globaux clés

| Skill | Quand l'utiliser | Mode typique | Modèle | Statut (2026-07-21) |
| --- | --- | --- | --- | --- |
| `roadmap-keeper` | Mettre à jour/rendre la roadmap (`.roadmap/roadmap.json`) | Synchrone | (session) | Éprouvé (×4) |
| `skill-creator` | Créer/modifier un skill | Synchrone | (session) | Éprouvé (×3) |
| `pptx-verify` | Vérifier un export PPT en rendu réel — obligatoire après toute génération/modif du deck | Synchrone | (session) | Utilisé (×1) — colonne vertébrale du playbook `export-ppt-verifie` |
| `pptx-deck` | Générer un deck avec les helpers python-pptx du skill (échelle typographique, gauge, cartes…) | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — n=0 en direct ≠ mort : le projet génère via son propre code (`app/scripts/pptx_deck.py`, `export-restitution-ppt.py`) et route via le sous-agent (§ Bundle PPT) |
| `restitution-deck-design` | Deck techniquement correct mais visuellement pauvre — passe design du bundle `ppt-designer` (§ Bundle PPT) | Synchrone | (session) | **Référence du bundle `ppt-designer`** — n=0 en direct ≠ mort (passe design via le sous-agent) ; pertinence : `reference_octo_design_system_html.md` + `project_fidelite_charte_ppt.md` (fidélité charte OCTO) |
| `dataviz` | Concevoir un graphique/tableau de bord cohérent | Synchrone | (session) | Jamais invoquée à ce jour |
| `code-review` / `verify` / `simplify` | Revue du diff / vérification bout-en-bout / nettoyage | Synchrone, fin de plan de dev | (session) | Builtins |

*(Skills globaux « méta-outillage » — `update-config`, `keybindings-help`,
`fewer-permission-prompts`, `loop`, `schedule`, `claude-api`, `init`, `review`,
`security-review` — hors périmètre de ce catalogue : ils configurent l'environnement
Claude Code plutôt que le travail produit, l'orchestrateur n'y route pas.)*

## Sous-agents natifs Claude Code (seuls à accepter un choix de modèle)

| Sous-agent | Quand l'utiliser | Mode typique | Modèle conseillé | Statut (2026-07-21) |
| --- | --- | --- | --- | --- |
| `Explore` | Recherche large en lecture seule, conclusion sans les dumps | Parallèle (fan-out ≤4) ou async | Haiku/Sonnet (mécanique/standard) | Utilisé (×1) |
| `Plan` | Concevoir une stratégie d'implémentation | Synchrone | Opus/Fable (structurant) | Jamais utilisé |
| `general-purpose` | Tâche multi-étapes déléguée, sortie volumineuse | Async ou synchrone | Sonnet ; Opus/Fable si structurant | Jamais utilisé |
| `claude-code-guide` | Questions sur Claude Code / SDK / API | Synchrone | (défaut) | Jamais utilisé |

## Flotte projet `.claude/agents/` (17 agents — modèles déclarés en frontmatter)

Fleet custom antérieure à BMAD (cf. CLAUDE.md « Hiérarchie de modèles pour les
sous-agents »). Invocables via `Task`/`Agent` comme n'importe quel sous-agent ; le
paramètre modèle d'un lancement prend le pas sur le défaut déclaré si besoin.

| Agent | Rôle | Modèle par défaut | Statut (2026-07-21) |
| --- | --- | --- | --- |
| `ppt-designer` | Génère/améliore le deck PPT de restitution, vérifie par rendu réel — **nœud central du bundle PPT** (voir § ci-dessous) | (thread) | Utilisé (×2) — le canal réel de génération PPT sur ce projet |
| `ui-designer` | Système visuel, tokens de design | (thread) | Utilisé (×2) |
| `ux-designer` | User flows, spécifications UX | (thread) | Utilisé (×2) |
| `documentarian` | Doc technique/fonctionnelle, wiki | (thread) | Utilisé (×1) |
| `onboarder` | Découverte d'un projet existant, wiki initial | (thread) | Utilisé (×1) |
| `orchestrator` | Interface utilisateur, délègue selon le planner (Beads) | sonnet | Jamais utilisé — recoupe `agent-orchestrator` (voir tableau des 3 flottes) |
| `orchestrator-dev` | Pilote le workflow Beads ticket par ticket | sonnet | Jamais utilisé — idem |
| `pathfinder` | Reconnaissance rapide, estimation de complexité | sonnet | Jamais utilisé |
| `planner` | Décompose en epics/tickets | sonnet | Jamais utilisé |
| `reviewer` | Revue de diff structurée | opus | Jamais utilisé |
| `auditor` / `auditor-subagent` | Audit multi-domaine / sous-agent lecture seule | (thread) / haiku | Jamais utilisés |
| `developer` / `developer-migrator` / `developer-refactor` | Implémentation générique / migration / refactoring | (thread) | Jamais utilisés |
| `qa-engineer` | Tests manquants (unitaires, intégration, E2E) | (thread) | Jamais utilisé |
| `debugger` | Diagnostic de bug (crée un ticket, ne corrige pas) | (thread) | Jamais utilisé |

### Bundle PPT — `ppt-designer` + sa boîte à outils

`ppt-designer` n'a pas l'outil Skill : il consomme sa boîte à outils en
**lisant/exécutant leurs ressources** (cf. sa déf. « Skills you rely on »).
L'orchestrateur route tout livrable « deck de restitution » vers ce **bundle**,
via le playbook `export-ppt-verifie` — pas vers les skills isolément :

| Rôle dans le bundle | Skills | Nature de l'usage |
| --- | --- | --- |
| Génération (nœud central) | sous-agent `ppt-designer` | lance la génération, s'appuie sur les libs ci-dessous |
| Bibliothèques | `pptx-deck`, `restitution-ppt` | lues (helpers python-pptx, structure du deck projet) |
| Enrichissements (conditionnels) | `pptx-framed-image`, `slide-text-polish`, `restitution-deck-design` | scripts exécutés / référence suivie |
| Vérification (obligatoire) | `pptx-verify` | rendu réel — jamais retiré |

Ces skills sont les `bibliotheque_reference` de `routing-hints.json` (constat
superviseur #2) : leur `n=0` en invocation directe ne vaut **pas** « mort » —
leur usage réel passe par `ppt-designer`, invisible au compteur d'invocations.
Enchaînement détaillé + contrats d'étape : playbook `export-ppt-verifie`.

## Familles sous condition

| Famille | Règle de routage |
| --- | --- |
| **BMAD (46 skills, 0 invocation à ce jour)** | Tri jamais fait sur ce projet (contrairement au projet source, qui l'a exécuté le 2026-07-18 — ne pas supposer un tri équivalent ici). Ne router que sur demande explicite de l'utilisateur, en passant par `bmad-help`. Candidat naturel du premier diagnostic `agent-supervisor`. |
| **OpenHub (`.opencode/`)** | Canal d'observation séparé (agents résultats en base applicative, si le pattern OpenHub est utilisé sur ce projet) — hors périmètre de ce catalogue, ne pas router. |
| **`.claude/agents/orchestrator` + `orchestrator-dev` (Beads)** | Cf. tableau des 3 flottes ci-dessus — recouvrement avec `agent-orchestrator` non arbitré. Les agents-feuille qu'ils invoquent normalement (`developer`, `reviewer`, `qa-engineer`…) restent routables individuellement sans ambiguïté. |

> Angle mort de mesure : les sous-skills invoquées par un sous-agent via un prompt en
> langage naturel (pattern utilisé par `bmad-code-review` pour lancer
> `bmad-review-adversarial-general`/`bmad-review-edge-case-hunter`) n'apparaissent pas
> dans `state.json`/`routing-hints.json` — seules les invocations directes de la session
> principale sont tracquées. Une absence de trace sur ces sous-skills ne signifie donc pas
> absence d'exécution : ne pas les qualifier `agent-mort` sur cette seule base.

## Playbooks

Workflows récurrents pré-composés — la skill cherche un playbook matchant **avant** de
composer à vide. Format : `.claude/orchestration/playbooks/FORMAT.md`.

| Playbook | Quand | Source | Statut |
| --- | --- | --- | --- |
| `dev-verifie` | Dev/correction dans `app/` : tests (`npm test`) + vérif réelle (conditionnelle aux fichiers touchés) + `revue-increment` avant commit | Manuel | Éprouvé (pratique effective de tous les incréments livrés) |
| `export-ppt-verifie` | Livrable = le deck : génération (`ppt-designer` ou code direct) + enrichissements conditionnels (`pptx-framed-image`, `slide-text-polish`, `restitution-deck-design`) + `pptx-verify` obligatoire + `revue-increment` | Manuel | Éprouvé (génération réelle ×plusieurs commits + `pptx-verify` ×1) — étapes conditionnelles jamais jouées |
| `revue-design-parallele` | Revue multi-angles en fan-out d'`Explore` (≤4) puis consolidation | Manuel | Jamais joué sur ce projet — pattern porté depuis le projet source (y a servi pour une revue design à 4 angles réelle) |
| `cycle-produit-bmad` | Cycle produit BMAD (brief→PRD→archi→epics→dev→review), clos par `revue-increment` | `generate_bmad_playbook.py` (regénérer depuis `_bmad/_config/bmad-help.csv`, ne pas éditer) | Jamais joué — sur demande explicite |
