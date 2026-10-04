// Audit flotte 2026-10-04 (risque technique) : /health sert le HEALTHCHECK Docker.
// Doit repondre 200 SANS identifiants meme quand la barriere Basic Auth est active,
// sans ouvrir le reste de l'API.
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreMort, nettoyer } = require('./helpers-serveur');

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  const serveur = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dossierTmp, 'h.db'), APP_ENV: 'test-health', AUTH_USER: 'u', AUTH_PASS: 'p' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    // Sonde sur /api/env : toute reponse HTTP (meme 401) prouve que le serveur ecoute.
    const fin = Date.now() + 15000;
    for (;;) {
      try { await fetch(`${base}/api/env`); break; } catch (e) {
        if (Date.now() > fin) throw e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const h = await fetch(`${base}/health`);
    assert.equal(h.status, 200, '/health sans identifiants');
    assert.deepEqual(await h.json(), { status: 'ok' });
    const api = await fetch(`${base}/api/sessions`);
    assert.equal(api.status, 401, 'le reste de l API reste protege');
    console.log('Health OK');
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
