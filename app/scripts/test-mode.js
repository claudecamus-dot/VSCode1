// Test du mode courant (page d'accueil demo/reel) : parsing du cookie `mode` par
// estModeDemo (garde-fou anti-melange). Defaut SUR = reel (absence/ambiguite du cookie
// ne montre jamais des donnees fictives comme reelles ni l'inverse).
const { estModeDemo } = require('../src/mode');

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}

console.log('estModeDemo (cookie `mode`) :');
check(estModeDemo('mode=demo') === true, 'mode=demo -> demo');
check(estModeDemo('mode=reel') === false, 'mode=reel -> reel');
check(estModeDemo('') === false, 'cookie vide -> reel (defaut)');
check(estModeDemo(undefined) === false, 'pas de cookie -> reel (defaut)');
check(estModeDemo('autre=x; mode=demo') === true, 'mode=demo parmi d\'autres cookies -> demo');
check(estModeDemo('mode=demo; autre=x') === true, 'mode=demo en tete -> demo');
check(estModeDemo('themode=demo') === false, 'themode=demo (autre cle) -> reel : pas de faux positif de sous-chaine');
check(estModeDemo('mode=DEMO') === false, 'mode=DEMO -> reel : match exact minuscule (le cookie est pose en minuscule)');
check(estModeDemo('mode=demo2') === false, 'mode=demo2 -> reel : pas un simple prefixe');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
