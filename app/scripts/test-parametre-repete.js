// Un parametre de query STRING repete (?equipe=A&equipe=B) devient un TABLEAU chez
// Express, jamais une chaine (audit technique du 2026-09-02, dimension robustesse).
// Deux effets mesures avant correctif :
//   1. `estManagerExclu(manager)` faisait `manager === 'sans'` sur un tableau -> jamais
//      vrai -> le filtre "exclure les managers" echouait vers l'OUVERT en silence
//      (l'animateur demande sans, il recoit avec).
//   2. `agregerResultats` liait `filtre.equipe` (un tableau) en parametre SQL prepare ->
//      node:sqlite leve "Unknown named parameter '0'" -> 500 la ou un 400 s'imposait.
// Corrige par `unParam()` (garde la DERNIERE valeur, jamais un tableau brut) applique a
// chaque lecture de req.query dans server.js. Ce test verrouille les deux comportements
// ET verifie que le cas nominal (parametre unique) n'a pas change.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const NOM_MANAGER = 'Wrigglesworth';
const NOM_NON_MANAGER = 'Quatrefoil';

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

async function soumettre(base, sessionId, { nom, prenom, estManager }, pilierId, q1) {
  const identification = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${nom.toLowerCase()}@exemple.fr`,
      nom,
      prenom,
      departement: 'DeptRepete',
      equipe: 'EquipeRepete',
      role: 'Testeur',
      est_manager: estManager,
      dans_equipe: !estManager,
    }),
  });
  const { id: repondantId } = await identification.json();
  await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reponses: [{ question_id: q1, niveau: 2 }] }),
  });
  await fetch(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'parametre-repete-'));
  const dbPath = path.join(dossierTmp, 'repete.db');

  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier R', ordre: 0, sousCategories: [{ nom: 'Objectif R', ordre: 0, questions: [{ texte: 'QR', niveaux: niveaux() }] }] },
  ]);
  const pilierId = dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier R'").get().id;
  const q1 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'QR'").get().id;
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-parametre-repete', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : session ouverte, un manager et un non-manager soumis dans la meme equipe :');
    const creation = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    const { id: sessionId } = await creation.json();
    await soumettre(base, sessionId, { nom: NOM_MANAGER, prenom: 'M', estManager: true }, pilierId, q1);
    await soumettre(base, sessionId, { nom: NOM_NON_MANAGER, prenom: 'N', estManager: false }, pilierId, q1);

    console.log('manager=sans (valeur unique) : le manager est bien exclu (temoin, cas nominal) :');
    const unique = await fetch(`${base}/api/sessions/${sessionId}/resultats?equipe=EquipeRepete&manager=sans`);
    check(unique.status === 200, `GET resultats?manager=sans -> 200 (recu ${unique.status})`);
    const texteUnique = JSON.stringify(await unique.json());
    check(!texteUnique.includes(NOM_MANAGER), `le manager est exclu avec manager=sans (${NOM_MANAGER} absent)`);
    check(texteUnique.includes(NOM_NON_MANAGER), `le non-manager reste present avec manager=sans (${NOM_NON_MANAGER})`);

    console.log('manager=sans&manager=x (repete) : le filtre doit RESTER applique, pas echouer vers l\'ouvert :');
    const repete = await fetch(`${base}/api/sessions/${sessionId}/resultats?equipe=EquipeRepete&manager=sans&manager=x`);
    check(repete.status === 200, `GET avec manager repete -> 200 (recu ${repete.status})`);
    const texteRepete = JSON.stringify(await repete.json());
    check(!texteRepete.includes(NOM_MANAGER), `AVANT LE CORRECTIF : le manager fuitait ici (repete=['sans','x'] !== 'sans') -- doit rester absent (${NOM_MANAGER})`);

    console.log('equipe=EquipeRepete&equipe=Ailleurs (repete) : 400 propre, jamais un 500 SQL :');
    const equipeRepetee = await fetch(`${base}/api/sessions/${sessionId}/resultats?equipe=EquipeRepete&equipe=Ailleurs`);
    check(equipeRepetee.status !== 500, `AVANT LE CORRECTIF : node:sqlite levait "Unknown named parameter '0'" -> 500 ; recu ${equipeRepetee.status}`);
    check([200, 400, 404].includes(equipeRepetee.status), `statut attendu parmi 200/400/404 (recu ${equipeRepetee.status})`);

    const apres = await fetch(`${base}/api/env`);
    check(apres.status === 200, `le serveur repond encore juste apres (recu ${apres.status})`);
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
