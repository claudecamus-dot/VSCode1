// Test unitaire du coeur de calcul de maturite (src/scores.js) : agregation de
// moyennes, pre-analyses d'une question (moyenne/min/max/ecart-type de population)
// et comparaison historique. Constat audit flotte 2026-07-24 : ce coeur n'avait
// aucun test unitaire. Fonctions pures -> testables sans base.
const { moyenneDe, statsNiveaux, deltaHistorique } = require('../src/scores');

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}
const proche = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;

console.log('moyenneDe :');
check(moyenneDe([]) === null, 'liste vide -> null');
check(moyenneDe([null, null]) === null, 'que des null -> null');
check(moyenneDe([1, 2, 3]) === 2, 'moyenne simple');
check(moyenneDe([1, null, 3]) === 2, 'les null sont ignores (pas comptes comme 0)');
check(moyenneDe([4]) === 4, 'valeur unique');

console.log('statsNiveaux :');
const vide = statsNiveaux([]);
check(vide.moyenne === null && vide.min === null && vide.max === null && vide.ecartType === null,
  'aucune reponse -> tout null');
const un = statsNiveaux([2]);
check(un.moyenne === 2 && un.min === 2 && un.max === 2 && un.ecartType === 0,
  'reponse unique -> ecart-type 0');
const deux = statsNiveaux([0, 4]);
check(deux.moyenne === 2 && deux.min === 0 && deux.max === 4 && proche(deux.ecartType, 2),
  'ecart-type de population (division par N) : [0,4] -> 2');
const trois = statsNiveaux([1, 2, 3]);
check(trois.moyenne === 2 && proche(trois.ecartType, Math.sqrt(2 / 3)),
  '[1,2,3] -> moyenne 2, ecart-type sqrt(2/3)');
const identiques = statsNiveaux([3, 3, 3]);
check(identiques.ecartType === 0, 'valeurs identiques -> ecart-type 0 (consensus)');

console.log('deltaHistorique :');
check(deltaHistorique(3, 2) === 1, 'progression : courant - precedent');
check(deltaHistorique(2, 3) === -1, 'regression : delta negatif');
check(deltaHistorique(2, null) === null, 'pas de precedent -> null (pas de comparaison contre du vide)');
check(deltaHistorique(null, 2) === null, 'pas de courant -> null');
check(deltaHistorique(0, 0) === 0, 'deux valeurs a zero -> delta 0 (et non null)');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
