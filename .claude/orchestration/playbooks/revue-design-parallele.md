# Playbook `revue-design-parallele` — N angles de revue en fan-out

Pattern porté depuis le projet source (Interview-to-Deck/VSCode2, import du 2026-07-21) :
N sous-agents de revue lancés en parallèle sur des angles distincts (ex. parcours
utilisateur, cohérence visuelle, contenu, accessibilité), consolidés ensuite en une liste
de correctifs concrets priorisés. **Statut `jamais-joue` sur ce projet** — aucune
exécution réelle de ce pattern n'a été retrouvée dans l'historique git ni dans les
transcripts scannés par `agent-supervisor` à ce jour ; le proposer avec prudence
explicite, ne pas l'annoncer comme éprouvé tant qu'il n'aura pas tourné ici.

Règles du mode parallèle (cf. `docs/reflexions/agent-orchestrateur.md` §5) : angles
réellement indépendants, lecture seule pendant le fan-out, ≤ 4 sous-agents,
consolidation obligatoire — chaque sous-agent repart d'un contexte froid facturé, exiger
des rapports courts et structurés.

**Garde exhaustivité** (leçon portée depuis le projet source, où elle a été payée
concrètement) : un fan-out d'`Explore` lit des *extraits*, pas des fichiers entiers — il
ne garantit jamais l'exhaustivité. Quand le fan-out sert à recenser toutes les
références à des identifiants **avant une suppression/renommage**, la consolidation DOIT
se terminer par une garde déterministe : un `grep -r` (ou l'outil Grep) de chaque
identifiant retiré sur tout le dépôt, dont le résultat **prime** sur les rapports des
sous-agents. Ce projet a un précédent direct et adjacent : le tri des skills BMAD ou
tout nettoyage de fichiers versionnés (agents `.opencode/`, skills `.claude/skills/`)
sont exactement le genre d'opération où un fan-out incomplet + absence de grep final
peut faire rater une référence.

```json
{
  "nom": "revue-design-parallele",
  "description": "Revue UX/design (ou revue multi-angles d'un livrable) par fan-out de sous-agents en lecture seule, puis consolidation en backlog d'actions priorisées.",
  "statut": "jamais-joue",
  "source": "manuel",
  "declencheurs": [
    "revue UX/UI indépendante d'un ensemble d'écrans (app/src/public/)",
    "passer en revue X sous plusieurs angles",
    "audit d'un livrable selon des dimensions distinctes (design, contenu, cohérence, parcours)"
  ],
  "etapes": [
    {
      "id": "definition-angles",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "2 à 4 angles réellement indépendants définis, avec pour chacun le périmètre à lire et le format de rapport attendu (constats courts + gravité)"
      },
      "checkpoint": false
    },
    {
      "id": "fan-out-revue",
      "agent": "Explore",
      "mode": "parallele",
      "modele": "sonnet",
      "fan_out_max": 4,
      "contrat": {
        "type": "deterministe",
        "critere": "un rapport court par angle reçu (jamais anticipé/fabriqué), lecture seule respectée — aucune écriture par les sous-agents"
      },
      "checkpoint": false
    },
    {
      "id": "consolidation",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "constats dédoublonnés et priorisés en un backlog d'actions concrètes, contradictions entre angles arbitrées explicitement. SI le but du fan-out était une énumération exhaustive avant suppression/renommage : garde déterministe finale OBLIGATOIRE — grep -r (ou l'outil Grep) de chaque identifiant retiré sur tout le dépôt, dont le résultat PRIME sur les rapports des sous-agents (qui ne lisent que des extraits)."
      },
      "checkpoint": "restituer le backlog à l'utilisateur avant d'appliquer le moindre correctif — la revue est le livrable, les fixes sont un mandat séparé"
    }
  ],
  "regle_reprise": "une relance ciblée par étape en échec de contrat (sous-agent muet ou hors format : une seule relance du sous-agent concerné), puis escalade utilisateur avec l'état réel"
}
```
