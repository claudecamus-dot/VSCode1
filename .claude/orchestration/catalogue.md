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

## Flotte de routage — arbitrée le 2026-07-21 (cf. CLAUDE.md « Skills & agents »)

Ce projet avait accumulé trois systèmes de coordination ; le recouvrement a été **tranché
le 2026-07-21** : la flotte de rôles canonique est `.claude/agents/`, pilotée par
`agent-orchestrator` dont le hook `UserPromptSubmit` est désormais **branché**.
`.opencode/agents/` (doublon, CLI externe `opencode`) a été **supprimé** ; `.opencode/skills/`
reste comme bibliothèque de protocoles chargée par les agents `.claude/agents/`. BMAD est
**conservé pour son cycle produit**, pas comme fleet de rôles concurrente.

| Flotte | Nature | Point d'entrée | Statut (2026-07-21) |
| --- | --- | --- | --- |
| Skills + sous-agents natifs (ce catalogue) | Skill inline (session principale) + sous-agents Claude Code natifs | `agent-orchestrator` (hook `UserPromptSubmit` **branché**) | **Canonique** |
| `.claude/agents/orchestrator` + `orchestrator-dev` | Sous-agents (Task), hérités d'un setup OpenCode, pilotage par tickets **Beads** (non garanti installé) | Invocation directe de l'agent | Rôle « point d'entrée » assuré par `agent-orchestrator` — ne pas les lancer en parallèle ; leurs agents-feuille restent routables |
| BMAD (`bmad-*`, 46 skills) | Skills, cycle produit→dev par personas | `bmad-help` (routeur) | Conservé pour le **cadrage produit** (prd/architecture/story), pas comme fleet de rôles dev |

