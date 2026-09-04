// Verification d'origine anti-CSRF (csrf.js), finding audit-technique
// securite:critique du 2026-09-04 : POST /api/referentiel/import (multipart,
// donc simple request au sens CORS) purgeait toutes les donnees en mode
// "remplacer" sans aucun controle d'Origin/Referer - une page tierce ouverte
// dans le navigateur de l'animateur pouvait declencher la purge, avec ou sans
// Basic Auth active (Basic Auth ne protege pas du CSRF : le navigateur rejoue
// les identifiants en cache quelle que soit la page d'origine).
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { memeOrigine } = require('../src/csrf');

const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

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
      const res = await fetch(`${base}/api/env`);
      if (res.ok) return;
      derniereErreur = new Error(`HTTP ${res.status} sur /api/env`);
    } catch (err) {
      derniereErreur = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Serveur injoignable apres ${delaiMs} ms : ${derniereErreur}`);
}

function attendreMort(serveur, delaiMs = 5000) {
  if (serveur.exitCode !== null || serveur.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const minuteur = setTimeout(resolve, delaiMs);
    serveur.once('exit', () => { clearTimeout(minuteur); setTimeout(resolve, 100); });
  });
}

async function nettoyer(dossier) {
  for (let essai = 0; essai < 5; essai += 1) {
    try {
      fs.rmSync(dossier, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function avecServeur(corps) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-import-'));
  const dbPath = path.join(dossierTmp, 'csrf.db');
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-csrf', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, 15000);
    await corps(base);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}

// --- 1. Unitaire : memeOrigine() ---------------------------------------------
console.log('Unitaire memeOrigine() :');
check(memeOrigine({ headers: { host: 'localhost:3000' } }) === true, 'Origin/Referer absents -> laisse passer (client non-navigateur)');
check(
  memeOrigine({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } }) === true,
  'Origin same-origin -> autorise',
);
check(
  memeOrigine({ headers: { host: 'localhost:3000', origin: 'https://evil.example' } }) === false,
  'Origin cross-origin -> refuse',
);
check(
  memeOrigine({ headers: { host: 'localhost:3000', referer: 'https://evil.example/page.html' } }) === false,
  'Referer cross-origin (pas de Origin) -> refuse',
);
check(
  memeOrigine({ headers: { host: 'localhost:3000', origin: 'pas-une-url' } }) === false,
  'Origin illisible -> refuse (prudence)',
);

async function main() {
  // --- 2. HTTP reel : la purge ne part plus depuis une origine tierce --------
  console.log('HTTP reel, requete cross-origin sur une route mutante :');
  await avecServeur(async (base) => {
    // Le scenario exact de l'audit : import multipart en mode=remplacer, avec
    // une Origin qui ne correspond pas au serveur.
    const form = new FormData();
    form.append('mode', 'remplacer');
    form.append('fichier', new Blob(['contenu-de-test']), 'referentiel.xlsx');

    const attaque = await fetch(`${base}/api/referentiel/import`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: form,
    });
    check(attaque.status === 403, `POST /api/referentiel/import depuis Origin tierce -> 403 (recu ${attaque.status})`);

    // Temoin : la meme route reste utilisable sans Origin (client non-navigateur,
    // outillage interne) - on ne casse pas l'usage legitime existant.
    const stats = await fetch(`${base}/api/referentiel/stats`);
    check(stats.status === 200, `temoin GET /api/referentiel/stats sans Origin -> 200 (recu ${stats.status})`);

    // Une autre route mutante (hors perimetre repondant) est protegee de la
    // meme facon : la garde est globale, pas cablee route par route.
    const roles = await fetch(`${base}/api/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ nom: 'x' }),
    });
    check(roles.status === 403, `POST /api/roles depuis Origin tierce -> 403 (recu ${roles.status})`);

    // GET reste hors perimetre CSRF, meme cross-origin.
    const env = await fetch(`${base}/api/env`, { headers: { Origin: 'https://evil.example' } });
    check(env.status === 200, `GET /api/env depuis Origin tierce -> 200, GET non concerne (recu ${env.status})`);
  });

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
