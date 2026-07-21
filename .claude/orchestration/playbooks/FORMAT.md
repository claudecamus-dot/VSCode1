# Format de playbook (incrément O-B)

Un playbook = un fichier `*.md` de ce dossier décrivant un workflow récurrent de façon
déclarative. La partie machine est un bloc ` ```json ` unique (parsé par la skill
`agent-orchestrator`) ; le reste du fichier est de la prose libre (contexte, précédents,
limites). Conception : `docs/reflexions/agent-orchestrateur.md` §4 (brique 3) et §10
(incrément O-B) — doc de référence portée depuis le projet source, voir son en-tête.
Sur ce projet, la suite de tests Python du superviseur/orchestrateur (qui validait ce
format dans le projet source) n'a pas été portée : l'écosystème de tests ici est
`npm test` (node:assert/strict), pas pytest — voir `docs/reflexions/agent-orchestrateur.md`
en-tête pour ce choix.

## Champs du bloc JSON

| Champ | Valeurs | Rôle |
| --- | --- | --- |
| `nom` | slug = nom du fichier sans `.md` | Identité du playbook |
| `description` | texte court | Ce que le workflow accomplit |
| `statut` | `eprouve` \| `jamais-joue` | Garde-fou « playbooks morts » : `eprouve` exige au moins une exécution réelle réussie du workflow (précédent cité dans la prose) ; un `jamais-joue` se propose avec prudence explicite |
| `source` | `manuel` \| `genere:<script>` | Un playbook `genere:*` ne s'édite jamais à la main — modifier le script et regénérer |
| `declencheurs` | liste de textes | Indices de matching pour l'étape « Composer » de la skill |
| `etapes` | liste ordonnée (voir ci-dessous) | Le plan lui-même |
| `regle_reprise` | texte | Toujours : une relance ciblée par étape en échec de contrat, puis escalade utilisateur avec l'état réel — jamais de boucle de retry |

## Champs d'une étape

| Champ | Valeurs | Rôle |
| --- | --- | --- |
| `id` | slug unique dans le playbook | Référence (journal, diagnostic superviseur) |
| `agent` | agent/skill du catalogue, ou `session principale` | Qui exécute |
| `mode` | `cascade` \| `parallele` \| `asynchrone` | La dépendance de données décide (§5 de la conception) |
| `modele` | `haiku` \| `sonnet` \| `opus` \| `fable` \| `(session)` \| `(thread)` | Sous-agents uniquement ; `(session)` pour tout ce qui tourne inline ; `(thread)` pour un sous-agent du fleet `.claude/agents/` sans `model:` déclaré en frontmatter (hérite du modèle de la session appelante — cf. catalogue) |
| `fan_out_max` | entier ≤ 4 | Obligatoire si `mode` = `parallele` |
| `contrat` | objet `{type, critere[, commande]}` | Vérifié avant de passer à l'étape suivante. `type` : `deterministe` (fichier attendu présent, commande verte — préférer) \| `reel` (rendu regardé par un humain/screenshot : `run`, `pptx-verify`) \| `llm` (dernier recours) |
| `checkpoint` | `false` \| texte (raison) | Validation utilisateur obligatoire avant de continuer — toujours non-`false` avant une action irréversible (commit, suppression, publication) |

Une étape `parallele` doit être suivie d'une étape de consolidation en `cascade`
(jamais d'écritures concurrentes sur les mêmes fichiers). Un playbook de dev se termine
par l'étape `revue-increment` (leçon superviseur : « jamais invoquée » — rendue
structurelle ici).

## Exécution et journal

La skill instancie le playbook (adapte les étapes à la demande, sans en retirer les
vérifications obligatoires ni les checkpoints), le suit avec TodoWrite, vérifie chaque
contrat, et journalise le run dans `runs.jsonl` avec `"playbook": "<nom>"` dans les notes
ou le plan — c'est ce qui permettra au superviseur (étage 2 / incrément O-C) de mesurer
le taux de réussite par playbook et de remonter les playbooks jamais joués.
