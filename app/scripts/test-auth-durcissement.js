// Durcissement de la barriere Basic Auth (correctifs du 2026-09-01). Trois
// verrous, tous des REGRESSIONS avec un scenario reproduit :
//
//   1. CASSE DU CHEMIN. `estRepondant` decidait sur un chemin brut avec des
//      `startsWith('/api/')` / `endsWith('.html')` sensibles a la casse, alors
//      que ce qui SERT la requete en aval ne l'est pas (routeur Express, systeme
//      de fichiers Windows). `GET /API/sessions/<id>/resultats` n'etait donc
//      « ni /api/ ni .html » : la branche fourre-tout le declarait ouvert, et
//      Express le routait quand meme vers la vraie route. Lecture nominative
//      sans identifiants. Le chemin est desormais normalise en minuscules AVANT
//      toute decision, et la branche fourre-tout a disparu (fail-closed
//      integral : seul ce qui est explicitement liste est ouvert).
//   2. ROUTAGE SENSIBLE A LA CASSE (server.js, `case sensitive routing`) :
//      deuxieme ligne de defense, `/API/...` ne matche plus `/api/...`.
//   3. REFUS DE DEMARRER en PROD sans AUTH_USER/AUTH_PASS.
//
// Le fail-closed integral a un revers a surveiller : tout asset statique non
// liste est desormais ferme. Le parcours repondant (US10.5) est donc re-verifie
// entree par entree, en unitaire ET sur les assets reels servis en HTTP.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { estRepondant } = require('../src/auth');

