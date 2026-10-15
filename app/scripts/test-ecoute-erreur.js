// Demarrage du serveur : erreurs d'ecoute lisibles et code de sortie 1.
//   - port deja pris (EADDRINUSE) : message clair, pas de pile, code 1 ;
//   - PORT invalide : message clair, code 1 ;
//   - DB_PATH qui designe un dossier : le processus s'arrete en code non nul.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { check, terminer, dossierTemporaire, lancer, nettoyer, CHEMIN_SERVEUR } = require('./harnais-robustesse');

function demarrer(env) {
  return spawnSync(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, APP_ENV: 'test-ecoute', AUTH_USER: '', AUTH_PASS: '', ...env },
    encoding: 'utf8', timeout: 90000,
  });
}

(async () => {
  const dossier = dossierTemporaire('ecoute-erreur');
  const premier = await lancer({ dbPath: path.join(dossier, 'a.db'), nom: 'ecoute' });
  try {
    const port = new URL(premier.base).port;
    const r = demarrer({ PORT: port, DB_PATH: path.join(dossier, 'b.db') });
    check(r.status === 1, `port deja pris : code de sortie 1 (recu ${r.status})`);
    check(/deja utilise/.test(r.stderr) && r.stderr.includes(port), `port deja pris : message lisible (${(r.stderr || '').trim().split('\n')[0]})`);
    check(!/\n\s+at /.test(r.stderr), 'port deja pris : pas de pile d\'appels');

    for (const mauvais of ['abc', '70000', '-1', '80.5']) {
      const v = demarrer({ PORT: mauvais, DB_PATH: path.join(dossier, 'c.db') });
      check(v.status === 1 && /PORT invalide/.test(v.stderr) && v.stderr.includes(mauvais), `PORT="${mauvais}" : refuse avec message clair, code 1 (code ${v.status})`);
    }
    const d = demarrer({ PORT: '0', DB_PATH: dossier });
    check(d.status !== 0 && d.status !== null, `DB_PATH vers un dossier : sortie en erreur (code ${d.status})`);
  } finally {
    await premier.arreter();
    await nettoyer(dossier);
  }
  terminer();
  console.log('Ecoute en erreur OK');
})().catch((e) => { console.error(e); process.exit(1); });
