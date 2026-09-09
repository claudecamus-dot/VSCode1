// Smoke test HTTP : demarre le VRAI serveur (src/server.js) en processus enfant
// sur un port libre avec une base SQLite temporaire (DB_PATH surcharge, comme
// test-reimport.js), puis le sollicite en HTTP reel — verification fonctionnelle
// du livrable web, pas un mock. Aucun framework, assertions Node natives.
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-http-'));
  const dbPath = path.join(dossierTmp, 'smoke.db');

  const serveur = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'src', 'server.js')],
    {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'smoke' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let sortieServeur = '';
  serveur.stdout.on('data', (d) => { sortieServeur += d; });
  serveur.stderr.on('data', (d) => { sortieServeur += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    // Page d'accueil : la vraie page servie (choix du mode demo/reel).
    const accueil = await fetch(`${base}/`);
    assert.equal(accueil.status, 200);
    const html = await accueil.text();
    assert.match(html, /Questionnaire de maturit/);

    // Console animateur : statique servie par le meme serveur.
    const admin = await fetch(`${base}/admin.html`);
    assert.equal(admin.status, 200);

    // API : l'environnement injecte est bien restitue (bandeau US9.5).
    const env = await fetch(`${base}/api/env`);
    assert.equal(env.status, 200);
    assert.deepEqual(await env.json(), { env: 'smoke' });

    console.log(`Smoke HTTP OK (serveur reel sur ${base}, base temporaire)`);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortieServeur);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); }
);
