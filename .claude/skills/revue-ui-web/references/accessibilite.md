# Checklist accessibilite — adaptee de ui-craft `references/accessibility.md`

Source : https://raw.githubusercontent.com/educlopez/ui-craft/main/skills/ui-craft/references/accessibility.md
(MIT), lu le 2026-09-08. Meme contenu de fond que la version VSCode2 ; exemples
adaptes au canal Express/HTML sans HTMX.

## Critique (bloque l'usage clavier/lecteur d'ecran)

- Nom accessible sur tout controle interactif : bouton icone seule ->
  `aria-label` ; `<input>`/`<textarea>` -> `<label>` ou `aria-label` associe
  (deja observe conforme sur `#commentaire`, `resultats.html` ligne 166).
- Tout ce qui est cliquable doit etre atteignable au Tab : preferer `<button>`
  natif a un `<h2>`/`<div>` avec gestionnaire JS. **Point d'attention VSCode1
  mesure** : `.repli-toggle` est pose sur des `<h2>`, `.pilier-entete` sur des
  `<div>` — aucun `role="button"`/`tabindex`/`aria-expanded` trouve par grep
  cible sur `resultats.html`. Premier point a trancher au rendu reel.
- Focus visible jamais retire sans remplacement visible.
- Modales : focus piege/restaure — a verifier sur `admin.html` si des
  modales y existent (non lu en detail ce cycle).

## Fort impact

- Semantique HTML native preferee aux roles ARIA de substitution.
- Hierarchie de titres respectee.
- `<th>` sur les en-tetes de tableau — a verifier sur les pages non lues
  (`admin.html`, `pilotage.html`).
- Formulaires : erreur liee via `aria-describedby`, `aria-invalid`, focus sur
  la premiere erreur, jamais de blocage du copier-coller, police mobile
  >= 16px.

## Priorite moyenne

- `aria-live="polite"` sur les zones mises a jour par JS sans rechargement —
  cas concret trouve : `.etat-sauvegarde` (ligne 66 de `resultats.html`),
  message de confirmation de sauvegarde du commentaire, mis a jour par JS.
- `aria-expanded`/`aria-controls` sur les controles `repli-toggle`/
  `pilier-entete` une fois leur semantique de bouton corrigee (ou en parallele
  du constat clavier ci-dessus, les deux vont ensemble).
- Contraste APCA prefere a WCAG2 ; interactions plus contrastees que le repos.
- Etat desactive jamais signale par la seule couleur.
- Animations respectent `prefers-reduced-motion` ; survol conditionne a
  `@media (hover: hover) and (pointer: fine)`.

## Quantifie

- Cible tactile minimum 44px.
- Police mobile des champs de saisie >= 16px.

## Ce que ce document ne remplace pas

Un contraste APCA se calcule sur les couleurs REELLES du rendu. Chaque page de
VSCode1 ayant son propre `<style>` (pas de source de verite CSS commune), le
calcul doit etre refait page par page — noter "a verifier au rendu" plutot que
trancher sans le calcul si le doute existe.
