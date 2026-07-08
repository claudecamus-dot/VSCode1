# Cadrage — comment limiter l'utilisation de tokens

> **But** : cadrer où les tokens Claude sont réellement dépensés sur ce projet et
> quels leviers les réduisent, sans dégrader la qualité. Document de cadrage
> (pas une procédure figée). Créé le 2026-07-08.

## 1. D'abord : distinguer runtime vs travail assisté

Le premier réflexe utile est de séparer deux mondes qui n'ont **rien à voir**
côté tokens :

- **Exécution de l'application (runtime)** — un animateur clique « exporter PPT ».
  Le pipeline `server.js` → Puppeteer → `python-pptx` est **100 % déterministe :
  zéro token Claude**. Idem pour toute l'app (Express + SQLite). Il n'y a donc
  **rien à optimiser côté tokens dans le produit lui-même**.
- **Travail de développement assisté par Claude** — c'est **là** que les tokens
  sont consommés : exploration de code, génération/itération, boucle de
  vérification, sous-agents. Tout l'enjeu est ici.

> Corollaire : « faire un programme qui n'utilise pas de tokens » n'a de sens que
> pour le **travail d'itération** (ex. régénérer un deck sans repasser par Claude),
> pas pour le runtime (déjà gratuit en tokens).

## 2. Les postes de dépense (travail assisté) et leurs leviers

| Poste | Ce qui coûte | Levier |
| --- | --- | --- |
| **Lecture de contexte** | Relire de gros fichiers (`server.js` 929 l.), transcripts | Outils dédiés (Grep/Glob ciblés) plutôt que `cat` ; lire les portions utiles ; s'appuyer sur le **wiki** et les **mémoires** au lieu de re-dériver |
| **Commandes shell verbeuses** | Sorties `git`, `npm`, `ls` massives | **RTK** (proxy déjà branché en hook `PreToolUse`) filtre et compacte — 60-90 % d'économie sur les ops dev. `rtk gain` pour mesurer |
| **Sous-agents** | Chaque agent démarre à froid et re-dérive le contexte | Ne lancer un sous-agent que si demandé/justifié ; préférer le travail inline quand le contexte est déjà chargé |
| **Boucle de vérification** | Rendus, captures, re-lectures | Vérifier une fois, au bon moment (rendu réel avant de conclure), pas en boucle |
| **Ré-explication** | Re-cadrer des décisions déjà prises | **Documenter les décisions** (wiki, `export/*.md`, mémoires) pour ne pas les rejouer |
| **Cache prompt** | TTL ~5 min ; un long silence casse le cache | Enchaîner les actions ; éviter les pauses inutiles de plusieurs minutes |

## 3. Ce qui est déjà en place

- **RTK** (Rust Token Killer) : hook global réécrivant les commandes
  (`git status` → `rtk git status`), transparent. Vérifier : `rtk gain`,
  `rtk discover` (repère les opportunités manquées dans l'historique).
- **Wiki vivant** (`docs/wiki.html` + `docs/wiki/`) et **mémoires projet** :
  réduisent la re-exploration à chaque session.
- **Pipeline d'export déterministe** : aucune dépendance LLM au runtime.

## 4. Pistes spécifiques « itérer sur le deck sans Claude »

Objectif : qu'une retouche de design (couleurs, marges, textes) ne nécessite pas
de repasser par l'agent.

- **Paramétrer le générateur** : externaliser les réglages de style dans un
  `params.json` (couleurs déjà largement dérivées du thème — cf. `template-octo.md`),
  pour qu'un humain ajuste sans régénérer via Claude.
- **Aperçu rapide non-LLM** : un rendu PowerPoint COM/LibreOffice piloté par un
  script (déjà utilisé pour la vérif) sert d'aperçu — pas besoin de Claude pour
  « voir » le résultat.
- **Tests géométrie + lint** en CI (`test-export-ppt.py`, `slide_lint`) :
  attrapent les régressions sans intervention LLM.

## 5. Ce qu'on ne sacrifie pas

Réduire les tokens **ne doit pas** rogner sur : la vérification par rendu réel
(un défaut visuel ne se voit qu'au rendu), la qualité rédactionnelle, ni la
fidélité au template. L'optimisation porte sur le **gaspillage** (relectures,
re-dérivation, sorties verbeuses), pas sur les étapes de qualité.

## 6. À explorer (reprise de session)

- Mesurer la répartition réelle via `rtk gain --history` et `rtk discover`.
- POC `params.json` + aperçu non-LLM pour l'itération design du deck.
- Évaluer le coût des sous-agents sur les dernières sessions (inline vs délégué).

*Lié : `~/.claude/RTK.md` (référence RTK), [`wiki.html`](wiki.html),
[`../export/points-amelioration-ppt.md`](../export/points-amelioration-ppt.md).*
