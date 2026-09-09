/* global module */
// Classement "top-3" partage entre le calcul serveur (construireBlocRestitution
// dans server.js, alimente l'export PPT) et l'affichage client (resultats.html,
// sections Points forts / Points d'attention) — memes regles des deux cotes
// (US6.2), extrait pour eviter que les deux implementations independantes
// dérivent l'une de l'autre (constat audit-technique 2026-09-04).
//
// Ne construit PAS le champ `contexte` (le libelle "Pilier · Sous-categorie") :
// le serveur et le client le forment differemment (le client l'echappe pour
// une injection HTML via esc(), le serveur le laisse en texte brut pour le
// PPT) — c'est pourquoi `contexteFn` reste un parametre de l'appelant.
//
// UMD minimal : global navigateur (Classement) si charge en <script src>,
// export CommonJS si require() depuis Node (server.js).
(function (root, fabrique) {
  const api = fabrique();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Classement = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Aplatit piliers -> sous-categories -> questions en une seule liste de
  // questions (uniquement celles avec une moyenne, donc au moins une reponse),
  // chacune porteuse de son `contexte` forme par l'appelant.
  function aplatirQuestions(piliers, contexteFn) {
    return piliers.flatMap((pilier) =>
      pilier.sousCategories.flatMap((sc) =>
        sc.questions
          .filter((q) => q.moyenne !== null)
          .map((q) => ({ ...q, contexte: contexteFn(pilier, sc) }))
      )
    );
  }

  // "Points d'attention" : plus fort desaccord (ecart-type) + scores les plus
  // faibles, top 3 chacun.
  function classerPointsAttention(questions) {
    return {
      dispersion: [...questions].sort((a, b) => b.ecartType - a.ecartType).slice(0, 3),
      faibles: [...questions].sort((a, b) => a.moyenne - b.moyenne).slice(0, 3),
    };
  }

  // "Points forts" : scores les plus hauts + meilleurs accords, top 3 chacun.
  // L'accord n'a de sens qu'avec au moins 2 reponses : a 1 seule, l'ecart-type
  // est trivialement 0 sans traduire un vrai consensus.
  function classerPointsForts(questions) {
    return {
      hauts: [...questions].sort((a, b) => b.moyenne - a.moyenne).slice(0, 3),
      accords: [...questions]
        .filter((q) => q.reponses.length >= 2)
        .sort((a, b) => a.ecartType - b.ecartType)
        .slice(0, 3),
    };
  }

  return { aplatirQuestions, classerPointsAttention, classerPointsForts };
});
