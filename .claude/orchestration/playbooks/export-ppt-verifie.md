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
        "critere": "export .pptx produit sans exception, auto-check géométrique passé (shapes ne débordant pas du slide), tests PPT du projet verts (npm test -- test-export-ppt / test-ppt-charte, ou équivalent ciblé). Alternative selon le contexte : skill projet `restitution-ppt` ou modification directe de app/scripts/pptx_deck.py — le choix de canal ne dispense pas de l'étape verification-rendu qui suit"
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
        "critere": "export réel rendu en images (PowerPoint COM — seule voie fiable sur ce poste, cf. reference_rendu_pptx_verification.md) et inspecté visuellement (valeurs alignées, panneaux ni vides ni étirés, pas de collision avec le chrome du template) — jamais retirée à l'instanciation, quelle que soit la taille du changement, même si l'étape generation prétend avoir déjà vérifié"
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
        "critere": "SI le rendu passe la géométrie mais reste visuellement pauvre (mur de boîtes, hiérarchie absente, écart à la charte OCTO) : passe design appliquée puis retour à verification-rendu. Skill jamais utilisée à ce jour — prudence"
      },
      "checkpoint": false
    },
    {
      "id": "revue-increment",
      "agent": "revue-increment",
      "mode": "cascade",
      "modele": "(session)",
      "contrat": {
        "type": "reel",
        "critere": "SI du code produit a été modifié (app/scripts/pptx_deck.py, export-restitution-ppt.py, constantes de layout) : boucle revue + correctifs + re-vérification exécutée en entier"
      },
      "checkpoint": "avant tout commit — action difficilement réversible, proposer, ne pas exécuter unilatéralement"
    }
  ],
  "regle_reprise": "une relance ciblée par étape en échec de contrat, puis escalade utilisateur avec l'état réel"
}
```
