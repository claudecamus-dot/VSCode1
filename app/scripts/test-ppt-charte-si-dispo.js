// Pont vers test-ppt-charte.py depuis `npm test` (charte graphique du PPT).
// Cause du bug corrige : `py scripts/test-ppt-charte.py` en dur dans package.json
// -> `py` (lanceur Windows) absent sur ubuntu, exit 127, CI rouge.
// Interpreteur : $PYTHON, sinon le premier de py / python3 / python qui dispose de
// python-pptx. Aucun n'en dispose : SKIP propre (exit 0, raison affichee).
const { spawnSync } = require('child_process');
const path = require('path');

const candidats = process.env.PYTHON ? [process.env.PYTHON] : ['py', 'python3', 'python'];
const python = candidats.find((c) => {
  const p = spawnSync(c, ['-c', 'import pptx'], { stdio: 'ignore' });
  return !p.error && p.status === 0;
});
if (!python) {
  console.log(`SKIP test-ppt-charte : aucun interpreteur avec python-pptx parmi ${candidats.join(', ')}`);
  process.exit(0);
}
const run = spawnSync(python, [path.join(__dirname, 'test-ppt-charte.py')], { stdio: 'inherit' });
process.exit(run.status === null ? 1 : run.status);
