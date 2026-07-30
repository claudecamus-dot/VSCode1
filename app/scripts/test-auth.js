// Test fonctionnel de la barriere d'acces INTERIMAIRE (Basic Auth, option A de
// l'arbitrage securite:VSCode1-api-pii). Demarre le VRAI serveur en processus
// enfant et le sollicite en HTTP reel — pas un mock du middleware.
//
// Prouve trois choses :
//   1. Barriere ACTIVE (AUTH_USER/AUTH_PASS poses) : la surface animateur/PII
//      renvoie 401 sans identifiants, 200 avec les bons, 401 avec de mauvais.
//   2. Le parcours REPONDANT reste ouvert sans identifiants (US10.5).
//   3. Barriere INACTIVE (variables absentes) : comportement STRICTEMENT
//      inchange — la meme route repond 200 sans identifiants (controle).
const assert = require('node:assert/strict');
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DELAI_DEMARRAGE_MS = 15000;
const USER = 'animateur';
const PASS = 'motdepasse-de-test';
const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`, 'utf8').toString('base64');

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function attendreServeur(base, delaiMs) {
  const fin = Date.now() + delaiMs;
  let derniereErreur = null;
  while (Date.now() < fin) {
    try {
      const res = await fetch(`${base}/api/env`); // route repondant : ouverte dans les 2 modes
      if (res.ok) return;
      derniereErreur = new Error(`HTTP ${res.status} sur /api/env`);
    } catch (err) {
      derniereErreur = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Serveur injoignable apres ${delaiMs} ms : ${derniereErreur}`);
}

async function avecServeur(envSupp, corps) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-http-'));
  const dbPath = path.join(dossierTmp, 'auth.db');
  const serveur = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'src', 'server.js')],
    {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-auth', ...envSupp },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);
    await corps(base);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    serveur.kill();
    await new Promise((r) => setTimeout(r, 300));
    try { fs.rmSync(dossierTmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

async function main() {
  // --- 1 & 2 : barriere ACTIVE ---
  await avecServeur({ AUTH_USER: USER, AUTH_PASS: PASS }, async (base) => {
    // Surface animateur / PII : fermee sans identifiants.
    const sessionsAnon = await fetch(`${base}/api/sessions`);
    assert.equal(sessionsAnon.status, 401, 'GET /api/sessions (collection admin) doit etre 401 sans identifiants');
    assert.match(sessionsAnon.headers.get('www-authenticate') || '', /^Basic /, 'un defi Basic doit etre renvoye');

    // Mauvais identifiants : toujours 401.
    const sessionsMauvais = await fetch(`${base}/api/sessions`, { headers: { Authorization: basic(USER, 'faux') } });
    assert.equal(sessionsMauvais.status, 401, 'mauvais mot de passe doit rester 401');

    // Bons identifiants : la route repond.
    const sessionsOk = await fetch(`${base}/api/sessions`, { headers: { Authorization: basic(USER, PASS) } });
    assert.equal(sessionsOk.status, 200, 'GET /api/sessions doit repondre 200 avec les bons identifiants');

    // Page animateur : fermee sans identifiants, ouverte avec (declenche l'invite navigateur).
    const adminAnon = await fetch(`${base}/admin.html`);
    assert.equal(adminAnon.status, 401, 'admin.html doit etre 401 sans identifiants');
    const adminOk = await fetch(`${base}/admin.html`, { headers: { Authorization: basic(USER, PASS) } });
    assert.equal(adminOk.status, 200, 'admin.html doit etre 200 avec les bons identifiants');

    // Parcours REPONDANT : ouvert SANS identifiants (US10.5).
    for (const route of ['/api/env', '/api/roles', '/api/departements', '/api/equipes', '/api/texte-intro-defaut']) {
      const r = await fetch(`${base}${route}`);
      assert.equal(r.status, 200, `route repondant ${route} doit rester ouverte (US10.5), recu ${r.status}`);
    }
    const repondrePage = await fetch(`${base}/repondre.html`);
    assert.equal(repondrePage.status, 200, 'repondre.html doit rester ouverte sans identifiants');
  });

  // --- 3 : barriere INACTIVE (controle : comportement inchange) ---
  await avecServeur({ AUTH_USER: '', AUTH_PASS: '' }, async (base) => {
    const sessions = await fetch(`${base}/api/sessions`);
    assert.equal(sessions.status, 200, 'sans AUTH_USER/AUTH_PASS, /api/sessions doit rester 200 (comportement inchange)');
    const admin = await fetch(`${base}/admin.html`);
    assert.equal(admin.status, 200, 'sans identifiants configures, admin.html reste ouverte comme avant');
  });

  console.log('Test barriere Basic Auth OK (fail-closed sur PII, parcours repondant ouvert, no-op sans creds)');
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
