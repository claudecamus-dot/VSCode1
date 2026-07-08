# Points d'amélioration — export PPT de restitution

> État au **2026-07-08**. Objectif : augmenter la qualité du deck, respecter le
> template OCTO, formes plus travaillées — **sans quitter python-pptx** (le
> `.pptx` OCTO fait foi). Priorisé impact / effort. Se lit avec
> [`template-octo.md`](template-octo.md) et [`design-system-octo.md`](design-system-octo.md).

## Décisions d'architecture actées

- **Rester sur `python-pptx`** construit sur le template OCTO. Sortie éditable +
  chrome natif conservés.
- **PptxGenJS écarté** : ne sait pas charger un `.pptx` existant → tout à
  redéfinir en code, fidélité template dégradée. Incompatible avec « respecter le
  template » + « formes travaillées ». (Replis si besoin futur d'un export SANS
  template riche : `pptx-automizer`, ou HTML rendu par Puppeteer déjà présent —
  mais sortie non éditable dans PowerPoint.)
- **Source de vérité couleur = le thème du template** (= charte OCTO navy/cyan/
  slate). Palette par pilier gardée pour les **données** (alignée radar).

## Fait & vérifié

| # | Amélioration | Statut | Preuve |
| --- | --- | --- | --- |
| 1 | **Police de marque** — le contenu dessiné était en Arial (mineure du thème) alors que titres/placeholders sont en Outfit. Détection `police_marque()` + application. | ✅ Fait | PowerPoint COM : 0 zone Arial (37 avant) ; rendu OK ; tests projet ✅ |

## Backlog (ordre impact / effort)

| # | Amélioration | Détail | Effort | Statut |
| --- | --- | --- | --- | --- |
| 2 | **Neutres + accent depuis le thème** | Remplacer `INK/MUTED/LINE` génériques par navy/slate du thème ; introduire l'accent **cyan** (`accent3`) sur filets/labels/barre de callout. Aplats only, **pas d'ombre/gradient**. | S | ⏳ en cours |
| 5 | **Décision palette (tranchée)** | Chrome = thème OCTO (navy/cyan/slate) ; **données = palette par pilier** conservée (radar). Pas de fusion. | — | ✅ décidé, appliqué avec #2 |
| 3 | **Radar vectoriel** | Aujourd'hui PNG rasterisé par Puppeteer → flou en projection/impression. Piste : radar natif (formes/`custGeom`) ou chart natif. | M | ⏳ |
| 4 | **Icônes outline par pilier** | Pictogrammes stroke (charte : jamais filled), navy/cyan, pour muscler l'infographie. | M | ⏳ |
| 6 | **Cadres `round2DiagRect`** | Utiliser les cadres photo du template (couverture/intercalaires) via `pptx-framed-image`. | S-M | ⏳ |
| 7 | **Nouveaux patterns de slide** | S'inspirer de `KPI_GRID`, `MATRICE_CONTEXTE_CARDS`, `COMPARAISON_2_OPTIONS` (design system) pour enrichir la restitution. | M-L | 💡 idée |

## Rappels de méthode (non négociables)

- **Vérifier par rendu réel** (PowerPoint COM sur ce poste), pas seulement la
  géométrie — un mélange de polices/une collision ne se voit qu'au rendu.
- **Ne jamais tronquer silencieusement** : layout piloté par le contenu (mesure
  → dimensionnement → réduction de police bornée → au pire ellipse visible).
- Tout changement visuel : capture **avant/après** côte à côte.

*Lié : mémoire projet *project-fidelite-charte-ppt*, [`ppt-toolkit.md`](ppt-toolkit.md).*
