// Pont vers le test du LIVRABLE principal (scripts/test-export-ppt.py) depuis la
// commande standard `npm test` — finding risque_technique de l'audit flotte
// 2026-07-24 : « le seul test du chemin export n'est pas branché dans npm test,
// le livrable principal échappe à la commande standard ».
//
// Garde d'environnement : la CI (ubuntu, sans python-pptx — documenté dans
// .github/workflows/ci.yml) et un poste sans Python doivent SKIP proprement, pas
// échouer. En local outillé (python-pptx présent, comme le poste de dev), le test
// Python tourne réellement et son code de sortie fait foi.
const { spawnSync } = require('child_process');
const path = require('path');

const python = process.env.PYTHON || 'python';

// python-pptx importable ? Sinon : skip explicite (code 0), comme la CI l'assume.
const probe = spawnSync(python, ['-c', 'import pptx'], { stdio: 'ignore' });
if (probe.error || probe.status !== 0) {
  console.log('SKIP test-export-ppt : python-pptx indisponible (CI ou poste non outillé) — voir ci.yml');
  process.exit(0);
}

const script = path.join(__dirname, 'test-export-ppt.py');
const run = spawnSync(python, [script], { stdio: 'inherit' });
process.exit(run.status === null ? 1 : run.status);
