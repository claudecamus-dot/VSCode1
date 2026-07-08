# Kit « export PPT de restitution » — portable sur d'autres projets

Ensemble **agent + skills** qui produit des supports PowerPoint de qualité
(style infographie) avec `python-pptx`, puis les **vérifie par rendu réel**
plutôt que sur la seule géométrie. Extrait du projet *questionnaire de
maturité agile/produit* pour être rejouable ailleurs.

> À qui ça sert : générer un deck de restitution / synthèse / audit propre
> (hiérarchie visuelle, jauges, barres colorées, cartes) sur un template de
> marque, sans réinventer la mise en page ni livrer un mur de puces.

---

## 1. Composants et où ils vivent

| Composant | Type | Emplacement d'origine | Portable tel quel ? |
| --- | --- | --- | --- |
| `ppt-designer` | Agent | `.claude/agents/ppt-designer.md` (projet) | ✅ oui |
| `pptx-deck` | Skill | `~/.claude/skills/pptx-deck/` (global) | ✅ oui — bibliothèque + garde-fou géométrie |
| `pptx-verify` | Skill | `~/.claude/skills/pptx-verify/` (global) | ✅ oui — rendu + inspection visuelle |
| `restitution-deck-design` | Skill | `~/.claude/skills/restitution-deck-design/` (global) | ✅ oui — système de design conseil |
| `pptx-framed-image` | Skill | `.claude/skills/pptx-framed-image/` (projet) | ✅ oui — image dans un cadre à coins presets |
| `slide-text-polish` | Skill | `.claude/skills/slide-text-polish/` (projet) | ✅ oui — qualité rédactionnelle + linter |
| `restitution-ppt` | Skill | `.claude/skills/restitution-ppt/` (projet) | ⚠️ **gabarit-exemple** — spécifique à cette app, à adapter |

**Distinction clé** : les 5 premiers skills sont génériques et se réutilisent
tels quels. `restitution-ppt` est la **matérialisation projet** (structure du
deck, contrat de payload, générateur `export-restitution-ppt.py`, template
OCTO) : sers-t'en comme **exemple de référence**, pas comme livrable à copier.

---

## 2. Rôle de chaque composant

### Agent `ppt-designer`
Chef d'orchestre. Transforme des données en slides **conçus** (pas des listes
de puces). Il s'appuie sur `pptx-deck` (mise en page) et sur le skill projet
qui décrit le deck concret. Principes non négociables : dimensionner sur les
**vraies** dimensions du slide (`prs.slide_width/height`), pas de vide
vertical, hiérarchie plutôt que puces, respect du chrome du template
(logo/footer/pagination), et **jamais** déclarer un deck « vérifié » sur la
seule géométrie.

### Skill `pptx-deck` (fondation)
Bibliothèque d'aides réutilisables `pptx_deck.py` (échelle typographique
`D.TYPE`, barres de progression colorées, jauge circulaire, cartes, chips) +
le contrôle obligatoire `verifier_geometrie` qui détecte toute forme sortant
du cadre. **Point de départ à lire en premier.**

### Skill `pptx-verify`
Le rendu-et-inspection : convertit le `.pptx` en images et traque les défauts
que la géométrie ne voit pas (valeurs mal alignées, panneaux vides ou
sur-étirés, collisions avec le chrome du template, libellés cryptiques).

### Skill `restitution-deck-design`
Le système de design « cabinet de conseil » : hiérarchie visuelle, rythme
d'espacement, couleur porteuse de sens, discipline d'alignement, cohérence
inter-slides. Répond à « est-ce que ça *se lit* comme un design pro » quand la
géométrie passe mais que le deck a l'air amateur.

### Skill `pptx-framed-image`
Insère une image dans un **cadre** du template en lui donnant la forme exacte
du cadre (coins arrondis/diagonaux) via clonage du `prstGeom` du cadre sur la
picture — pas d'arrondi PIL approximatif. Fournit aussi un générateur d'images
d'illustration procédurales (scènes nature/été) et un audit des obstructions
de cadre (bordures, lignes parasites).

