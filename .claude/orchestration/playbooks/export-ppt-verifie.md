# Playbook `export-ppt-verifie` — travaux sur le deck de restitution, vérifiés au rendu réel

La chaîne PPT complète du projet, rendue structurelle : produire ou faire évoluer le deck
de restitution (US6.4 — via `app/scripts/pptx_deck.py`/`export-restitution-ppt.py`, le
skill projet `restitution-ppt`, ou le sous-agent `ppt-designer`), enrichir si pertinent
(cadres photo du template, qualité rédactionnelle), puis **toujours** vérifier au rendu
réel — python-pptx est un parseur tolérant, un fichier qui parse peut ne pas s'ouvrir
correctement dans PowerPoint (mémoire `reference_rendu_pptx_verification.md` : PowerPoint
COM est la seule voie fiable de rendu image sur ce poste, LibreOffice/poppler incomplets).

Précédent (statut `eprouve`) : génération réelle constatée sur plusieurs commits (vectorisation
du radar, tests de charte — cf. `git log`), sous-agent `ppt-designer` invoqué ×2, skill
`pptx-verify` invoqué ×1 (2026-07-01) — la colonne vertébrale génération → vérification
rendu est une pratique réelle du projet, même si elle est passée par des canaux différents
de ceux du projet source de ce playbook (qui utilisait directement les skills globaux
`pptx-deck`/`pptx-verify` en paire). Les trois étapes conditionnelles s'appuient sur des
skills **jamais utilisées à ce jour** (`pptx-framed-image`, `slide-text-polish`,
`restitution-deck-design`) — leur pertinence ne repose pas sur un historique d'usage mais
sur des mémoires réelles du projet (`reference_octo_cadre_frame_layout.md`,
`feedback_pas_d_abreviations_cryptiques.md`, `project_fidelite_charte_ppt.md`/
`reference_octo_design_system_html.md`) : les proposer avec prudence explicite et
vérifier leur résultat au rendu.

Frontière avec `dev-verifie` : si la demande est un changement de code générique (routes,
services, pages web), c'est `dev-verifie` qui s'applique — ce playbook-ci est la version
spécialisée quand le **livrable est le deck lui-même** (layout, contenu, visuel). Les deux
partagent l'obligation `pptx-verify` et la terminaison `revue-increment`.

