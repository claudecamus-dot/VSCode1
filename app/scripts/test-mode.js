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

// Cookie MALFORME (audit-technique 2026-09-09) : decodeURIComponent leve
// URIError sur une sequence pourcent invalide, et les deux appelants sont des
// handlers synchrones -> 500 pour un cookie simplement abime. La garde doit
// rendre le mode par defaut, jamais lever.
console.log('\nCookie `mode` malforme (sequence pourcent invalide) -> defaut, jamais de levee :');
for (const cookie of ['mode=%', 'mode=%zz', 'mode=%E0%A4%A', 'mode=100%', 'autre=x; mode=%C3']) {
  let leve = null;
  let rendu = null;
  try {
    rendu = estModeDemo(cookie);
  } catch (err) {
    leve = err;
  }
  check(leve === null, `${cookie} : aucune levee (recu ${leve && leve.constructor.name})`);
  check(rendu === false, `${cookie} -> reel (mode par defaut), recu ${rendu}`);
}

// Discriminant : « corriger » l'URIError en retirant purement et simplement
// decodeURIComponent ferait passer TOUS les cas ci-dessus... et casserait
// celui-ci. C'est lui qui distingue « decodage garde » de « decodage supprime ».
check(estModeDemo('mode=%64emo') === true, 'mode=%64emo -> demo : le decodage est GARDE, pas supprime');
check(estModeDemo('mode=%20demo') === false, 'mode=%20demo (espace decode) -> reel : la comparaison reste exacte apres decodage');


// --- Le MEME cookie, lu par l'AUTRE chemin : env-banner.js (navigateur) ---
//
// Trouve en passe adversariale du correctif ci-dessus (2026-09-09) : garder le
// decodage cote serveur ne servait a rien tant que env-banner.js — charge sur
// TOUTES les pages — faisait le meme decodeURIComponent nu sur le meme cookie.
// La levee y emportait aussi le bandeau d'environnement (DEV / PRE-PROD) place
// APRES, qui n'etait donc plus affiche du tout.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceBanniere = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'env-banner.js'), 'utf8');

function executerBanniere(cookie) {
  const inseres = [];
  const sandbox = {
    document: {
      cookie,
      createElement: () => ({ style: { cssText: '' }, textContent: '', innerHTML: '' }),
      body: { firstChild: null, insertBefore: (el) => { inseres.push(el); } },
    },
    console,
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ env: 'DEV' }) }),
  };
  vm.createContext(sandbox);
  let leve = null;
  try {
    vm.runInContext(sourceBanniere, sandbox, { filename: 'env-banner.js' });
  } catch (err) {
    leve = err;
  }
  return { leve, inseres };
}

console.log('\nenv-banner.js (meme cookie, cote navigateur) :');
for (const cookie of ['mode=%', 'mode=%zz', 'autre=x; mode=100%']) {
  const { leve, inseres } = executerBanniere(cookie);
  check(leve === null, `${cookie} : le script de bandeau ne leve pas (recu ${leve && leve.constructor.name})`);
  check(inseres.length === 0, `${cookie} : aucun bandeau DEMO affiche (mode par defaut), recu ${inseres.length}`);
}
{
  const { leve, inseres } = executerBanniere('mode=demo');
  check(leve === null, 'mode=demo : aucune levee');
  check(inseres.length === 1 && /MODE DÉMO/.test(inseres[0].innerHTML), 'mode=demo : le bandeau DEMO est bien affiche (cas nominal intact)');
}
{
  const { inseres } = executerBanniere('mode=%64emo');
  check(inseres.length === 1, 'mode=%64emo : le decodage est GARDE cote navigateur aussi (bandeau DEMO affiche)');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