Conséquence pour le routage au quotidien : les **agents-feuille** du fleet `.claude/agents/`
(`ppt-designer`, `ui-designer`, `ux-designer`, `documentarian`, `onboarder`, `developer*`,
`qa-engineer`, `reviewer`, `debugger`, `auditor*`) se routent normalement — ils ne sont pas
en concurrence avec `agent-orchestrator`, qui ne fait pas ce qu'ils font. `orchestrator` et
`orchestrator-dev` (rôle « point d'entrée »/« pilote de workflow ») sont désormais couverts
par `agent-orchestrator` : ne pas les ériger en pipeline concurrent sur la même demande.

## Skills projet

| Skill | Quand l'utiliser | Mode typique | Modèle | Statut (2026-07-21) |
| --- | --- | --- | --- | --- |
| `run` | Lancer/screenshoter l'app, vérifier un changement UI réel | Synchrone | (session) | Éprouvé (×2) |
| `revue-increment` | Definition-of-done : fin d'incrément, avant commit | Synchrone, étape terminale obligatoire des plans de dev | (session) | Jamais invoquée (comme skill) malgré le rappel SessionStart — à réhabiliter via l'orchestrateur |
| `pptx-framed-image` | Remplir les cadres photo d'un template PPT — étape conditionnelle du playbook `export-ppt-verifie` | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — n=0 en direct ≠ mort (usage via le sous-agent, § Bundle PPT) ; pertinence : `reference_octo_cadre_frame_layout.md` (cadre = shape du slideLayout) |
| `slide-text-polish` | Lint de la qualité rédactionnelle des slides — étape conditionnelle du playbook `export-ppt-verifie` | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — n=0 en direct ≠ mort (usage via le sous-agent, § Bundle PPT) ; pertinence : `feedback_pas_d_abreviations_cryptiques.md` (indicateurs en clair dans les livrables client) |
| `restitution-ppt` | Générer/améliorer le PPT de restitution (US6.4) — structure du deck lue par le sous-agent `ppt-designer` (§ Bundle PPT) | Synchrone | (session) | **Référence du bundle `ppt-designer`** — n=0 en direct ≠ mort : la génération réelle passe par le sous-agent (§ Bundle PPT) |
| `deck-design-library` | Choisir la FORME d'une slide à partir de son intention (22 patterns de decks OCTO réels) — à lire AVANT de dessiner/retravailler une slide | Synchrone | (session) | **Bibliothèque du bundle `ppt-designer`** — importée de VSCode2 le 2026-07-23 |
| `deck-design-review` | Revue de design du deck ENTIER, contrat par type de slide (couverture, vue, radar, progression, forts, attention) — avant de déclarer un changement de design terminé | Synchrone | (session) | **Vérification du bundle `ppt-designer`** — importée de VSCode2 le 2026-07-23 (adaptée au deck 5-slides-par-bloc de ce projet) |
| `agent-orchestrator` | Point d'entrée des demandes multi-étapes/multi-agents (hook `UserPromptSubmit` **branché** le 2026-07-21 — grille de qualification sur chaque prompt non-slash) | Synchrone | (session) | Neuf (import 2026-07-21) |
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

**Déclencheur de routage = la colonne qui compte** (ajoutée le 2026-07-28, constat #3 du
superviseur). Le diagnostic montrait 11 des 17 agents à 0 invocation *alors que leurs cas
d'usage exacts s'étaient produits* les 07-24/07-25 (un audit, un refactor, de l'écriture de
tests) — tous traités en session principale. Cause : le catalogue disait ce que fait chaque
agent, jamais **à quel signal l'orchestrateur doit le proposer**. Règle : quand un
déclencheur ci-dessous matche, l'étape correspondante du plan est **déléguée** ; garder la
main en session principale reste possible mais devient une décision à écrire dans le
`notes` du run (`"resolution: inline <agent> — <raison>"`), pas un défaut silencieux.

| Agent | Rôle | Modèle par défaut | Déclencheur de routage (l'orchestrateur DOIT le proposer si…) | Usage mesuré |
| --- | --- | --- | --- | --- |
| `ppt-designer` | Génère/améliore le deck PPT de restitution, vérifie par rendu réel — **nœud central du bundle PPT** (voir § ci-dessous) | (thread) | Le livrable est le deck (playbook `export-ppt-verifie`) | Utilisé (×3, dernier 2026-07-21) — le canal réel de génération PPT |
| `ui-designer` | Système visuel, tokens de design | (thread) | Harmonisation visuelle d'écrans, définition de tokens/composants | Utilisé (×2) |
| `ux-designer` | User flows, spécifications UX | (thread) | Nouveau parcours utilisateur, friction signalée sur un écran | Utilisé (×2) |
| `documentarian` | Doc technique/fonctionnelle, wiki | (thread) | Rédaction/refonte de doc dépassant le recalage de quelques lignes | Utilisé (×1) |
| `onboarder` | Découverte d'un projet existant, wiki initial | (thread) | Arrivée sur un projet/périmètre inconnu | Utilisé (×1) |
| `reviewer` | Revue de diff structurée | opus | **Règle R3** : diff de code produit `app/` non trivial avant commit — le seul cas où l'auto-relecture ne fait pas le gate | Utilisé (×1, 2026-07-21) |
| `qa-engineer` | Tests manquants (unitaires, intégration, E2E) | (thread) | **Règles R1/R2** : correction de bug sans test de régression, ou nouveau comportement (route/service/page) sans test qui l'exerce | Jamais invoqué |
| `auditor` (+ `auditor-subagent`) | Audit multi-domaine (sécurité, perf, a11y, éco-conception, archi, privacy) / sous-agent lecture seule | (thread) / haiku | Demande d'audit, passe « risque technique/performance », revue de sécurité d'un périmètre | Jamais invoqués — *alors qu'un audit a produit des findings le 2026-07-24 (`cbe7e4f`)* |
| `developer-refactor` | Refactoring : extraction, renommage, mutualisation — ne touche pas la logique métier | (thread) | Mutualisation/extraction/renommage à iso-comportement (ex. `a3e41b3`, `c04eb96`) | Jamais invoqué |
| `developer` | Implémentation générique (domaine précisé à l'invocation) | (thread) | Implémentation bornée délégable pendant qu'un autre chantier avance | Jamais invoqué |
| `developer-migrator` | Migration (framework, version majeure, dépendance, schéma) | (thread) | Montée de version, changement de dépendance ou de schéma SQLite | Jamais invoqué |
| `debugger` | Diagnostic de bug (analyse la cause, **ne corrige pas**) | (thread) | Bug signalé sans cause identifiée (stacktrace/log à instruire) | Jamais invoqué |
| `pathfinder` | Reconnaissance rapide, estimation de complexité (XS→XL) | sonnet | Demande dont le périmètre est flou avant de s'engager | Jamais invoqué |
| `planner` | Décompose en epics/tickets | sonnet | Chantier produit à découper (sinon BMAD pour le cadrage amont) | Jamais invoqué |
| `orchestrator` | Interface utilisateur, délègue selon le planner (Beads) | sonnet | **Aucun** — rôle assuré par `agent-orchestrator` (arbitré le 2026-07-21) | Jamais utilisé, volontairement |
| `orchestrator-dev` | Pilote le workflow Beads ticket par ticket | sonnet | **Aucun** — idem, sauf pilotage par tickets Beads explicitement demandé | Jamais utilisé, volontairement |

### Bundle PPT — `ppt-designer` + sa boîte à outils

`ppt-designer` n'a pas l'outil Skill : il consomme sa boîte à outils en
**lisant/exécutant leurs ressources** (cf. sa déf. « Skills you rely on »).
L'orchestrateur route tout livrable « deck de restitution » vers ce **bundle**,
via le playbook `export-ppt-verifie` — pas vers les skills isolément :

| Rôle dans le bundle | Skills | Nature de l'usage |
| --- | --- | --- |
| Génération (nœud central) | sous-agent `ppt-designer` | lance la génération, s'appuie sur les libs ci-dessous |
| Bibliothèques | `pptx-deck`, `restitution-ppt`, `deck-design-library` | lues (helpers python-pptx, structure du deck projet, 22 patterns de slides par situation — importé de VSCode2 le 2026-07-23) |
| Enrichissements (conditionnels) | `pptx-framed-image`, `slide-text-polish`, `restitution-deck-design` | scripts exécutés / référence suivie |
| Vérification (obligatoire) | `pptx-verify`, `deck-design-review` | rendu réel — jamais retiré ; revue contrat par slide du deck projet (importé de VSCode2 le 2026-07-23) |

Ces skills sont les `bibliotheque_reference` de `routing-hints.json` (constat
superviseur #2) : leur `n=0` en invocation directe ne vaut **pas** « mort » —
leur usage réel passe par `ppt-designer`, invisible au compteur d'invocations.
Enchaînement détaillé + contrats d'étape : playbook `export-ppt-verifie`.

## Familles sous condition

| Famille | Règle de routage |
| --- | --- |
| **BMAD (46 skills, 0 invocation à ce jour)** | Tri jamais fait sur ce projet (contrairement au projet source, qui l'a exécuté le 2026-07-18 — ne pas supposer un tri équivalent ici). Ne router que sur demande explicite de l'utilisateur, en passant par `bmad-help`. Candidat naturel du premier diagnostic `agent-supervisor`. |
| **`.opencode/skills/`** | Bibliothèque de protocoles chargée par les agents `.claude/agents/` (`skills:` → `.opencode/skills/…`) — conservée. Pas une cible de routage en soi. (`.opencode/agents/` a été supprimé le 2026-07-21.) |
| **`.claude/agents/orchestrator` + `orchestrator-dev` (Beads)** | Cf. tableau des flottes ci-dessus — rôle « point d'entrée » désormais assuré par `agent-orchestrator` (arbitré le 2026-07-21) ; ne pas les lancer en parallèle. Les agents-feuille qu'ils invoquent (`developer`, `reviewer`, `qa-engineer`…) restent routables individuellement sans ambiguïté. |

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
| `export-ppt-verifie` | Livrable = le deck : génération (`ppt-designer` ou code direct) + enrichissements conditionnels (`pptx-framed-image`, `slide-text-polish`, `restitution-deck-design`) + `pptx-verify` obligatoire + `revue-increment`. Porte aussi la **variante fan-out** de la revue (>12 slides ou >2 angles), absorbée de `revue-design-parallele` le 2026-07-28 | Manuel | Éprouvé (n=8, 7 succès) |
| `cycle-produit-bmad` | Cycle produit BMAD (brief→PRD→archi→epics→dev→review), clos par `revue-increment` | `generate_bmad_playbook.py` (regénérer depuis `_bmad/_config/bmad-help.csv`, ne pas éditer) | Jamais joué — sur demande explicite |
