---
name: restitution-ppt
description: Generate and improve the infographic restitution PowerPoint for the maturity-questionnaire app (US6.4) — cover + per team/department slides (global gauge, per-pilier bars, radar + commentaire, attention cards), on the OCTO template. Use when working on the PPT export, when its design needs fixing/extending, or when adding a new restitution slide. Builds on the pptx-deck skill and verifies the result by real render.
---

# restitution-ppt

Infographic restitution deck for the agile/product maturity questionnaire
(see the project memory `project-questionnaire-maturite`). Builds on the
[pptx-deck](../../../../.claude/skills/pptx-deck/SKILL.md) helper library.

## Where it lives

- Generator: `app/scripts/export-restitution-ppt.py` — CLI `python export-restitution-ppt.py <data.json> <out.pptx> [modele.pptx]`. **The Node server calls it with 2 args** (`app/src/server.js`, route `GET /api/sessions/:id/export-ppt`) → falls back to the default OCTO template, so that path stays stable. The optional 3rd arg (or `$TEMPLATE_PPTX`) swaps the base template.
- Helpers: `app/scripts/pptx_deck.py` (project copy of the pptx-deck lib).
- Test: `app/scripts/test-export-ppt.py` — synthetic payload + geometry check + edge cases.
- Template: `template ppt/template.pptx` (OCTO theme, 10×5.625", layout 8 = cover, layout 5 = title-only).

## Deck structure

1. **Couverture** — OCTO template cover (layout 8): `titre`, `sousTitre`, "OCTO Technology", `date`. Kept as-is — it's good.
2. Per **bloc** (an `equipe`, or a `departement` consolidating ≥2 teams), 3 slides on the title-only layout (keeps OCTO logo/footer/page number):
   - **Vue d'ensemble** — gauge "moyenne globale" + evolution, per-pilier colored bars (radar palette) with ▲=▼ trend, bottom chips "point fort / à renforcer".
   - **Radar de maturité** — radar image (web-style SVG rasterized by the server) fitted left, commentaire de restitution callout + per-pilier evolution right.
   - **Points d'attention** — cards: strongest disagreements (dispersion, range bar + mean marker) and weakest scores (score bar).

## Payload contract (built by server.js)

```jsonc
{
  "couverture": { "titre", "sousTitre", "date" },          // or null
  "blocs": [{
    "type": "equipe" | "departement",
    "nom", "departement", "effectif", "nbEquipes",          // nbEquipes for departement
    "piliers":   [{ "nom", "moyenne" }],                    // bars + global gauge (mean)
    "objectifs": [{ "nom", "moyenne", "precedent", "pilierIndex" }],  // server rasterizes the radar
    "dispersion":[{ "texte", "ecartType", "min", "max", "moyenne", "contexte" }],  // top 3
    "faibles":   [{ "texte", "moyenne", "contexte" }],      // top 3
    "commentaire": "free text, \n-separated",
    "comparaison": { "disponible", "precedenteDate", "piliers": [{ "nom", "courant", "precedent", "delta" }] },
    "radarImage": "/abs/path.png"                           // set by server (puppeteer)
  }]
}
```
Global score = mean of non-null `piliers[].moyenne`; global delta from `comparaison.piliers`.

## Workflow

- **Regenerate from a payload:** `python app/scripts/export-restitution-ppt.py data.json out.pptx`. Prints slide count + geometry status.
- **Verify (always):** `python app/scripts/test-export-ppt.py` — must print `TOUS LES TESTS PASSENT` (asserts no shape out of frame).
- **See it (Windows + PowerPoint):** render the .pptx to PNG via PowerPoint COM (see the pptx-deck skill) and eye-check. Do not claim the design is good from the geometry check alone.

## Layout invariants (eyeball-verified — don't regress these)

These were found by rendering, not by the geometry check (which passes regardless).
See the pptx-deck skill's "Defects the geometry check will NOT catch" list.

- **Badge-safe right edge = `BORD_DROIT` (9.15").** The OCTO title-only layout puts the
  page-number badge bottom-right (~x≥9.45"), and content drawn there renders *over* it.
  So **any full-width element near the bottom must stop at `BORD_DROIT`, not the 9.45"
  margin.** Already applied to: `slide_points` card columns AND the `slide_vue_ensemble`
  bottom "point fort / à renforcer" band. New bottom-row content must use it too. (Was
  found twice by render — the points cards, then the vue-d'ensemble band overlapping
  the page number.)
- **Value beside a bar → `_valeur_cote_barre(...)`.** It centers the value cluster on
  the bar's centerline (`anchor=MIDDLE`). Both card columns use it so they match:
  big value + small caption (`1.2` / `écart-type`, `1.5` / `sur 3`). Don't top-anchor
  a number next to a bar — the big figure floats above it.
- **`LH_QUESTION = 0.195`** (realistic line height for `small` 10.5pt) feeds
  `_bloc_carte_h` and the card renderers. Don't inflate it (the old 0.235 opened a
  visible gap between the question and the context/bar group).
- **`PAD_CARTE`** gives cards internal padding so text isn't flush to the rounded
  border; the question→context→bar block is centered in the card.
- **No-comparison radar slide:** in `slide_radar`'s no-`n_ev` branch the commentaire
  callout is sized to its content and vertically centered (not stretched to full
  band height — that produced a big empty panel on the department slide).
- **Spell out labels, no jargon abbreviations** (`écart-type`, not `é-t`); don't repeat
  in text what a shape already shows (the min–max range is drawn by the bar). See the
  project memory `feedback-pas-d-abreviations-cryptiques`.

## Template & charte couleurs (s'inspirer d'un modèle)

The deck adapts to the provided base template:
- **Swap the template** via the 3rd CLI arg or `$TEMPLATE_PPTX` (default = OCTO).
- **Layouts by name** — `_trouver_layout` finds the cover (`COUV_PATTERNS`) and
  title-only (`TITRE_PATTERNS`) layouts by name, falling back to the OCTO indices
  (8 / 5). So a template whose layout order differs still works.
- **Brand accent from the theme** — `construire()` sets module `ACCENT` from
  `D.theme_colors(prs)['dk1']` (fallback = palette blue) and uses it for the global
  gauge and the callout accent bar. **Per-pilier colors are deliberately NOT derived
  from the theme** — they must stay aligned with the server-rasterized radar image
  (`radar-svg.js`), and a theme's accents are rarely a clean 4-category palette. To
  recolor piliers too, you'd also have to recolor the radar (radar-svg.js + server).

## Extending (add a slide / change design)

1. Add a `slide_*` function in `export-restitution-ppt.py` using `pptx_deck` helpers; lay out inside the `CONTENU_TOP..CONTENU_BOTTOM` band; pull sizes from `D.TYPE`.
2. Call it from `construire()`.
3. Add/extend a case in `test-export-ppt.py`; run it (geometry must stay green).
4. Render via PowerPoint and look at the slide before declaring it done.
5. If you mockup a new layout first, build it as HTML at 1280×720 and screenshot it (Chrome headless) to validate the look with the user before coding the python.
