// Audit flotte 2026-10-04 (risque technique) : /health sert le HEALTHCHECK Docker.
// Doit repondre 200 SANS identifiants meme quand la barriere Basic Auth est active,
// sans ouvrir le reste de l'API.
// Ajout 2026-10-14 : la sonde LIT la base (SELECT 1) ; base fermee -> 503
// {status:'indisponible'}, et non un 200 mensonger.
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer } = require('./helpers-serveur');

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-'));
  const drapeau = path.join(dossierTmp, 'fermer-base');
  const serveur = spawn(process.execPath, ['--require', path.join(__dirname, 'preload-test-serveur.js'), path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dossierTmp, 'h.db'), APP_ENV: 'test-health', AUTH_USER: 'u', AUTH_PASS: 'p', PRELOAD_FERMER_BASE: drapeau },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, 15000, serveur, () => sortie);
    const h = await fetch(`${base}/health`);
    assert.equal(h.status, 200, '/health sans identifiants');
    assert.deepEqual(await h.json(), { status: 'ok' });
    const api = await fetch(`${base}/api/sessions`);
    assert.equal(api.status, 401, 'le reste de l API reste protege');

    // Base indisponible : le preload ferme la base du serveur des que le drapeau existe.
    fs.writeFileSync(drapeau, '');
    let h503;
    const fin = Date.now() + 10000;
    do {
      await new Promise((r) => setTimeout(r, 100));
      h503 = await fetch(`${base}/health`);
    } while (h503.status === 200 && Date.now() < fin);
    assert.equal(h503.status, 503, '/health sur base fermee');
    assert.deepEqual(await h503.json(), { status: 'indisponible' });
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
