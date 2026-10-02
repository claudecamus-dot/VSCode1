// Garde anti-régression : aucun script npm ne doit appeler le lanceur Windows `py`
// nu (absent sur ubuntu → exit 127, CI rouge ; cf. 115d0b2). Passer par un pont
// node (ex. test-ppt-charte-si-dispo.js).
// Usage : node test-npm-sans-py.js [package.json] | --self-test
const fs = require('fs');
const path = require('path');

// Premier mot de chaque commande, après découpe sur && || ; | & ( ), retrait des
// affectations VAR=val et des préfixes cross-env / npx.
function premiersMots(cmd) {
  return cmd.split(/&&|\|\||;|\||&|[()]|\r?\n/).map((seg) => {
    const mots = seg.trim().split(/\s+/).filter(Boolean);
    while (mots.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(mots[0]) || /^(cross-env|npx)$/.test(mots[0]))) mots.shift();
    return mots[0] || '';
  });
}
const appellePy = (cmd) => premiersMots(cmd).some((m) => /^py(\.exe)?$/i.test(m));

if (process.argv[2] === '--self-test') {
  const mauvais = ['py x.py', 'a && py x', 'a || py x', 'a | py x', '(py x)', 'FOO=1 py x',
    'cross-env A=1 py x', 'py.exe x', 'a && py', 'a; py x', 'a & py x', 'npx py x', 'a\npy x', '  py x'];
  const sains = ['node a.js && node b.js', 'node scripts/test-pytest.js', 'echo copy x', 'node py-bridge.js', 'py3 x', 'py.test x'];
  let ko = 0;
  for (const c of mauvais) if (!appellePy(c)) { console.error(`FAIL non détecté : ${c}`); ko++; }
  for (const c of sains) if (appellePy(c)) { console.error(`FAIL faux positif : ${c}`); ko++; }
  if (ko) process.exit(1);
  console.log(`OK auto-test garde (${mauvais.length} cas à détecter, ${sains.length} sains)`);
  process.exit(0);
}

const file = process.argv[2] || path.join(__dirname, '..', 'package.json');
const scripts = JSON.parse(fs.readFileSync(file, 'utf8')).scripts || {};
const fautifs = Object.entries(scripts).filter(([, cmd]) => appellePy(cmd));
if (fautifs.length) {
  for (const [nom] of fautifs) console.error(`FAIL script npm "${nom}" appelle \`py\` nu`);
  process.exit(1);
}
console.log('OK aucun script npm n\'appelle `py` nu');