const DELAI_DEMARRAGE_MS = 15000;
const DELAI_SORTIE_MS = 15000;
const USER = 'animateur';
const PASS = 'motdepasse-de-test';
const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`, 'utf8').toString('base64');
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const UUID = '11111111-2222-3333-4444-555555555555';

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

// Windows garde le fichier de base verrouille tant que le processus enfant n'est
// pas VRAIMENT mort : on attend son `exit` (avec repli sur un delai) puis on
// reessaie la suppression, plutot que de laisser des bases temporaires derriere.
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
  console.warn(`  info dossier temporaire non supprime : ${dossier}`);
}

async function avecServeur(envSupp, corps) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-casse-'));
  const dbPath = path.join(dossierTmp, 'casse.db');
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      APP_ENV: 'test-casse',
      AUTH_USER: '',
      AUTH_PASS: '',
      ...envSupp,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}

// Demarre le serveur et attend qu'il MEURE (cas « refus de demarrer »). Renvoie
// le code de sortie, ou timeout:true s'il tient debout au-dela du delai.
async function sortieDuServeur(envSupp) {
  const port = await portLibre();
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-prod-'));
  const dbPath = path.join(dossierTmp, 'prod.db');
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, AUTH_USER: '', AUTH_PASS: '', ...envSupp },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  const resultat = await new Promise((resolve) => {
    const minuteur = setTimeout(() => {
      serveur.kill();
      resolve({ code: null, timeout: true });
    }, DELAI_SORTIE_MS);
    serveur.on('exit', (code) => {
      clearTimeout(minuteur);
      resolve({ code, timeout: false });
    });
  });
  await attendreMort(serveur);
  await nettoyer(dossierTmp);
  return { ...resultat, sortie };
}

// --- 1a. Unitaire : ce qui doit rester PROTEGE -------------------------------
// `estRepondant(methode, chemin) === false` => la barriere exige les identifiants.
const PROTEGES = [
  // Le contournement exact, tel qu'il a ete reproduit.
  ['GET', `/API/sessions/${UUID}/resultats`],
  ['GET', `/Api/Sessions/${UUID}/resultats`],
  ['GET', `/api/SESSIONS/${UUID}/RESULTATS`],
  ['GET', `/api/sessions/${UUID}/resultats`], // temoin : deja protege avant
  // Pages animateur, toutes casses.
  ['GET', '/ADMIN.HTML'],
  ['GET', '/Admin.Html'],
  ['GET', '/admin.html'],
  ['GET', '/Resultats.Html'],
  ['GET', '/RESULTATS.HTML'],
  ['GET', '/Pilotage.html'],
  // Fail-closed integral : un statique inconnu n'est plus ouvert par defaut.
  ['GET', '/export.csv'],
  ['GET', '/inconnu'],
  ['GET', '/sauvegarde.json'],
  ['GET', '/data/app.db'],
  // Surface d'administration qui ressemble a du parcours repondant.
  ['GET', '/api/sessions'],
  ['GET', '/api/repondants/valeurs'],
  ['GET', '/api/repondants/fusion'],
  ['GET', '/API/repondants/valeurs'],
  ['POST', '/api/roles'],
  ['DELETE', `/api/sessions/${UUID}`],
];

console.log('Casse et fail-closed : ce qui doit exiger les identifiants :');
for (const [methode, chemin] of PROTEGES) {
  check(estRepondant(methode, chemin) === false, `${methode} ${chemin} protege`);
}

// --- 1b. Unitaire : non-regression du parcours REPONDANT (US10.5) ------------
// La liste ci-dessous est le parcours complet ; il doit rester ouvert sans compte.
const OUVERTS = [
  ['GET', '/'],
  ['GET', '/index.html'],
  ['GET', '/repondre.html'],
  ['GET', '/maquette-question.html'],
  ['GET', '/env-banner.js'],
  ['GET', '/favicon.ico'],
  ['GET', '/api/env'],
  ['GET', '/api/roles'],
  ['GET', '/api/departements'],
  ['GET', '/api/equipes'],
  ['GET', '/api/texte-intro-defaut'],
  ['GET', `/api/sessions/${UUID}`],
  ['GET', `/api/sessions/${UUID}/referentiel`],
  ['POST', `/api/sessions/${UUID}/repondants`],
  ['GET', `/api/repondants/${UUID}`],
  ['PUT', `/api/repondants/${UUID}/piliers/3/reponses`],
  ['POST', `/api/repondants/${UUID}/soumission`],
];

console.log('Parcours repondant (US10.5) : doit rester ouvert sans identifiants :');
for (const [methode, chemin] of OUVERTS) {
  check(estRepondant(methode, chemin) === true, `${methode} ${chemin} ouvert`);
}
// La normalisation ne doit pas se retourner contre le repondant : un lien de
// session copie avec une majuscule reste servi.
check(estRepondant('GET', '/Index.html') === true, 'GET /Index.html ouvert (normalisation)');
check(estRepondant('GET', `/API/sessions/${UUID}`) === true, 'GET /API/sessions/<id> ouvert (normalisation)');

async function main() {
  // --- 2. HTTP reel, barriere ACTIVE : la casse ne contourne plus rien -------
  console.log('HTTP reel, barriere active : variantes de casse sans identifiants :');
  await avecServeur({ AUTH_USER: USER, AUTH_PASS: PASS }, async (base) => {
    for (const chemin of [
      '/API/sessions',
      `/API/sessions/${UUID}/resultats`,
      `/Api/Sessions/${UUID}/resultats`,
      '/ADMIN.HTML',
      '/Admin.html',
      '/RESULTATS.HTML',
      '/export.csv',
      '/inconnu',
    ]) {
      const r = await fetch(`${base}${chemin}`);
      check(r.status === 401, `GET ${chemin} sans identifiants -> 401 (recu ${r.status})`);
    }

    // Deuxieme ligne de defense : meme AUTHENTIFIE, `/API/...` ne matche plus la
    // route `/api/...` (case sensitive routing). Le 404 prouve que le routeur ne
    // sert plus la ressource sous une autre casse.
    const majAuth = await fetch(`${base}/API/sessions`, { headers: { Authorization: basic(USER, PASS) } });
    check(majAuth.status === 404, `GET /API/sessions authentifie -> 404, routage sensible a la casse (recu ${majAuth.status})`);
    const envMaj = await fetch(`${base}/API/env`, { headers: { Authorization: basic(USER, PASS) } });
    check(envMaj.status === 404, `GET /API/env authentifie -> 404, routage sensible a la casse (recu ${envMaj.status})`);
    // Temoin : la meme route en casse declaree repond bien.
    const envOk = await fetch(`${base}/api/env`);
    check(envOk.status === 200, `temoin GET /api/env -> 200 (recu ${envOk.status})`);

    // Fail-closed integral : les assets reellement servis au repondant restent
    // ouverts (c'est la branche fourre-tout supprimee qui les couvrait avant).
    for (const chemin of ['/', '/index.html', '/repondre.html', '/env-banner.js']) {
      const r = await fetch(`${base}${chemin}`);
      check(r.status === 200, `asset repondant ${chemin} -> 200 sans identifiants (recu ${r.status})`);
    }
    // /favicon.ico n'existe pas dans src/public : ce qui compte est qu'il ne
    // soit pas REFUSE par la barriere (404 du statique, pas 401).
    const favicon = await fetch(`${base}/favicon.ico`);
    check(favicon.status !== 401, `/favicon.ico traverse la barriere (recu ${favicon.status})`);

    // Routes de session/repondant : la barriere les laisse passer, la route
    // repond ce qu'elle veut (404 sur un id inconnu) mais JAMAIS 401.
    const passages = [
      ['GET', `/api/sessions/${UUID}`],
      ['GET', `/api/sessions/${UUID}/referentiel`],
      ['GET', `/api/repondants/${UUID}`],
    ];
    for (const [methode, chemin] of passages) {
      const r = await fetch(`${base}${chemin}`, { method: methode });
      check(r.status !== 401, `${methode} ${chemin} traverse la barriere sans identifiants (recu ${r.status})`);
    }
    // Les routes d'administration de meme forme restent fermees.
    const valeurs = await fetch(`${base}/api/repondants/valeurs`);
    check(valeurs.status === 401, `GET /api/repondants/valeurs -> 401 (recu ${valeurs.status})`);
  });

  // --- 3. Refus de demarrer en PROD sans identifiants ------------------------
  console.log('Demarrage en PROD :');
  const sansCreds = await sortieDuServeur({ APP_ENV: 'PROD' });
  check(
    sansCreds.timeout === false && sansCreds.code !== 0 && sansCreds.code !== null,
    `APP_ENV=PROD sans AUTH_USER/AUTH_PASS : sortie en code non nul (code=${sansCreds.code}, timeout=${sansCreds.timeout})`,
  );
  check(
    /Refus de demarrer/i.test(sansCreds.sortie),
    "le refus est explicite sur la sortie d'erreur",
  );

  await avecServeur({ APP_ENV: 'PROD', AUTH_USER: USER, AUTH_PASS: PASS }, async (base) => {
    const env = await fetch(`${base}/api/env`);
    const corps = await env.json();
    check(env.status === 200 && corps.env === 'PROD', `APP_ENV=PROD avec identifiants : le serveur demarre (recu ${env.status})`);
    const admin = await fetch(`${base}/admin.html`);
    check(admin.status === 401, `en PROD la surface animateur est fermee sans identifiants (recu ${admin.status})`);
  });

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
