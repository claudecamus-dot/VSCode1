// Verification d'origine anti-CSRF (csrf.js), finding audit-technique
// securite:critique du 2026-09-04 : POST /api/referentiel/import (multipart,
// donc simple request au sens CORS) purgeait toutes les donnees en mode
// "remplacer" sans aucun controle d'Origin/Referer - une page tierce ouverte
// dans le navigateur de l'animateur pouvait declencher la purge, avec ou sans
// Basic Auth active (Basic Auth ne protege pas du CSRF : le navigateur rejoue
// les identifiants en cache quelle que soit la page d'origine).
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic } = require('./test-helpers-serveur');

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

// envSupp permet de demarrer avec Basic Auth ACTIVE (AUTH_USER/AUTH_PASS poses)
// pour le bloc de scenarios "identifiants valides + CSRF" plus bas — meme
// pattern que test-auth.js. `seed(dbPath)`, optionnel, s'execute AVANT le
// demarrage du serveur (ecriture directe en base, comme test-fenetre-saisie.js)
// : POST /api/sessions exige un referentiel importe, ce que le scenario 3
// (creation de session) a besoin de satisfaire sans alourdir ce fichier d'une
// dependance a exceljs juste pour un seed minimal.
async function avecServeur(envSupp, corps, seed) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-import-'));
  const dbPath = path.join(dossierTmp, 'csrf.db');
  if (seed) seed(dbPath);
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-csrf', AUTH_USER: '', AUTH_PASS: '', ...envSupp },
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
// Durci le 2026-09-04 (arbitrage utilisateur, revue adversariale du correctif
// initial) : fail-closed sur Origin/Referer ABSENTS. Avant : un client sans
// aucun des deux en-tetes etait laisse passer (hypothese "client non
// navigateur") ; mais un VRAI navigateur avec des identifiants Basic Auth en
// cache peut aussi arriver sans Origin/Referer (proxy d'entreprise, extension
// de confidentialite qui les retire) -- exactement le vecteur CSRF que ce
// module existe pour fermer. Voir les scenarios plus bas (memes identifiants,
// Origin tierce vs same-origin) pour la preuve HTTP correspondante.
check(memeOrigine({ headers: { host: 'localhost:3000' } }) === false, 'Origin/Referer absents -> refuse (fail-closed)');
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
  await avecServeur({}, async (base) => {
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

  // --- 3. Basic Auth ACTIVE : le CSRF reste bloquant malgre des identifiants
  // VALIDES. C'est le scenario exact du commentaire en tete de csrf.js : Basic
  // Auth ne protege pas du CSRF, un navigateur rejoue les identifiants en
  // cache quelle que soit la page d'origine -- donc la garde doit s'appliquer
  // AVANT meme que ces identifiants ne soient pris en compte.
  console.log('HTTP reel, Basic Auth ACTIVE : CSRF bloque malgre des identifiants valides :');
  await avecServeur({ AUTH_USER: USER, AUTH_PASS: PASS }, async (base) => {
    const creds = { Authorization: basic(USER, PASS) };

    // 3a. Route qui EXIGE Basic Auth (hors parcours repondant) : identifiants
    // valides + Origin tierce -> bloquee en 403 par verifierOrigine, avant meme
    // que la barriere Basic Auth n'ait eu l'occasion de les accepter.
    const attaqueAvecCreds = await fetch(`${base}/api/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', ...creds },
      body: JSON.stringify({ nom: 'role-attaque-csrf' }),
    });
    check(
      attaqueAvecCreds.status === 403,
      `POST /api/roles Origin tierce + identifiants Basic Auth VALIDES -> 403 quand meme (recu ${attaqueAvecCreds.status})`,
    );

    // 3b. Temoin nominal : MEME requete, SAME-ORIGIN, memes identifiants ->
    // reussit. Le durcissement CSRF ne casse pas le parcours authentifie normal.
    const nominalAvecCreds = await fetchMutant(`${base}/api/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...creds },
      body: JSON.stringify({ nom: 'role-nominal-csrf' }),
    });
    check(
      nominalAvecCreds.status === 200,
      `POST /api/roles same-origin + identifiants valides -> 200 (recu ${nominalAvecCreds.status})`,
    );

    // 3c. Routes du parcours REPONDANT (auth.js, ROUTES_REPONDANT) : ouvertes
    // SANS aucun identifiant meme barriere active (US10.5) -- mais DOIVENT
    // rester protegees contre le CSRF cross-origin, independamment de l'auth.
    // Fixture : creation de session (PAS une route repondant, exige les
    // identifiants) same-origin + creds ; identification du repondant, elle,
    // est same-origin SANS identifiants (route deja ouverte, comme ailleurs
    // dans ce fichier).
    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...creds },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 3600000).toISOString(),
        fermeture_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    check(creation.status === 200, `preparation : session creee, same-origin + identifiants (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();

    const identification = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'csrf-repondant@exemple.fr',
        nom: 'Nom',
        prenom: 'Prenom',
        departement: 'Dept',
        equipe: 'Equipe',
        role: 'Testeur',
        est_manager: false,
        dans_equipe: true,
      }),
    });
    check(
      identification.status === 200,
      `preparation : repondant identifie same-origin, SANS identifiants Basic Auth (route ouverte US10.5) (recu ${identification.status})`,
    );
    const { id: repondantId } = await identification.json();

    // GET reste hors perimetre CSRF : recupere le VRAI pilier/question de la
    // session (seedes par `seed` ci-dessous) pour que la PUT ci-dessous porte
    // sur la route fonctionnelle reelle, pas un pilier bidon.
    const referentiel = await (await fetch(`${base}/api/sessions/${sessionId}/referentiel`)).json();
    const pilierId = referentiel[0].id;
    const questionId = referentiel[0].sousCategories[0].questions[0].id;

    // PUT reponses -- route ouverte (US10.5).
    const putCrossOrigin = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', ...creds },
      body: JSON.stringify({ reponses: [{ question_id: questionId, niveau: 1 }] }),
    });
    check(
      putCrossOrigin.status === 403,
      `PUT reponses (route repondant OUVERTE) Origin tierce + identifiants -> 403 quand meme (recu ${putCrossOrigin.status})`,
    );

    const putSameOrigin = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: questionId, niveau: 1 }] }),
    });
    check(
      putSameOrigin.status === 200,
      `PUT reponses (route repondant OUVERTE) same-origin, SANS identifiants -> 200 (recu ${putSameOrigin.status})`,
    );

    // POST soumission -- meme route ouverte, meme raisonnement. Attaque cross-
    // origin d'abord (le repondant ne doit PAS se retrouver soumis par elle),
    // puis temoin same-origin qui, lui, doit reussir.
    const soumissionCrossOrigin = await fetch(`${base}/api/repondants/${repondantId}/soumission`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', ...creds },
    });
    check(
      soumissionCrossOrigin.status === 403,
      `POST soumission (route repondant OUVERTE) Origin tierce + identifiants -> 403 quand meme (recu ${soumissionCrossOrigin.status})`,
    );

    const soumissionSameOrigin = await fetchMutant(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
    check(
      soumissionSameOrigin.status === 200,
      `POST soumission (route repondant OUVERTE) same-origin, SANS identifiants -> 200 (recu ${soumissionSameOrigin.status})`,
    );
  }, (dbPath) => {
    // Referentiel minimal (1 pilier, 1 question) : POST /api/sessions refuse
    // sans ca (400 "Aucun referentiel importe"), independamment du CSRF.
    process.env.DB_PATH = dbPath;
    const { reconcileReferentiel } = require('../src/referentiel');
    reconcileReferentiel([
      {
        nom: 'Pilier CSRF',
        ordre: 0,
        sousCategories: [{
          nom: 'Objectif',
          ordre: 0,
          questions: [{
            texte: 'Q1',
            niveaux: [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n })),
          }],
        }],
      },
    ]);
    require('../src/db').close();
  });

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
