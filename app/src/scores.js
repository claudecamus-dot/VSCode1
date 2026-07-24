// Statistiques de maturité extraites de server.js pour être TESTABLES (constat
// audit flotte 2026-07-24 : le cœur de calcul — agrégation, moyenne, écart-type,
// comparaison historique — n'avait aucun test unitaire, alors qu'il porte la valeur
// du produit). Fonctions PURES, sans accès base : c'est ce qui les rend testables.

// Moyenne des valeurs NON nulles d'une liste (null si aucune). Sert à agréger des
// moyennes déjà calculées (question -> sous-catégorie -> pilier) en ignorant les
// trous, pour qu'une sous-catégorie sans réponse ne compte pas comme un zéro.
function moyenneDe(liste) {
  const valides = liste.filter((m) => m !== null);
  return valides.length > 0 ? valides.reduce((a, b) => a + b, 0) / valides.length : null;
}

// Pré-analyses d'une question (US6.2) sur la liste des niveaux saisis : moyenne,
// min, max et écart-type de POPULATION (division par N, pas N-1 — on décrit le
// groupe des répondants, pas un échantillon). Un fort écart-type signale un
// désaccord dans l'équipe, donc un point d'attention. Tout null si aucune réponse.
function statsNiveaux(valeurs) {
  if (!valeurs.length) return { moyenne: null, min: null, max: null, ecartType: null };
  const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const ecartType = Math.sqrt(valeurs.reduce((s, n) => s + (n - moyenne) ** 2, 0) / valeurs.length);
  return { moyenne, min, max, ecartType };
}

// Écart entre une moyenne courante et une moyenne précédente (comparaison
// historique US6.5, regression/progression par pilier) : null si l'une manque —
// on ne compare pas contre du vide.
function deltaHistorique(courant, precedent) {
  return courant !== null && precedent !== null ? courant - precedent : null;
}

module.exports = { moyenneDe, statsNiveaux, deltaHistorique };
