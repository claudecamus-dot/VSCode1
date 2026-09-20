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
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic } = require('./test-helpers-serveur');

const { estRepondant } = require('../src/auth');

const DELAI_DEMARRAGE_MS = 15000;
const DELAI_SORTIE_MS = 15000;
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

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

async function avecServeur(envSupp, corps, { seed = false } = {}) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-casse-'));
  const dbPath = path.join(dossierTmp, 'casse.db');
  if (seed) {
    // Seed direct (meme pattern que test-fenetre-saisie.js) : la creation de
    // session (POST /api/sessions, correctif organigramme ci-dessous) exige un
    // referentiel non vide. `require('../src/db')` est mis en cache par Node
    // sur le CHEMIN DU MODULE (pas sur DB_PATH) : a n'appeler qu'une fois par
    // processus, jamais dans les deux appels a avecServeur() de ce fichier.
    process.env.DB_PATH = dbPath;
    const dbSeed = require('../src/db');
    const { reconcileReferentiel } = require('../src/referentiel');
    reconcileReferentiel([
      { nom: 'Pilier X', ordre: 0, sousCategories: [{ nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
    ]);
    dbSeed.close();
  }
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
  // Correctif securite (arbitrage 2026-09-16, US10.5 invalidee, finding
  // « exposition d'organigramme ») : ces 3 routes GLOBALES agregaient
  // departements/equipes/roles de TOUTES les sessions sans aucun identifiant
  // de session dans l'URL -- fermees desormais, remplacees par les variantes
  // session-scopees de la liste OUVERTS ci-dessous.
  ['GET', '/api/departements'],
  ['GET', '/api/equipes'],
  ['GET', '/api/roles'],
  ['GET', '/API/departements'],
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
  ['GET', '/esc.js'],
  ['GET', '/favicon.ico'],
  ['GET', '/api/env'],
  ['GET', '/api/texte-intro-defaut'],
  ['GET', `/api/sessions/${UUID}`],
  ['GET', `/api/sessions/${UUID}/roles`],
  ['GET', `/api/sessions/${UUID}/departements-suggestions`],
  ['GET', `/api/sessions/${UUID}/equipes-suggestions`],
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
    for (const chemin of ['/', '/index.html', '/repondre.html', '/env-banner.js', '/esc.js']) {
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

    // --- 4. Correctif organigramme (arbitrage 2026-09-16, US10.5 invalidee) ---
    // Les 3 anciennes routes GLOBALES sont desormais fermees comme le reste de
    // la surface animateur...
    for (const chemin of ['/api/departements', '/api/equipes', '/api/roles']) {
      const r = await fetch(`${base}${chemin}`);
      check(r.status === 401, `ancienne route globale GET ${chemin} -> 401 (recu ${r.status})`);
    }

    const entetesAuth = { Authorization: basic(USER, PASS) };
    async function creerSession() {
      const r = await fetchMutant(`${base}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...entetesAuth },
        body: JSON.stringify({
          ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });
      const { id } = await r.json();
      return id;
    }

    // ... remplacees par des variantes session-scopees, ouvertes sans
    // identifiants, dont la DONNEE elle-meme est cloisonnee par session : le
    // departement d'un repondant de la session A ne doit JAMAIS apparaitre
    // dans les suggestions de la session B (c'est precisement la fuite
    // cross-client que le finding decrivait).
    const sessionA = await creerSession();
    const sessionB = await creerSession();
    const inscription = await fetchMutant(`${base}/api/sessions/${sessionA}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'organigramme-zzz@exemple.invalid',
        nom: 'Zzz', prenom: 'Yyy',
        departement: 'DepartementSecretClientA',
        equipe: 'EquipeSecreteClientA',
        role: 'Role secret client A',
        est_manager: false, dans_equipe: true,
      }),
    });
    check(inscription.status === 200, `inscription repondant session A -> 200 (recu ${inscription.status})`);

    const deptA = await (await fetch(`${base}/api/sessions/${sessionA}/departements-suggestions`)).json();
    check(deptA.includes('DepartementSecretClientA'), 'la session A voit son propre departement en suggestion');
    const deptB = await (await fetch(`${base}/api/sessions/${sessionB}/departements-suggestions`)).json();
    check(!deptB.includes('DepartementSecretClientA'), 'la session B NE VOIT PAS le departement de la session A (cloisonnement)');

    const equipeA = await (await fetch(`${base}/api/sessions/${sessionA}/equipes-suggestions`)).json();
    check(equipeA.includes('EquipeSecreteClientA'), "la session A voit sa propre equipe en suggestion");
    const equipeB = await (await fetch(`${base}/api/sessions/${sessionB}/equipes-suggestions`)).json();
    check(!equipeB.includes('EquipeSecreteClientA'), "la session B NE VOIT PAS l'equipe de la session A (cloisonnement)");

    // roles : sans colonne session_id (catalogue partage par construction, cf.
    // commentaire server.js), la route exige au moins une session VALIDE.
    const rolesA = await fetch(`${base}/api/sessions/${sessionA}/roles`);
    check(rolesA.status === 200, `GET roles session-scopee -> 200 (recu ${rolesA.status})`);
    const rolesInconnu = await fetch(`${base}/api/sessions/${UUID}/roles`);
    check(rolesInconnu.status === 404, `GET roles sur une session inconnue -> 404 (recu ${rolesInconnu.status})`);
  }, { seed: true });

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

  // --- 4. Refus de demarrer sur TOUT environnement non declare sans donnees --
  // Correctif du 2026-09-20 (audit securite du 2026-09-19) : la garde etait
  // adossee a la valeur litterale `APP_ENV=PROD`. Une PRE-PROD portant des
  // donnees reelles demarrait donc sans aucune barriere, sur un simple
  // console.warn. Le defaut est desormais le REFUS ; seule une liste blanche
  // d'environnements de dev/CI/test (ou AUTH_NON_REQUISE=1, assume) ouvre.
  console.log('Demarrage sans identifiants, par environnement :');
  for (const envSensible of ['PRE-PROD', 'RECETTE', '']) {
    const r = await sortieDuServeur({ APP_ENV: envSensible });
    check(
      r.timeout === false && r.code !== 0 && r.code !== null,
      `APP_ENV=${envSensible || '(vide)'} sans AUTH_* : refus de demarrer (code=${r.code}, timeout=${r.timeout})`,
    );
    check(
      /Refus de demarrer/i.test(r.sortie),
      `APP_ENV=${envSensible || '(vide)'} : le refus est explicite sur la sortie d'erreur`,
    );
  }
  for (const envOuvert of ['DEV', 'CI', 'test-quelque-chose', 'smoke']) {
    let demarre = false;
    await avecServeur({ APP_ENV: envOuvert }, async (base) => {
      demarre = (await fetch(`${base}/api/env`)).status === 200;
    });
    check(demarre, `APP_ENV=${envOuvert} sans AUTH_* : le serveur demarre toujours (dev/CI/test)`);
  }
  {
    let demarre = false;
    await avecServeur({ APP_ENV: 'PRE-PROD', AUTH_NON_REQUISE: '1' }, async (base) => {
      demarre = (await fetch(`${base}/api/env`)).status === 200;
    });
    check(demarre, 'AUTH_NON_REQUISE=1 : sortie de secours explicite, le serveur demarre');
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
