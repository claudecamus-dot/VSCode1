---
updated: 2026-07-31
generated-by: .claude/supervision/scan_transcripts.py (superviseur d'agents, étage 1)
---

# Supervision des agents — tableau de bord d'usage

> ⚠️ **Page générée automatiquement** (hook SessionStart → `.claude/supervision/scan_transcripts.py`).
> **Ne pas éditer à la main** — toute modification serait écrasée au prochain scan.
> Conception et phasage : [../../reflexions/agent-superviseur.md](../../reflexions/agent-superviseur.md).

Dernier scan : 2026-07-31T16:17:21+02:00 · **18 sessions** (transcripts) · **34** invocations de skills · **11** lancements de sous-agents.

## Skills — usage réel

| Skill | Famille | Invocations | Première | Dernière |
| --- | --- | --- | --- | --- |
| `agent-orchestrator` | projet | 9 | 2026-07-21 | 2026-07-28 |
| `agent-supervisor` | projet | 7 | 2026-07-21 | 2026-07-28 |
| `revue-increment` | projet | 6 | 2026-07-21 | 2026-07-28 |
| `run` | (builtin/session) | 5 | 2026-07-01 | 2026-07-28 |
| `pptx-verify` | global | 3 | 2026-07-01 | 2026-07-21 |
| `artifact-design` | (builtin/session) | 2 | 2026-07-07 | 2026-07-21 |
| `roadmap-keeper` | global | 1 | 2026-07-01 | 2026-07-01 |
| `skill-creator` | global | 1 | 2026-07-07 | 2026-07-07 |

## Sous-agents

| Sous-agent | Lancements | Premier | Dernier |
| --- | --- | --- | --- |
| `ppt-designer` | 3 | 2026-07-08 | 2026-07-21 |
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

`deck-design-library`, `deck-design-review`, `pptx-deck`, `pptx-framed-image`, `restitution-deck-design`, `restitution-ppt`, `slide-text-polish`

## TODO agents (constats automatiques)

_(aucun constat — rien à signaler sur les données actuelles)_

## Arbitrages enregistrés

_Constats clos par décision humaine (`.claude/supervision/arbitrages.json`) — l'usage réel reste mesuré ci-dessus._

- **`revue-increment`** (2026-07-21) : Constat #1 (vérif de fin d'incrément systématiquement sautée) accepté. Réponse retenue : un garde-fou au COMMIT plutôt que de forcer l'invocation de revue-increment — hook PreToolUse .claude/hooks/warn_verif_before_commit.py, non bloquant, ciblé app/, silencieux si une vraie vérif (npm test / pptx-verify / revue-increment) a tourné dans la session. La vérif est ainsi rappelée au bon instant ; l'usage réel de revue-increment reste mesuré et re-challengeable.
- **`famille:BMAD`** (2026-07-21) : Constat #3 : 46 skills BMAD à 0 usage à J+5 (installés le 2026-07-16). Décision d'OBSERVATION (pas de tri tranché maintenant) : BMAD n'est pas routé par défaut — déjà le cas, l'orchestrateur n'y route que sur demande explicite via bmad-help. Revue datée à l'échéance 2026-08-16 : si toujours 0 usage réel mesuré, désinstaller / mettre en sommeil en bloc plutôt que skill par skill. NB : la flotte canonique a été arbitrée le 2026-07-21 — .claude/agents/ est la flotte de rôles canonique (gate agent-orchestrator branché en UserPromptSubmit), BMAD conservé pour le cycle produit uniquement (cf. CLAUDE.md § Skills & agents). Décision réversible, re-challengeable par le superviseur avec des données nouvelles.
- **`export-ppt-verifie`** (2026-07-21) : Constat interaction (2026-07-21) : la revue design du deck re-note d'un run à l'autre les mêmes décisions produit non tranchées (radar vs tableau, contraste GOLD) au lieu de les forcer. ACCEPTÉ + APPLIQUÉ : ajout de l'étape `gate-decision-produit` (checkpoint) au playbook export-ppt-verifie — une passe qui bute sur une décision produit non tranchée produit UNE décision explicite à arbitrer (options rendues RÉELLEMENT + reco) et suspend le rework gated jusqu'à l'arbitrage utilisateur, au lieu de re-noter le blocage.
- **`pptx-verify`** (2026-07-21) : Constat verification-manquante (2026-07-21) : aucune étape du loop design ne vérifie le contraste WCAG des libellés ; le GOLD #b8860b (3.25:1 < AA 4.5:1) colore les libellés d'axe, partagé web (resultats.html/pilotage.html) + PPT (_dessiner_radar). ACCEPTÉ, implémenté DANS le chantier #2 (revue design radar) : ajout d'un check de contraste (luminance relative WCAG, seuil 4.5:1) sur les couleurs de libellés, palette pilier comme source unique testée par les deux surfaces. La VALEUR du GOLD (assombrir ou garder) reste tranchée dans le chantier #2 sur rendu réel (#2d), pas ici.
- **`export-ppt-verifie`** (2026-07-22) : Constats interaction + ko-repete (2026-07-22) : la revue design du deck a été déclarée « close » puis ré-ouverte 8+ fois — « succès » mesurait travail fait + rendu OK à MES yeux + tests verts + commit, pas l'intention design de l'utilisateur atteinte ; et des éléments à options (réglette des paliers, police) ont été implémentés-puis-commités au lieu d'être choisis sur variantes. ACCEPTÉ + APPLIQUÉ (demande utilisateur « créer des Rules »). Deux règles ajoutées au playbook export-ppt-verifie ET au skill pptx-verify (Step 6) : (1) VALIDATION UTILISATEUR AVANT COMMIT — un changement design-intent ne se commite/déclare 'fait' qu'après validation du rendu réel par l'utilisateur (étape `validation-utilisateur`, checkpoint dur) ; (2) VARIANTES RENDUES AVANT DE CHOISIR — un élément à options de layout (placement/orientation/échelle/présence) se tranche sur 2-3 variantes rendues avant d'implémenter. Mémoire feedback_validation_rendu_avant_commit_ppt.
- **`ppt-designer`** (2026-07-23) : Constat interaction (2026-07-23) : le seul run partiel de l'historique (2026-07-22 02:10) avait son sous-agent ppt-designer NON REPRENABLE (transcript expiré) -> correctifs rapatriés en session principale, 4 constats finis au run suivant. ACCEPTÉ + APPLIQUÉ : playbook export-ppt-verifie amendé (prose + contrat de l'étape generation) — toute délégation (génération OU revue) au ppt-designer exige, dès le 1er retour et en un seul passage, une LISTE DE FINDINGS AUTOSUFFISANTE (constat + localisation fichier/fonction ou n° de slide + correctif proposé), exploitable sans rappeler l'agent. Corollaire de la mémoire feedback_seconde_vague_chasseurs_adversariaux.
- **`revue-increment`** (2026-07-23) : Constat verification-manquante (2026-07-23) : ~8 runs deck du 2026-07-22 listaient revue-increment en étape terminale mais le skill n'a pas été chargé depuis le 2026-07-21, alors que ~14 commits deck du 07-22 touchaient du code produit (export-restitution-ppt.py, server.js) — le hook de commit était satisfait par pptx-verify seul. ACCEPTÉ + APPLIQUÉ : le contrat de l'étape revue-increment du playbook export-ppt-verifie pose désormais que pptx-verify (rendu vérifié) NE VAUT PAS la boucle DoD complète — sur un commit de code produit, soit revue-increment est réellement exécutée, soit une DoD allégée « rendu vérifié seul » est assumée ET écrite dans le champ notes du run (jamais sautée en silence). Le garde-fou du 2026-07-21 (hook warn_verif_before_commit) reste, il couvre le commit ; ce constat couvre la boucle d'amélioration distincte.
- **`export-ppt-verifie`** (2026-07-23) : Constat inefficacite (2026-07-23, repris de VSCode2 #3) : la boucle de rendu (rendu->défauts->correction->re-rendu) était comptée comme reprise — ici 3 reprises/8 runs + pptx-verify 5/11, moins intense que côté VSCode2 (100%). ACCEPTÉ + DÉJÀ MITIGÉ dans la même session (import des apprentissages VSCode2) : le playbook déclare la boucle de rendu NOMINALE avec un budget de 2 itérations, seul le hors-budget compte comme reprise. À surveiller au prochain scan : re-baseliner reprises ; si élevé hors boucle de rendu, rouvrir en vraie inefficacité.
- **`agent-orchestrator`** (2026-07-28) : Constat interaction (2026-07-28) : chaîne gate -> orchestrateur -> journalisation rompue depuis le 2026-07-23 (runs.jsonl figé, ~10 commits livrés depuis, hook UserPromptSubmit pourtant branché) ; conséquence : prudence/trous_catalogue/verifications_oubliees vides = faux négatifs, l'étage 1 ne mesure plus rien. ACCEPTÉ + APPLIQUÉ : la journalisation devient non-oubliable au lieu d'être déclarative — warn_verif_before_commit.py porte un 2nd avertissement (non bloquant) qui tombe sur un commit app/ sans run journalisé (log_run.py détecté dans le transcript), sans revue-increment et sans DoD assumée dans le message. Les stats plan-vs-réel redeviennent alimentées ou, à défaut, le trou est visible dans git.
- **`revue-increment`** (2026-07-28) : Constat verification-manquante (2026-07-28, RÉCIDIVE du constat du 2026-07-23) : revue-increment inutilisée depuis le 2026-07-21 malgré 4 commits de code produit les 07-24/07-25, et le contrat C2 du 07-23 (tracer la DoD allégée dans les notes du run) inapplicable puisque aucun run n'était journalisé. ACCEPTÉ + APPLIQUÉ : la trace de definition-of-done passe de l'artefact OPTIONNEL (run) à l'artefact OBLIGATOIRE (commit). Trois sorties acceptées par le hook : revue-increment réellement lancée, run journalisé, ou DoD assumée par écrit dans le message de commit (« DoD allégée : … ») — re-vérifiable par le superviseur via git log. Le contrat de l'étape revue-increment de dev-verifie l'inscrit aussi. Des tests verts ne valent PAS une DoD.
- **`flotte:.claude/agents`** (2026-07-28) : Constat agent-mort (2026-07-28) : 11 des 17 agents de la flotte canonique à 0 invocation alors que leurs cas d'usage exacts (audit cbe7e4f, refactor a3e41b3/c04eb96, écriture de tests 1c89950) se sont produits les 07-24/07-25 en session principale. ACCEPTÉ + APPLIQUÉ (demande utilisateur : « assure-toi que les agents non invoqués soient reliés à agent-orchestrator ») : (1) le catalogue porte désormais une colonne DÉCLENCHEUR DE ROUTAGE par agent — le manque n'était pas la description du rôle mais le signal d'appel ; (2) le playbook dev-verifie porte 3 étapes déléguées conditionnelles réelles : qa-engineer (R1/R2, tests manquants), reviewer (R3, revue de diff avant commit), auditor (passe risque/perf/sécurité) ; (3) garder la main en session principale reste permis mais s'écrit dans les notes du run (« resolution: inline <agent> — <raison> »). orchestrator et orchestrator-dev restent volontairement sans déclencheur (rôle assuré par agent-orchestrator, arbitrage du 2026-07-21). Re-mesurable au prochain scan : si toujours 0 usage au 2026-08-16, mise en sommeil groupée.
- **`revue-design-parallele`** (2026-07-28) : Constat agent-mort (2026-07-28) : playbook jamais joué depuis son import du 2026-07-21 alors que 8 revues design réelles ont eu lieu, toutes via export-ppt-verifie. ACCEPTÉ + APPLIQUÉ : fusion plutôt que perte — le pattern devient la VARIANTE FAN-OUT de l'étape design-review d'export-ppt-verifie (>12 slides ou >2 angles : 2 à 4 sous-agents lecture seule, un angle chacun, consolidation obligatoire), avec sa garde exhaustivité conservée (grep -r déterministe qui prime sur les rapports des sous-agents avant toute suppression/renommage). Le playbook autonome est retiré (fichier supprimé, ligne retirée du catalogue et de la table de la skill ; historique git conservé) — un chemin de moins à choisir au moment de qualifier.
- **`flotte .claude/agents/`** (2026-07-29) : ACCEPTÉ + APPLIQUÉ (hub, « traite les actions correctives identifiées pour VSCode1 ») : entrée à la CIBLE EXACTE du finding — l'arbitrage du 2026-07-28 existait déjà sous la cible sœur « flotte:.claude/agents » mais le filtre du scan compare en égalité de chaîne, le finding restait donc affiché ouvert (même mécanisme que bmad-catalogue-codex, 2026-07-27). Vérifié sur l'état réel (R1) : la remédiation (1) est DÉJÀ appliquée — dev-verifie.md porte les étapes déléguées réelles qa-engineer (tests) et auditor (passe risque) au lieu de « session principale » ; AUCUN geste refait. La décision (2) reste datée : si toujours 0 usage des 11 agents au 2026-08-16 (échéance commune à la revue BMAD), mise en sommeil groupée du sous-ensemble jamais appelé — décision unique, pas au fil de l'eau.
- **`veille:voltagent-subagents`** (2026-07-29) : ACCEPTÉ + APPLIQUÉ (commande « adopte » — choix utilisateur explicite parmi 4 trouvailles proposées) : le référentiel public des 154 sous-agents a servi de GRILLE DE COMPARAISON pour la flotte de 17 sous-agents de VSCode1, pas de source à copier. Cadrage réel d'abord (R1) : les 17 agents locaux couvrent audit (2), debug, dev (3 variantes), doc, onboarding, orchestration (2), reconnaissance, planification, deck, QA, revue, UI et UX. Confrontés aux 10 catégories du référentiel, les manques réels sont : sécurité (cat. 04 — security-auditor, penetration-tester), accessibilité (accessibility-tester), données (data-analyst, database-optimizer). GREFFE VOLONTAIREMENT MINIMALE — UN SEUL agent ajouté : le finding agent-mort du 2026-07-28 mesure que 11 des 17 agents n'ont JAMAIS été invoqués ; importer en masse aurait aggravé exactement ce que la flotte cherche à réduire. Le critère retenu pour greffer : un cas d'usage DATÉ et IMMINENT. Un seul le remplit — la sécurité : l'API expose des données nominatives sans aucune authentification (audit du 2026-07-25, seule dimension d'audit non verte du projet), avec une échéance de conception au 2026-08-08. .claude/agents/security-auditor.md créé, RÉÉCRIT pour le canal réel de VSCode1 (R3 : Express/node:sqlite/exports PPT, pas un copier-coller du référentiel) : lecture seule stricte, rapport localisé fichier:ligne par sévérité, preuve exigée (requête réelle plutôt que supposition), rattachement des remédiations aux US de l'Epic 10 — et deux interdits explicites hérités des arbitrages : ne jamais proposer de barrière d'authentification improvisée (Basic Auth et jeton d'API ont été écartés le 2026-07-25), ne jamais déclarer la dimension sécurité résolue sur un correctif partiel. Vérifié : les 4 SKILL.md cités et les 3 chemins de code cités existent tous. Les 3 autres manques (accessibilité, données) restent NON greffés : pas de cas d'usage daté — ils alimentent la décision de tri groupée du 2026-08-16, qui tranchera la mise en sommeil des agents jamais appelés.

## Diagnostic qualitatif (étage 2 — `agent-supervisor`)

_Diagnostic à jour — rien à signaler, tous les constats précédents ont été arbitrés._

_4 constat(s) de ce diagnostic écarté(s) par un arbitrage — pour en rouvrir un, demander au superviseur un `re_challenge` avec des données nouvelles :_

- ~~Chaine gate -> orchestrateur -> journalisation rompue depuis le 2026-07-23 : ~10 commits livres, 0 run journalise, donc etage 1 aveugle (prudence/trous_catalogue vides = faux negatifs, pas bonne sante)~~ (`agent-orchestrator`)
- ~~RECIDIVE du constat du 2026-07-23 : revue-increment n'a pas tourne depuis le 2026-07-21 alors que 4 commits de code produit ont ete livres les 07-24/07-25 - et le contrat C2 arbitre le 07-23 (tracer la DoD allegee dans les notes du run) est inapplicable puisque aucun run n'est journalise~~ (`revue-increment`)
- ~~11 des 17 agents de la flotte declaree canonique le 2026-07-21 n'ont JAMAIS ete invoques - alors que leurs cas d'usage exacts (audit, refactor, tests) se sont produits les 07-24/07-25 et ont ete traites en session principale~~ (`flotte .claude/agents/`)
- ~~Playbook revue-design-parallele : jamais joue depuis son import du 2026-07-21, alors que 8 revues design reelles ont eu lieu depuis - elles ont toutes pris export-ppt-verifie~~ (`revue-design-parallele`)

---

_Étage O-C (croisement modèle × tâche × reprises, exploitation de `runs.jsonl`) : voir `.claude/orchestration/routing-hints.json`, régénéré à chaque session._
