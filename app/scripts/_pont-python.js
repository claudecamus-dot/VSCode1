// Aide partagée des ponts `npm test` → tests Python (python-pptx).
// Interpréteur : $PYTHON, sinon le premier de py / python3 / python qui importe pptx.
// Aucun n'en dispose : SKIP propre (exit 0) en local, mais ÉCHEC (exit 1) si
// CI ou REQUIRE_PPTX est défini — un skip silencieux en CI masquerait le test.
const { spawnSync } = require('child_process');
const path = require('path');

function lancerSiPptx(script, nom) {
  const candidats = process.env.PYTHON ? [process.env.PYTHON] : ['py', 'python3', 'python'];
  const python = candidats.find((c) => {
    const p = spawnSync(c, ['-c', 'import pptx'], { stdio: 'ignore' });
    return !p.error && p.status === 0;
  });
  if (!python) {
    const raison = `${nom} : aucun interpréteur avec python-pptx parmi ${candidats.join(', ')}`;
    if (process.env.CI || process.env.REQUIRE_PPTX) {
      console.error(`ÉCHEC ${raison} (CI/REQUIRE_PPTX défini : le skip est interdit)`);
      process.exit(1);
    }
    console.log(`SKIP ${raison} (poste non outillé)`);
    process.exit(0);
  }
  const run = spawnSync(python, [path.join(__dirname, script)], { stdio: 'inherit' });
  process.exit(run.status === null ? 1 : run.status);
}

module.exports = { lancerSiPptx };
