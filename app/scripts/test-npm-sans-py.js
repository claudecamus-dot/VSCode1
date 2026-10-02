// Garde anti-regression : aucun script npm ne doit appeler le lanceur Windows `py`
// nu (absent sur ubuntu -> exit 127, CI rouge ; cf. 115d0b2). Passer par un pont
// node (ex. test-ppt-charte-si-dispo.js). Argument optionnel : chemin d'un package.json.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'package.json');
const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {};
const re = /(^|&&\s*|;\s*)py\s/;
const fautifs = Object.entries(scripts).filter(([, cmd]) => re.test(cmd));
if (fautifs.length) {
  for (const [nom] of fautifs) console.error(`FAIL script npm "${nom}" appelle \`py\` nu`);
  process.exit(1);
}
console.log('OK aucun script npm n\'appelle `py` nu');
