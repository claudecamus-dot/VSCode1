// Petit harnais des tests de robustesse/integrite (lot du 2026-10-14) : base
// temporaire avec referentiel minimal, serveur reel en processus enfant sur port
// libre, session ouverte, corps d'inscription. Complete helpers-serveur.js sans
// le modifier.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const CHEMIN_PRELOAD = path.join(__dirname, 'preload-test-serveur.js');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}
function nbEchecs() { return echecs; }

function dossierTemporaire(prefixe) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefixe}-`));
}

// Cree la base (singleton src/db.js DANS ce processus) avec un referentiel minimal
// et la FERME : le serveur enfant la rouvre.
function creerBaseAvecReferentiel(dbPath) {
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  const niveaux = [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
  reconcileReferentiel([
    { nom: 'Pilier', ordre: 0, sousCategories: [{ nom: 'Objectif', ordre: 0, questions: [{ texte: 'Q1', niveaux }] }] },
  ]);
  db.close();
}

// Lance le vrai serveur. `avecPreload` : voir preload-test-serveur.js.
async function lancer({ dbPath, env = {}, avecPreload = false, nom = 'robustesse' }) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const args = avecPreload ? ['--require', CHEMIN_PRELOAD, CHEMIN_SERVEUR] : [CHEMIN_SERVEUR];
  const serveur = spawn(process.execPath, args, {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: `test-${nom}`, AUTH_USER: '', AUTH_PASS: '', DEBIT_MAX: '1000', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  await attendreServeur(base, 15000, serveur, () => sortie);
  return { base, serveur, sortie: () => sortie, arreter: async () => { serveur.kill(); await attendreMort(serveur); } };
}

async function creerSessionOuverte(base) {
  const res = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      fermeture_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    }),
  });
  if (res.status !== 200) throw new Error(`creation de session : HTTP ${res.status}`);
  return (await res.json()).id;
}

function corpsRepondant(surcharge = {}) {
  return {
    email: 'jean@example.com', nom: 'Dupont', prenom: 'Jean', departement: 'Dept',
    equipe: 'Equipe', role: 'Testeur', est_manager: false, dans_equipe: true, ...surcharge,
  };
}

function json(base, route, methode, corps) {
  return fetchMutant(`${base}${route}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
}

function terminer(echecsAttendus = 0) {
  if (echecs > echecsAttendus) {
    console.error(`${echecs} verification(s) en echec`);
    process.exit(1);
  }
}

module.exports = {
  check, nbEchecs, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer,
  creerSessionOuverte, corpsRepondant, json, nettoyer, fetchMutant, CHEMIN_SERVEUR, portLibre, attendreMort,
};
