// Fenetre de saisie appliquee a CHAQUE ecriture du repondant, pas seulement a
// l'identification (correctif du 2026-09-01, sessionOuverteOu409()). Avant :
// seule la creation du repondant verifiait sessionStatus() === 'ouverte'. Celui
// deja identifie continuait ensuite d'enregistrer des piliers et de soumettre
// APRES la cloture — l'animateur fermait sa session, lisait ses resultats,
// exportait son PPT, et les agregats bougeaient encore derriere lui.
//
// Fabrication de l'etat "session fermee" : ECRITURE DIRECTE en base sur le
// DB_PATH temporaire (mise a jour de fermeture_at dans le passe), plutot que
// d'attendre l'horloge. Choix retenu pour la stabilite : une fenetre qui se
// ferme "en vrai" pendant le test introduirait une course entre le delai
// choisi et la vitesse d'execution (CI plus lente, machine chargee) ; l'ecriture
// directe rend le moment de la fermeture deterministe. Le repondant a deja
// TOUT repondu avant la fermeture (via l'API, en conditions reelles) : sans le
// correctif, la fermeture serait donc invisible et soumission/reponses
// continueraient de reussir (200) au lieu du 409 attendu — c'est le defaut que
// ce test rend visible.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

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
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenetre-saisie-'));
  const dbPath = path.join(dossierTmp, 'fenetre.db');

  // Seed direct : 1 pilier, 2 questions actives (toutes les 2, la session par
  // defaut n'en restreint aucune) — de quoi remplir un pilier complet.
  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    {
      nom: 'Pilier X',
      ordre: 0,
      sousCategories: [
        { nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }, { texte: 'Q2', niveaux: niveaux() }] },
      ],
    },
  ]);
  const pilierId = dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier X'").get().id;
  const q1 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q1'").get().id;
  const q2 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q2'").get().id;
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-fenetre-saisie', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : session ouverte, repondant identifie :');
    const creation = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    check(creation.status === 200, `session creee (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();

    const identification = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'fenetre@exemple.fr',
        nom: 'Nom',
        prenom: 'Prenom',
        departement: 'Dept',
        equipe: 'Equipe',
        role: 'Testeur',
        est_manager: false,
        dans_equipe: true,
      }),
    });
    check(identification.status === 200, `repondant identifie (recu ${identification.status})`);
    const { id: repondantId } = await identification.json();

    console.log('Session OUVERTE : enregistrer le pilier complet reussit (temoin nominal) :');
    const enregistrement = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: q1, niveau: 0 }, { question_id: q2, niveau: 0 }] }),
    });
    check(enregistrement.status === 200, `PUT reponses pendant que la session est ouverte -> 200 (recu ${enregistrement.status})`);

    console.log('Fermeture de la session (ecriture directe en base, fermeture_at dans le passe) :');
    const dbFermeture = new DatabaseSync(dbPath, { timeout: 5000 });
    dbFermeture
      .prepare('UPDATE sessions SET fermeture_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 5000).toISOString(), sessionId);
    dbFermeture.close();

    const statutApresFermeture = await (await fetch(`${base}/api/sessions/${sessionId}`)).json();
    check(statutApresFermeture.statut === 'fermee', `preparation : la session est bien vue comme fermee (recu ${statutApresFermeture.statut})`);

    console.log('Session FERMEE : enregistrer un pilier est refuse (409), meme avec un payload valide :');
    const enregistrementFerme = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: q1, niveau: 1 }, { question_id: q2, niveau: 1 }] }),
    });
    check(enregistrementFerme.status === 409, `PUT reponses apres cloture -> 409 (recu ${enregistrementFerme.status})`);
    const corpsFerme = await enregistrementFerme.json();
    check(corpsFerme.statut === 'fermee', 'le corps du 409 porte le statut "fermee"');

    console.log("Le niveau n'a PAS ete ecrase malgre la tentative (les reponses precedentes restent 0) :");
    const relecture = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(
      relecture.reponses.every((r) => r.niveau === 0),
      `aucune reponse modifiee par la tentative refusee (recu ${JSON.stringify(relecture.reponses)})`
    );

    console.log('Session FERMEE : soumettre est refuse (409), meme si toutes les questions sont repondues :');
    const soumission = await fetch(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
    check(soumission.status === 409, `POST soumission apres cloture -> 409 (recu ${soumission.status})`);
    const corpsSoumission = await soumission.json();
    check(corpsSoumission.statut === 'fermee', 'le corps du 409 de soumission porte aussi le statut "fermee"');

    console.log("Le repondant n'est toujours PAS marque soumis :");
    const relectureFinale = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(relectureFinale.soumis_at === null, 'soumis_at reste null malgre la tentative refusee');
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
