/* global module */
// Moyenne des valeurs NON nulles d'une liste (null si aucune) — extrait de
// app/src/scores.js (constat audit-technique 2026-09-04 : resultats.html
// dupliquait cette meme formule en client, jamais reconciliee avec la version
// serveur testee). scores.js re-exporte moyenneDe DEPUIS ce fichier : c'est
// ici la source unique, testee par app/scripts/test-scores.js.
//
// UMD minimal : global navigateur (StatsPartagees) si charge en <script src>,
// export CommonJS si require() depuis Node (scores.js).
(function (root, fabrique) {
  const api = fabrique();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatsPartagees = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function moyenneDe(liste) {
    const valides = liste.filter((m) => m !== null);
    return valides.length > 0 ? valides.reduce((a, b) => a + b, 0) / valides.length : null;
  }

  return { moyenneDe };
});
