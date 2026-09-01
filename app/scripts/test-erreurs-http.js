// Filet d'erreur terminal du serveur (correctif du 2026-09-01, BLOQUANT).
//
// Ce qui est verrouille ici : une erreur qui SURVIENT DANS UN HANDLER `async`
// ou dans multer ne doit ni rendre une page HTML avec pile d'appels, ni arreter
// le processus. Express 4 n'intercepte pas les promesses rejetees (aucun
// `.catch` dans son router) : le corps entier des deux handlers `async`
// (`POST /api/referentiel/import` et `POST /api/sessions/:id/invites`) est
// desormais sous `try` avec `next(err)`, et un middleware d'erreur d'arite 4
// est monte avant `app.listen`.
//
// Le declencheur utilise est le depassement de la limite multer (10 Mo) : c'est
// le seul chemin d'erreur atteignable de l'exterieur sans toucher au code de
// production. Il prouve les deux moities du correctif : la reponse est un JSON
// 413 (avant : page HTML 500 du gestionnaire par defaut d'Express) et le
// serveur repond encore juste apres.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DELAI_DEMARRAGE_MS = 15000;
const LIMITE_MULTER = 10 * 1024 * 1024;
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

// Corps multipart construit a la main (aucune dependance) : `taille` octets de
// remplissage dans le champ `fichier`, celui qu'attendent les deux routes.
function corpsMultipart(taille, nomFichier) {
  const boundary = '----verrou413' + Date.now();
  const entete = Buffer.from(
    `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="fichier"; filename="${nomFichier}"\r\n`
      + 'Content-Type: application/octet-stream\r\n\r\n',
    'utf8',
  );
  const pied = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    boundary,
    corps: Buffer.concat([entete, Buffer.alloc(taille, 0x41), pied]),
  };
}

// Envoie et rend un descriptif de la reponse, ou l'erreur reseau. Le serveur
// repond AVANT d'avoir lu tout le corps quand la limite saute : on tolere donc
// une coupure cote client et on le dit, plutot que de faire planter le test.
async function envoyer(base, route, taille) {
  const { boundary, corps } = corpsMultipart(taille, 'gros.xlsx');
  try {
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: corps,
    });
    const texte = await res.text();
    return {
      status: res.status,
      type: res.headers.get('content-type') || '',
      texte,
      erreurReseau: null,
    };
  } catch (err) {
    return { status: null, type: '', texte: '', erreurReseau: err };
  }
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

function estJson(reponse) {
  if (!/application\/json/i.test(reponse.type)) return false;
  try {
    const objet = JSON.parse(reponse.texte);
    return typeof objet.error === 'string' && objet.error.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erreurs-http-'));
  const dbPath = path.join(dossierTmp, 'erreurs.db');

  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-erreurs', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortieServeur = '';
  serveur.stdout.on('data', (d) => { sortieServeur += d; });
  serveur.stderr.on('data', (d) => { sortieServeur += d; });
  let mortPremature = false;
  serveur.on('exit', () => { mortPremature = true; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Depassement de la limite multer (10 Mo) sur /api/referentiel/import :');
    const trop = await envoyer(base, '/api/referentiel/import', LIMITE_MULTER + 1024 * 1024);
    check(trop.erreurReseau === null, `la reponse arrive jusqu'au client (${trop.erreurReseau || 'pas de coupure'})`);
    check(trop.status === 413, `statut 413 (recu ${trop.status})`);
    check(estJson(trop), `corps JSON { error } (type recu : ${trop.type || 'aucun'})`);
    check(!/<html|Error:|\n\s+at\s/i.test(trop.texte), 'aucune page HTML ni pile d\'appels dans la reponse');

    console.log('Le serveur a SURVECU (c\'est le coeur du correctif) :');
    const apres = await fetch(`${base}/api/env`);
    check(apres.status === 200, `GET /api/env juste apres -> 200 (recu ${apres.status})`);
    check(mortPremature === false, 'le processus serveur est toujours vivant');

    console.log('Meme filet sur l\'autre handler async, /api/sessions/:id/invites :');
    const tropInvites = await envoyer(base, `/api/sessions/${UUID}/invites`, LIMITE_MULTER + 1024 * 1024);
    check(tropInvites.status === 413, `statut 413 (recu ${tropInvites.status})`);
    check(estJson(tropInvites), `corps JSON { error } (type recu : ${tropInvites.type || 'aucun'})`);
    const apres2 = await fetch(`${base}/api/env`);
    check(apres2.status === 200, `GET /api/env apres le second depassement -> 200 (recu ${apres2.status})`);
    check(mortPremature === false, 'le processus serveur est encore vivant');

    console.log('Non-regression : le chemin nominal d\'erreur reste un 400 metier :');
    // Sous la limite, mais illisible comme classeur : c'est le `try` INTERNE qui
    // doit repondre 400 (« mauvais fichier »), pas le filet terminal en 500.
    const petit = await envoyer(base, '/api/referentiel/import', 1024);
    check(petit.status === 400, `fichier illisible sous la limite -> 400 (recu ${petit.status})`);
    check(estJson(petit), 'le 400 reste un JSON { error }');
    const sansFichier = await fetch(`${base}/api/referentiel/import`, { method: 'POST' });
    check(sansFichier.status === 400, `POST sans fichier -> 400 (recu ${sansFichier.status})`);

    const apres3 = await fetch(`${base}/api/env`);
    check(apres3.status === 200, `GET /api/env en fin de parcours -> 200 (recu ${apres3.status})`);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortieServeur);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
