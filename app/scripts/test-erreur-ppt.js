// Audit flotte 2026-10-04 (robustesse) : le stderr de Python (chemins du serveur,
// pile d'appels) ne doit jamais atteindre le client HTTP de l'export PPT.
const assert = require('node:assert/strict');
const { corpsEchecPpt } = require('../src/erreur-ppt');

const stderrPython = 'Traceback (most recent call last):\n  File "C:\\srv\\app\\scripts\\export-restitution-ppt.py", line 12\nModuleNotFoundError: No module named pptx';
const err = Object.assign(new Error('Command failed: python C:\\srv\\app\\scripts\\export-restitution-ppt.py'), { code: 1 });

const corps = corpsEchecPpt(err, stderrPython);
const brut = JSON.stringify(corps);
assert.equal(corps.error, 'Echec de la generation du PPT.');
for (const fuite of ['Traceback', 'export-restitution-ppt', 'C:\\srv', 'pptx', 'Command failed']) {
  assert.ok(!brut.includes(fuite), `fuite cote client : ${fuite}`);
}
assert.ok(!('detail' in corps), 'aucun champ detail');

const expire = corpsEchecPpt(Object.assign(new Error('x'), { killed: true, signal: 'SIGTERM' }), '');
assert.match(expire.error, /delai de 2 minutes/);

console.log('Erreur PPT sans fuite stderr OK');
