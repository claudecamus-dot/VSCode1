// Unicite de l'email sur une session (correctif du 2026-09-01, POST
// /api/sessions/:id/repondants + index d'unicite partiel dans db.js). Sans ce
// verrou, rouvrir le lien de session et re-remplir l'ecran d'identification
// creait une seconde ligne repondant avec son propre jeu de reponses : la
// personne comptait double dans l'effectif et les moyennes. La casse et les
// espaces ne doivent pas permettre de contourner la deduplication (l'email est
// normalise en `trim().toLowerCase()` avant comparaison ET avant ecriture).
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

function corpsRepondant(email, suffixe = '') {
  return {
    email,
    nom: `Nom${suffixe}`,
    prenom: `Prenom${suffixe}`,
    departement: 'Dept',
    equipe: 'Equipe',
    role: 'Testeur',
    est_manager: false,
    dans_equipe: true,
  };
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unicite-email-'));
  const dbPath = path.join(dossierTmp, 'unicite.db');

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
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-unicite-email', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    // Session ouverte des maintenant, pour longtemps.
    const creation = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    check(creation.status === 200, `preparation : session creee (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();

    console.log("Premiere identification avec 'A@B.fr' : accepte :");
    const premiere = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsRepondant('A@B.fr')),
    });
    check(premiere.status === 200, `1ere identification -> 200 (recu ${premiere.status})`);
    const { id: repondantId1 } = await premiere.json();
    check(typeof repondantId1 === 'string' && repondantId1.length > 0, 'un id de repondant est rendu');

    console.log("Meme email, casse et espaces differents ('  a@b.fr  ') : refuse :");
    const doublon = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsRepondant('  a@b.fr  ', '2')),
    });
    check(doublon.status === 409, `doublon (casse+espaces) -> 409 (recu ${doublon.status})`);
    const corpsDoublon = await doublon.json();
    check(typeof corpsDoublon.error === 'string' && corpsDoublon.error.length > 0, 'le 409 porte un message { error }');

    console.log('Variante supplementaire de casse (MAJUSCULES) : refusee aussi :');
    const doublonMaj = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsRepondant('A@B.FR', '3')),
    });
    check(doublonMaj.status === 409, `doublon (MAJUSCULES) -> 409 (recu ${doublonMaj.status})`);

    console.log("Un email different sur la MEME session reste accepte (l'unicite n'est pas globale au champ) :");
    const autre = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsRepondant('autre@exemple.fr', '4')),
    });
    check(autre.status === 200, `email different -> 200 (recu ${autre.status})`);

    console.log("Le MEME email sur une AUTRE session reste accepte (l'unicite est scopee a la session) :");
    const creationBis = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    const { id: sessionId2 } = await creationBis.json();
    const memeEmailAutreSession = await fetch(`${base}/api/sessions/${sessionId2}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpsRepondant('a@b.fr', '5')),
    });
    check(memeEmailAutreSession.status === 200, `meme email, session differente -> 200 (recu ${memeEmailAutreSession.status})`);

    console.log("Verification finale : l'email du repondant deja identifie est normalise en base :");
    const relecture = await (await fetch(`${base}/api/repondants/${repondantId1}`)).json();
    check(relecture.email === 'a@b.fr', "l'email est normalise en base (minuscules, sans espaces)");
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
