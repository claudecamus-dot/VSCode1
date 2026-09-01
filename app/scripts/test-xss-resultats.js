// Verrou XSS stocke sur les pages animateur (correctif du 2026-09-01).
//
// Le piege corrige : echapper une valeur a l'ECRITURE ne protege pas sa
// RELECTURE. `select.innerHTML = ...esc(e.equipe)...` pose bien une valeur
// echappee dans le HTML, mais le navigateur la DECODE en parsant ; relue par
// `$('equipe').value`, elle redevient la chaine d'origine. Les deux titres
// « Points d'attention » et « Points forts » de resultats.html la
// reinjectaient telle quelle dans un `innerHTML` : un nom d'equipe contenant
// `<img src=x onerror=...>` s'executait dans le navigateur de l'animateur.
//
// Ce que ce test peut prouver, et ce qu'il ne peut pas : sans navigateur, on ne
// mesure pas l'execution. C'est donc un verrou de PRESENCE, dans le style de
// test-admin-ui.js — aucune valeur relue du DOM ne doit etre interpolee sans
// `esc()` dans les pages. Il attrape la reintroduction du motif fautif, pas une
// faille XSS d'une autre forme (attribut, javascript:, innerHTML d'une valeur
// venue de l'API sans esc).
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER_PAGES = path.join(__dirname, '..', 'src', 'public');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

// `${ $('champ').value }` interpole DIRECTEMENT, sans passer par esc().
const INTERPOLATION_BRUTE = /\$\{\s*\$\(\s*['"][^'"]*['"]\s*\)\s*\.value\s*\}/g;
// La forme corrigee, attendue sur les deux titres.
const INTERPOLATION_ECHAPPEE = /\$\{\s*esc\(\s*\$\(\s*['"][^'"]*['"]\s*\)\s*\.value\s*\)\s*\}/g;

console.log('Aucune valeur relue du DOM interpolee sans esc() :');
const pages = fs.readdirSync(DOSSIER_PAGES).filter((f) => f.endsWith('.html'));
check(pages.length > 0, `pages trouvees dans src/public (${pages.length})`);
for (const page of pages) {
  const contenu = fs.readFileSync(path.join(DOSSIER_PAGES, page), 'utf8');
  const brutes = contenu.match(INTERPOLATION_BRUTE) || [];
  check(brutes.length === 0, `${page} : 0 interpolation brute de .value (recu ${brutes.length}${brutes.length ? ' -> ' + JSON.stringify(brutes) : ''})`);
}

console.log('resultats.html : les deux titres passent par esc() :');
const resultats = fs.readFileSync(path.join(DOSSIER_PAGES, 'resultats.html'), 'utf8');
const echappees = resultats.match(INTERPOLATION_ECHAPPEE) || [];
check(echappees.length === 2, `2 interpolations echappees de .value attendues (recu ${echappees.length})`);
check(
  /Points d.attention[^\n]*\$\{\s*esc\(\s*\$\(\s*'equipe'\s*\)\s*\.value\s*\)\s*\}/.test(resultats),
  'le titre « Points d\'attention » echappe le nom d\'equipe',
);
check(
  /Points forts[^\n]*\$\{\s*esc\(\s*\$\(\s*'equipe'\s*\)\s*\.value\s*\)\s*\}/.test(resultats),
  'le titre « Points forts » echappe le nom d\'equipe',
);

console.log('La fonction esc() couvre les cinq caracteres dangereux :');
// Le verrou ne vaut que si esc() echappe reellement. On l'extrait de la page et
// on l'execute, plutot que de se contenter de constater sa presence.
const bloc = resultats.match(/function esc\(valeur\) \{[\s\S]*?\n {4}\}/);
check(!!bloc, 'la fonction esc(valeur) est presente dans resultats.html');
if (bloc) {
  const esc = new Function(`${bloc[0]}; return esc;`)();
  const sortie = esc('<img src=x onerror="alert(1)">&\'');
  check(!sortie.includes('<') && !sortie.includes('>'), 'esc() neutralise < et >');
  check(!sortie.includes('"') && !sortie.includes("'"), 'esc() neutralise les guillemets');
  check(sortie.includes('&amp;'), 'esc() echappe l\'esperluette (pas de double-decodage)');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
