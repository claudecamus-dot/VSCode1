# Les 43 regles anti-slop — transcrites depuis ui-craft, annotees pour VSCode1

Source : `scripts/detect/rules.mjs` de https://github.com/educlopez/ui-craft
(MIT, Eduardo Calvo), lu via raw.githubusercontent.com le 2026-09-08 — LU, pas
execute. Meme tableau que la version VSCode2 (les regles ne changent pas) ;
seule la colonne "Ici" differe la ou le canal (pas de CSS partage, Express +
HTML pur, pas d'HTMX) change ce qui est prioritaire a verifier.

| # | id (ui-craft) | severite | regle | Ici |
|---|---|---|---|---|
| 1 | transition-all | critical | lister les proprietes animees, jamais `transition: all` | telle-quelle |
| 2 | bounce-elastic-easing | critical | ease-out/cubic-bezier, jamais bounce | telle-quelle |
| 3 | animate-bounce | critical | pas d'animation de rebond | telle-quelle |
| 4 | purple-cyan-gradient | critical | un seul accent, pas de gradient violet-cyan | telle-quelle — `resultats.html` utilise deja un accent unique (`--brand-primary: #0b5ea8`), bon signal existant |
| 5 | uppercase-heading | critical | sentence case, majuscules reservees aux labels <=13px | telle-quelle — **candidat trouve** : `.points-attention h3`/`.points-forts h3` a 14.4px (voir SKILL.md) |
| 6 | gradient-text-metric | major | couleur pleine sur les metriques | telle-quelle |
| 7 | emoji-feature-icon | major | vraie icone SVG, pas d'emoji | telle-quelle |
| 8 | pure-black-text | major | pas de `#000` pur | telle-quelle — a vue, `resultats.html` utilise `var(--brand-secondary)` (`#14233b`), pas de noir pur pour le texte principal |
| 9 | generic-cta | major | CTA specifique | telle-quelle |
| 10 | left-top-animation | critical | animer transform/opacity, pas left/top/width | telle-quelle |
| 11 | absolute-zindex | major | echelle de z-index petite | telle-quelle |
| 12 | setTimeout-animation | major | transitions CSS/rAF, pas setTimeout | telle-quelle |
| 13 | inline-any-style | warn | extraire en classe | adaptee — chaque page a DEJA tout son CSS en `<style>` de tete de page (pas de style inline element-par-element observe dans ce qui a ete lu) ; le risque ici est plutot la DUPLICATION de regles entre pages, pas le style inline |
| 14 | aria-label-emoji | major | aria-label decrit l'action | telle-quelle |
| 15 | no-focus-visible | major | `:hover` + `:focus-visible` systematiques | telle-quelle |
| 16 | pixel-radius-inconsistency | major | une seule source de verite pour les radius | telle-quelle — `resultats.html` mixe deja `border-radius: 8px` en plusieurs endroits sans token dedie (pas de `--radius` defini) : a verifier si c'est voulu (une seule valeur partout) ou une derive |
| 17 | unit-mixing | warn | une unite par bloc | telle-quelle |
| 18 | dark-pattern/confirmshaming | critical | refus neutre, sans culpabilisation | telle-quelle |
| 19 | dark-pattern/destructive-no-confirm | critical | confirmation nommant l'element | telle-quelle — a verifier sur `admin.html`/`pilotage.html` (non lus en detail) |
| 20 | a11y/icon-only-button-no-label | critical | aria-label sur bouton icone seule | telle-quelle |
| 21 | dataviz/categorical-rainbow | major | palette nommee distinguable | contexte — **pertinent ici** : `resultats.html` a un radar SVG (`#zoneRadar svg`) et une `.legende`/`.legende-puce` colorees — a verifier avec la vraie palette utilisee |
| 22 | state/missing-empty-or-error | major | etat vide/erreur explicite | telle-quelle — `.participants-liste .vide` existe deja (bon signal), a verifier sur les autres blocs charges dynamiquement |
| 23 | copy/placeholder-shipped | critical | pas de placeholder en prod | telle-quelle |
| 24 | a11y/modal-without-dialog | critical | `<dialog>`/`[popover]` natif | telle-quelle |
| 25 | forms/placeholder-as-label | critical | vrai label, pas juste un placeholder | telle-quelle — `<textarea id="commentaire" aria-label="Commentaire de restitution de l'equipe">` (ligne 166) est deja conforme, bon exemple a citer dans un rapport |
| 26 | a11y/outline-none-no-replacement | critical | jamais outline:none sans remplacement | telle-quelle — a verifier, non confirme sur les extraits lus |
| 27 | tables/no-overflow-handling | major | overflow horizontal + header sticky | contexte — a verifier si `admin.html`/`pilotage.html` ont des tableaux |
| 28 | a11y/streaming-no-live-region | critical | aria-live sur contenu qui change sans reload | adaptee — VSCode1 n'a pas d'HTMX ; le point d'attention equivalent est le JS "vanilla" qui reecrit le DOM (ex. `.etat-sauvegarde`, ligne 66, mis a jour par JS lors de la sauvegarde du commentaire) : meme besoin d'`aria-live`, meme regle, mecanisme different |
| 29 | forms/autocomplete-missing | major | autocomplete sur email/tel/password | telle-quelle |
| 30 | a11y/heading-order-skip | major | pas de saut h1->h3 | telle-quelle |
| 31 | layout/image-height-from-attribute | major | height:auto si un axe contraint | telle-quelle |
| 32 | type/crowded-ladder | major | 4-6 paliers de police max | telle-quelle |
| 33 | type/display-not-separated | minor | ecart 2.7-4x avec le palier suivant | telle-quelle |
| 34 | type/bold-display | minor | pas de gras a la taille display | telle-quelle |
| 35 | css/duplicate-declaration | major | pas de propriete dupliquee dans un bloc | telle-quelle |
| 36 | perf/image-no-dimensions | major | width/height ou aspect-ratio sur `<img>` | telle-quelle |
| 37 | copy/or-divider-caps | major | "ou" en minuscule | contexte — pas d'ecran d'auth identifie |
| 38 | auth/brand-flood-panel | major | pas de panneau plein-bleed | contexte — idem |
| 39 | layout/eyebrow-flood | major | un eyebrow max par 3 sections | telle-quelle |
| 40 | copy/scroll-cue | major | pas d'indice de scroll decoratif | telle-quelle |
| 41 | copy/section-number-eyebrow | major | pas de "01 · Section" decoratif | telle-quelle |
| 42 | copy/duplicate-cta-intent | major | un seul libelle par intention | telle-quelle |
| 43 | copy/em-dash-flood | major | max 1-2 tirets cadratins | telle-quelle |
