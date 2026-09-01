// Validation des dates a la creation de session (correctif du 2026-09-01,
// POST /api/sessions). Avant dateValide() : `new Date('nawak').getTime()` vaut
// NaN, et TOUTE comparaison avec NaN est fausse — donc `new Date(fermeture_at)
// <= new Date(ouverture_at)` etait juge FAUX (satisfait) meme sur des dates
// illisibles, et sessionStatus() (qui compare les memes NaN) rendait la
// session "ouverte" indefiniment, sans jamais se fermer. Ce test verrouille le
// 400 en amont et la non-regression du chemin nominal.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DELAI_DEMARRAGE_MS = 15000;
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
  console.warn(`  info dossier temporaire non supprime : ${dossier}`);
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dates-session-'));
  const dbPath = path.join(dossierTmp, 'dates.db');

  // Seed direct (comme test-reimport.js) : sans referentiel importe, POST
  // /api/sessions echoue avant meme d'atteindre la validation des dates qu'on
  // veut isoler ici.
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier', ordre: 0, sousCategories: [{ nom: 'Objectif', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
  ]);
  db.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-dates', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Dates illisibles ou du mauvais type : 400, aucune session creee :');
    const casInvalides = [
      { ouverture_at: 'nawak', fermeture_at: '2026-07-15T18:00:00Z' },
      { ouverture_at: '2026-07-01T09:00:00Z', fermeture_at: 'nawak' },
      { ouverture_at: '2026-99-99', fermeture_at: '2026-07-15T18:00:00Z' },
      { ouverture_at: 12345, fermeture_at: '2026-07-15T18:00:00Z' },
    ];
    for (const corps of casInvalides) {
      const r = await fetch(`${base}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      check(r.status === 400, `POST /api/sessions avec ${JSON.stringify(corps)} -> 400 (recu ${r.status})`);
      const j = await r.json();
      check(typeof j.error === 'string' && j.error.length > 0, 'le 400 porte un message { error }');
    }

    console.log('Dates vides : deja couvert par le controle "requis", doit rester en 400 :');
    for (const corps of [
      { ouverture_at: '', fermeture_at: '2026-07-15T18:00:00Z' },
      { ouverture_at: '2026-07-01T09:00:00Z', fermeture_at: '' },
    ]) {
      const r = await fetch(`${base}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      check(r.status === 400, `POST /api/sessions avec ${JSON.stringify(corps)} -> 400 (recu ${r.status})`);
    }

    console.log('Aucune des tentatives invalides ci-dessus n\'a laisse de trace en base :');
    const listeAvant = await (await fetch(`${base}/api/sessions`)).json();
    check(listeAvant.length === 0, `0 session en base apres les tentatives invalides (recu ${listeAvant.length})`);

    console.log('Non-regression : dates ISO valides -> la session se cree normalement :');
    const bonCorps = { ouverture_at: '2026-07-01T09:00:00Z', fermeture_at: '2026-12-31T23:59:59Z' };
    const ok = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bonCorps),
    });
    check(ok.status === 200, `POST /api/sessions avec dates valides -> 200 (recu ${ok.status})`);
    const corpsOk = await ok.json();
    check(typeof corpsOk.id === 'string' && corpsOk.id.length > 0, 'un id de session est rendu');
    check(typeof corpsOk.lien === 'string' && corpsOk.lien.includes(corpsOk.id), 'le lien pointe vers la session creee');

    const listeApres = await (await fetch(`${base}/api/sessions`)).json();
    check(
      listeApres.length === 1 && listeApres[0].id === corpsOk.id,
      "une seule session existe au final : aucune tentative invalide n'a laisse de ligne partielle"
    );
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
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