### Skill `slide-text-polish`
Qualité rédactionnelle : titre = une affirmation (pas une étiquette), une idée
par puce, BLUF, suppression du remplissage, abréviations explicitées,
structure parallèle. Livré avec un **linter** `slide_lint.py` (codes
`WEAK_TITLE`, `LONG_BULLET`, `FILLER`…, exit code non nul → utilisable en CI).

### Skill `restitution-ppt` (gabarit-exemple)
Le deck concret de l'app : couverture + slides par équipe/département (jauge
globale, barres par pilier, radar + commentaire, cartes de points
d'attention), sur template OCTO. Générateur `export-restitution-ppt.py`
(appelé par le serveur Node), test géométrie `test-export-ppt.py`. Contient
des **invariants de mise en page trouvés par rendu réel** — à lire comme
retour d'expérience.

---

## 3. Dépendances et environnement

- **Python** : `python-pptx`, `Pillow` (pour `pptx-framed-image` et le
  générateur d'images). Pas de réseau, pas d'API image.
- **Node/Chrome headless** *(optionnel)* : uniquement si un visuel (radar,
  graphe) doit être rasterisé en amont côté serveur — spécifique au projet
  d'origine, pas requis par le kit lui-même.
- **Moteur de rendu pour la vérification** (indispensable pour `pptx-verify`) :
  - Windows → **PowerPoint COM** (seule voie image fiable ici).
  - Sinon → **LibreOffice** `--convert-to pdf` puis PDF→PNG.
  - ⚠️ Sur le poste d'origine : PowerPoint COM + LibreOffice présents, mais
    **pas de poppler/pdftoppm** (donc pas de PDF→PNG via poppler). Adapter le
    moteur de rendu au poste cible.

---

## 4. Porter le kit sur un nouveau projet

1. **Copier l'agent** : `.claude/agents/ppt-designer.md` dans le nouveau
   projet (ou le poser en agent global). Ajuster dans son texte le chemin du
   générateur et le nom du skill projet.
2. **Rendre les skills globaux disponibles** : `pptx-deck`, `pptx-verify`,
   `restitution-deck-design` vivent déjà dans `~/.claude/skills/` (partagés
   entre projets) — rien à faire si le poste est le même. Sinon, les copier.
3. **Copier les skills projet génériques** : `pptx-framed-image` et
   `slide-text-polish` dans `.claude/skills/` du nouveau projet (ils
   embarquent leurs scripts + tests).
4. **Créer le skill deck du projet** en repartant de `restitution-ppt` comme
   modèle : nouvelle structure de deck, nouveau contrat de payload, nouveau
   générateur `<projet>-ppt.py` qui réutilise `pptx_deck.py`. Ne pas copier le
   template OCTO ni le contrat de payload tels quels.
5. **Installer les dépendances Python** (`python-pptx`, `Pillow`) et
   **vérifier le moteur de rendu** cible (§3).
6. **Lancer les tests** des skills copiés pour valider la greffe :
   - `python .claude/skills/pptx-framed-image/tests/test_framed_image.py`
   - `python .claude/skills/slide-text-polish/tests/test_slide_lint.py`

---

## 5. Workflow type (une fois greffé)

1. **Cadrer la cible.** Si le design est ouvert, maquetter en HTML 1280×720,
   screenshoter (Chrome headless) et valider le look avec l'utilisateur avant
   d'écrire le Python. Proposer 2–3 options concrètes.
2. **Rédiger la copie** en `{title, bullets}`, la réécrire contre les principes
   `slide-text-polish`, passer le linter.
3. **Implémenter** avec les aides `pptx_deck` dans le générateur du projet ;
   poser les formes absolues dans la bande de contenu ; tailles depuis
   `D.TYPE`.
4. **Vérifier — les deux couches, toujours** :
   - Géométrie : `verifier_geometrie` / le test du projet → aucune forme hors
     cadre, y compris cas limites (valeurs manquantes, pas de comparaison,
     images larges).
   - Rendu réel : exporter en PNG et **regarder** (checklist « défauts que la
     géométrie ne voit pas » de `pptx-deck` + `pptx-verify`).
5. **Rapporter** ce qui a changé et pointer les images rendues. Ne jamais
   déclarer « qualité / vérifié » sur la seule géométrie.

---

*Source : projet questionnaire de maturité agile/produit. Voir aussi le wiki
projet (`docs/wiki.html`, section Agents & Patterns d'équipe).*