**Gate de décision produit** (ajouté 2026-07-21, constat superviseur `interaction`) : une passe
de vérification/design qui bute sur une **décision produit non tranchée** (radar vs tableau,
valeur d'une couleur de palette, contraste…) ne doit pas re-noter le blocage run après run —
elle produit **UNE décision explicite à arbitrer** (options **rendues réellement**, jamais en
ASCII — cf. `feedback_brainstorm_iteratif.md` — assorties d'une recommandation) et **suspend le
rework gated** jusqu'à l'arbitrage utilisateur. Matérialisé par l'étape `gate-decision-produit`
(checkpoint), en amont de `revue-increment`.

**Deux règles anti-non-convergence** (ajoutées 2026-07-22, constat superviseur `interaction`
`ko-repete` : la revue design du deck a été « close » puis ré-ouverte 8+ fois — le mot
« succès » mesurait *travail fait + rendu OK à MES yeux + tests verts + commit*, pas
*l'intention design de l'utilisateur atteinte*). Ces deux règles sont **le cœur du playbook**,
pas des options :

1. **Validation utilisateur AVANT commit** — pour tout changement d'**intention design**
   (layout, taille de police, position/présence d'un élément, couleur — *pas* un correctif de
   géométrie/bug), la *definition-of-done* du livrable est **la validation du rendu réel par
   l'utilisateur**, jamais « tests + géométrie verts ». **Ne jamais committer** un tel
   changement, ni le déclarer « fait / clos », tant que l'utilisateur n'a pas vu le rendu réel
   et validé. Matérialisé par l'étape `validation-utilisateur` (checkpoint dur), en amont de
   `revue-increment`/commit.
2. **Variantes RENDUES avant de choisir** — quand la demande porte sur le **placement /
   l'orientation / l'échelle / la présence** d'un élément (élément à options de layout), rendre
   **2-3 variantes en images** et les faire arbitrer **avant** d'écrire la version de
   production — pas « implémenter une version → committer → attendre la réaction » (c'est ce
   cycle qui a fait entrer/sortir/re-entrer la réglette des paliers et re-toucher la police).
   La mémoire `feedback_brainstorm_iteratif.md` (« mockups RÉELS ») s'applique au **choix**,
   pas seulement à la validation *a posteriori*.

**Boucle de rendu nominale et budgétée** (ajoutée 2026-07-23, constat superviseur VSCode2
`inefficacite` repris ici : 7/7 runs du playbook comptés « avec reprises » alors que chaque
« reprise » était une itération attendue de la boucle de rendu — la stat ne mesurait plus
rien) : la séquence **rendu de contrôle → liste de défauts → correction → re-rendu** est
l'étape nominale de `verification-rendu`, avec un budget de **2 itérations maximum** avant
escalade à l'utilisateur (défauts restants montrés en images). Le champ `reprises` du run
journalisé ne compte que ce qui **sort** de ce budget (imprévu, échec de contrat) — pas les
itérations de design dans le budget.

**Délégation au sous-agent `ppt-designer` = sortie autosuffisante** (ajoutée 2026-07-23,
constat superviseur `interaction` : le seul run `partiel` de l'historique — 2026-07-22 02:10 —
a eu son sous-agent `ppt-designer` **non reprenable, transcript expiré**, forçant à rapatrier
les correctifs en session principale et à finir 4 constats au run suivant). Quand une
génération **ou une revue** est déléguée au `ppt-designer`, exiger de lui, **dès son premier
retour et en un seul passage**, une **liste de findings structurée et autosuffisante** — pour
chaque défaut : *constat + localisation (fichier + fonction, ou n° de slide) + correctif
proposé* — de sorte que la correction se fasse **sans le rappeler**. Ne jamais pipeliner une
2ᵉ sollicitation de l'agent en comptant sur son contexte : son transcript peut avoir expiré.
Corollaire de la mémoire `feedback_seconde_vague_chasseurs_adversariaux` (une sortie d'agent
de revue doit être exploitable telle quelle, sans re-sollicitation).

**`pptx-verify` (rendu vérifié) ≠ `revue-increment` (definition-of-done)** (ajoutée
2026-07-23, constat superviseur `verification-manquante` : ~8 runs deck du 2026-07-22 listaient
`revue-increment` en étape terminale, mais le skill n'a pas été chargé depuis le 2026-07-21
alors que ~14 commits deck du 07-22 touchaient du code produit — le hook de commit était
satisfait par `pptx-verify` seul). Un rendu réel qui passe **ne vaut pas** la boucle DoD
complète (revue de code + `simplify` + capitalisation mémoire). Sur un commit touchant du
**code produit** (`export-restitution-ppt.py`, `pptx_deck.py`, `server.js`…), il faut **soit**
exécuter réellement la boucle `revue-increment`, **soit** assumer une DoD allégée « rendu
vérifié seul » **et l'écrire explicitement dans le champ `notes` du run journalisé** — jamais
la sauter en silence ni la créditer faussement (voir contrat de l'étape `revue-increment`).

**Variante fan-out de la revue** (absorbée le 2026-07-28 depuis le playbook
`revue-design-parallele`, constat #4 du superviseur : jamais joué en 7 jours alors que
8 revues design réelles ont toutes pris ce playbook-ci — un chemin de moins à choisir au
moment de qualifier, le pattern conservé là où il sert). Quand la revue porte sur **plus de
~12 slides** ou sur **plus de 2 angles réellement indépendants** (parcours/lecture,
cohérence visuelle, contenu rédactionnel, accessibilité), l'étape `design-review` s'instancie
en fan-out : 2 à 4 sous-agents en **lecture seule** (`Explore`, ou `ppt-designer` sur l'angle
design), un angle par agent avec son périmètre et son format de rapport (constats courts +
gravité), puis **consolidation obligatoire** en un backlog dédoublonné et priorisé, les
contradictions entre angles arbitrées explicitement. Règles héritées : jamais d'écriture
concurrente pendant le fan-out, rapports courts (chaque sous-agent repart d'un contexte
froid facturé), et **garde exhaustivité** — un fan-out d'`Explore` lit des *extraits*, donc
si la revue sert à recenser toutes les références à un identifiant **avant suppression ou
renommage**, la consolidation se termine par un `grep -r` déterministe de chaque
identifiant sur tout le dépôt, dont le résultat **prime** sur les rapports des sous-agents.

```json
{
  "nom": "export-ppt-verifie",
  "description": "Production ou évolution du deck PPT de restitution (US6.4) : génération, enrichissements conditionnels (cadres photo, polish rédactionnel, passe design), vérification au rendu réel obligatoire, revue-increment avant commit.",
  "statut": "eprouve",
  "source": "manuel",
  "declencheurs": [
    "génère/améliore/corrige le deck PPT de restitution d'une équipe/d'un pilotage",
    "changement de layout, de constantes ou de slide dans app/scripts/pptx_deck.py / export-restitution-ppt.py / build-synthese-ppt.py",
    "remplir les cadres photo (« ici mettre une Photo ») d'un template client",
    "qualité rédactionnelle / design des slides du deck"
  ],
  "etapes": [
    {
      "id": "cadrage",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "données de la session/du pilotage identifiées (radar, piliers, commentaires), template OCTO relu si les constantes de layout bougent (parité aperçu web / PPT)"
      },
      "checkpoint": false
    },
    {
      "id": "generation",
      "agent": "ppt-designer",
      "mode": "cascade",
      "modele": "(thread)",
      "contrat": {
        "type": "deterministe",
        "critere": "pour une NOUVELLE slide ou une slide retravaillée en profondeur : forme choisie à partir de l'intention via deck-design-library (22 patterns OCTO, importé de VSCode2 le 2026-07-23) AVANT de dessiner. Export .pptx produit sans exception, auto-check géométrique passé (shapes ne débordant pas du slide), tests PPT du projet verts (npm test -- test-export-ppt / test-ppt-charte, ou équivalent ciblé). Alternative selon le contexte : skill projet `restitution-ppt` ou modification directe de app/scripts/pptx_deck.py — le choix de canal ne dispense pas de l'étape verification-rendu qui suit. SI la génération OU une revue est déléguée au sous-agent ppt-designer : contrat de sortie = liste de findings structurée et AUTOSUFFISANTE (constat + localisation fichier/fonction ou n° de slide + correctif proposé) rendue en un seul passage, exploitable sans rappeler l'agent (son transcript peut expirer — cf. run partiel 2026-07-22 02:10)"
      },
      "checkpoint": false
    },
    {
      "id": "cadres-photo",
      "agent": "pptx-framed-image",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "SI le template porte des cadres photo (prstGeom round2DiagRect, « ici mettre une Photo ») : image insérée épousant la forme exacte du cadre — cf. reference_octo_cadre_frame_layout.md (le cadre vit sur le slideLayout, pas sur la picture). Skill jamais utilisée à ce jour — prudence, contrôler à l'étape verification-rendu"
      },
      "checkpoint": false
    },
    {
      "id": "polish-texte",
      "agent": "slide-text-polish",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "deterministe",
        "critere": "SI le contenu textuel des slides a été produit ou retouché : slide_lint passé sur {title, bullets}, findings bloquants corrigés — en particulier pas d'abréviation cryptique sur un indicateur (feedback_pas_d_abreviations_cryptiques.md). Skill jamais utilisée à ce jour — prudence"
      },
      "checkpoint": false
    },
    {
      "id": "verification-rendu",
      "agent": "pptx-verify",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "export réel rendu en images (PowerPoint COM — seule voie fiable sur ce poste, cf. reference_rendu_pptx_verification.md) et inspecté visuellement (valeurs alignées, panneaux ni vides ni étirés, pas de collision avec le chrome du template) — jamais retirée à l'instanciation, quelle que soit la taille du changement, même si l'étape generation prétend avoir déjà vérifié. Boucle nominale : rendu → liste de défauts → correction → re-rendu, budget 2 itérations max puis escalade utilisateur avec les défauts restants en images — ces itérations ne comptent PAS dans le champ reprises du run"
      },
      "checkpoint": false
    },
    {
      "id": "design-review",
      "agent": "restitution-deck-design",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI le rendu passe la géométrie mais reste visuellement pauvre (mur de boîtes, hiérarchie absente, écart à la charte OCTO) : passe design appliquée puis retour à verification-rendu. Pour une revue du deck ENTIER (ou un signal utilisateur « pas au niveau ») : suivre les contrats PAR TYPE DE SLIDE du skill deck-design-review (importé de VSCode2 le 2026-07-23) — chaque slide revue contre SA définition, pas une impression d'ensemble. VARIANTE FAN-OUT (absorbée de revue-design-parallele le 2026-07-28) : SI plus de ~12 slides ou plus de 2 angles indépendants, instancier cette étape en 2 à 4 sous-agents lecture seule (un angle chacun, périmètre et format de rapport définis avant) puis CONSOLIDER en un backlog dédoublonné et priorisé, contradictions arbitrées ; si le fan-out sert à énumérer des identifiants avant suppression/renommage, garde déterministe finale obligatoire (grep -r sur tout le dépôt, qui prime sur les rapports des sous-agents)"
      },
      "checkpoint": false
    },
    {
      "id": "gate-decision-produit",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI une passe (verification-rendu ou design-review) bute sur une décision produit NON TRANCHÉE (ex. radar vs tableau, valeur de palette/contraste) : produire UNE décision explicite à arbitrer — options rendues RÉELLEMENT (screenshot/rendu réel, jamais ASCII, cf. feedback_brainstorm_iteratif.md) + recommandation — et SUSPENDRE le rework gated jusqu'à l'arbitrage utilisateur. Ne jamais se contenter de re-noter le blocage et poursuivre (constat superviseur interaction, 2026-07-21). Étape conditionnelle : sautée si aucune décision produit n'est en suspens"
      },
      "checkpoint": "décision produit à arbitrer par l'utilisateur — présenter les options rendues + reco, ne pas trancher unilatéralement"
    },
    {
      "id": "validation-utilisateur",
      "agent": "session principale",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI le changement touche l'INTENTION DESIGN (layout, taille de police, position/présence/échelle d'un élément, couleur — PAS un simple correctif de géométrie/bug) : présenter le RENDU RÉEL (images des slides touchées, PowerPoint COM) à l'utilisateur et obtenir sa VALIDATION EXPLICITE. Pour un élément à options de layout (placement/orientation/échelle/présence), présenter 2-3 VARIANTES rendues et faire choisir AVANT d'implémenter la version de production. La definition-of-done d'un livrable visuel est cette validation, pas 'tests + géométrie verts'. Étape conditionnelle : sautée uniquement pour un correctif purement technique sans intention design"
      },
      "checkpoint": "validation utilisateur du rendu réel OBLIGATOIRE avant commit — ne jamais committer ni déclarer 'fait/clos' un changement design-intent sans ce feu vert ; pour un élément à options, faire choisir sur variantes rendues avant d'implémenter"
    },
    {
      "id": "revue-increment",
      "agent": "revue-increment",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI du code produit a été modifié (app/scripts/pptx_deck.py, export-restitution-ppt.py, server.js, constantes de layout) : boucle revue + correctifs + re-vérification exécutée en entier. `pptx-verify` (rendu réel vérifié) NE VAUT PAS cette boucle DoD complète — soit revue-increment est réellement chargée et exécutée, soit une DoD allégée « rendu vérifié seul » est assumée et ÉCRITE dans le champ notes du run journalisé (jamais sautée en silence ni créditée faussement — constat superviseur verification-manquante 2026-07-23)"
      },
      "checkpoint": "avant tout commit — action difficilement réversible, proposer, ne pas exécuter unilatéralement"
    }
  ],
  "regle_reprise": "une relance ciblée par étape en échec de contrat, puis escalade utilisateur avec l'état réel ; la boucle rendu→correction→re-rendu de verification-rendu est NOMINALE dans son budget de 2 itérations et ne compte pas comme reprise — seul le hors-budget en est une"
}
```
