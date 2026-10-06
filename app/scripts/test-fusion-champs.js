// Compromis D (robustesse) : la liste blanche CHAMPS_FUSIONNABLES borne le nom
// de colonne interpole en SQL. Verrou : seuls 'departement' et 'equipe' passent ;
// les cles heritees d'Object.prototype ('constructor', '__proto__', 'toString')
// et toute injection sont refusees en 400 (jamais 500) sur les deux routes.
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-'));
  const serveur = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dossierTmp, 'f.db'), APP_ENV: 'test-fusion' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, 15000);
    const mauvais = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nom', 'departement; DROP TABLE repondants', ''];
    for (const champ of mauvais) {
      const g = await fetch(`${base}/api/repondants/valeurs/${encodeURIComponent(champ || '%20')}`);
      assert.equal(g.status, 400, `GET valeurs/${champ} doit etre 400, recu ${g.status}`);
      const p = await fetchMutant(`${base}/api/repondants/fusion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ champ, source: 'a', cible: 'b' }),
      });
      assert.equal(p.status, 400, `POST fusion champ=${champ} doit etre 400, recu ${p.status}`);
    }
    for (const champ of ['departement', 'equipe']) {
      const g = await fetch(`${base}/api/repondants/valeurs/${champ}`);
      assert.equal(g.status, 200, `GET valeurs/${champ} legitime`);
      const p = await fetchMutant(`${base}/api/repondants/fusion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ champ, source: 'a', cible: 'b' }),
      });
      assert.equal(p.status, 200, `POST fusion ${champ} legitime`);
    }
    console.log('Fusion champs OK');
  } catch (e) {
    console.error(`Sortie serveur (exitCode=${serveur.exitCode}) :\n` + sortie);
    throw e;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
