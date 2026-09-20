// Deux bornes de robustesse cote SERVEUR, verifiees sur le VRAI serveur HTTP
// (constats robustesse de l'audit-technique du 2026-09-09) :
//
//   1. Cookie `mode` malforme -> jamais 500. `estModeDemo` (src/mode.js)
//      decodait la valeur du cookie sans garde : `mode=%` fait lever
//      `URIError: URI malformed` a decodeURIComponent. Les deux appelants
//      (GET /api/sessions et POST /api/sessions) sont des handlers SYNCHRONES :
//      la levee partait au filet terminal et rendait 500 pour un cookie
//      simplement abime -- valeur que n'importe quel client pose lui-meme.
//   2. PUT /api/sessions/:id/commentaire ne validait que le TYPE du champ
//      `texte`, jamais sa longueur : un commentaire de plusieurs megaoctets
//      etait accepte et stocke tel quel, puis rendu a l'ecran de restitution ET
//      repris par la geometrie du .pptx d'export, ou il n'a aucune place.
//
// Le referentiel minimal et la session utilises ici sont inseres EN DIRECT dans
// la base temporaire du serveur (2e connexion node:sqlite ; la base est en WAL,
// donc lecteurs et ecrivain coexistent). Passer par l'API exigerait d'importer
// un classeur Excel, hors sujet pour ces deux bornes.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
// Repete a la main plutot qu'importe : server.js demarre son ecoute des qu'on le
// require. Le nombre est donc verrouille ici -- le deplacer cote serveur sans
// toucher ce test le fait crier, ce qui est exactement le but d'une borne.
const LONGUEUR_MAX_COMMENTAIRE = 5000;
const SESSION_ID = '99999999-8888-7777-6666-555555555555';
const EQUIPE = 'Equipe borne';

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

// Referentiel minimal (1 pilier > 1 objectif > 1 question > 4 niveaux) : sans
// lui, POST /api/sessions repond 400 « aucun referentiel importe » AVANT
// d'atteindre estModeDemo, et le point 1 ne prouverait rien sur ce chemin.
function semerReferentielEtSession(dbPath) {
  const base = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    const pilierId = Number(base.prepare('INSERT INTO piliers (nom, ordre, archive) VALUES (?, ?, 0)').run('Pilier borne', 0).lastInsertRowid);
    const scId = Number(base.prepare('INSERT INTO sous_categories (pilier_id, nom, ordre, archive) VALUES (?, ?, ?, 0)').run(pilierId, 'Objectif borne', 0).lastInsertRowid);
    const questionId = Number(base.prepare('INSERT INTO questions (sous_categorie_id, ordre, texte, archive) VALUES (?, ?, ?, 0)').run(scId, 0, 'Question borne ?').lastInsertRowid);
    const insertNiveau = base.prepare('INSERT INTO niveaux (question_id, niveau, texte, valeur_numerique) VALUES (?, ?, ?, ?)');
    for (let n = 0; n <= 3; n += 1) insertNiveau.run(questionId, n, `Niveau ${n}`, n);
    base
      .prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at, texte_intro, est_demo) VALUES (?, ?, ?, ?, ?, 0)')
      .run(SESSION_ID, '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null);
  } finally {
    base.close();
  }
}

function lireEstDemo(dbPath, id) {
  const base = new DatabaseSync(dbPath, { timeout: 5000 });
  try {
    const ligne = base.prepare('SELECT est_demo FROM sessions WHERE id = ?').get(id);
    return ligne ? Number(ligne.est_demo) : null;
  } finally {
    base.close();
  }
}

async function main() {
  const port = await portLibre();
  const url = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robustesse-http-'));
  const dbPath = path.join(dossierTmp, 'robustesse.db');

  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-robustesse', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortieServeur = '';
  serveur.stdout.on('data', (d) => { sortieServeur += d; });
  serveur.stderr.on('data', (d) => { sortieServeur += d; });
  let mortPremature = false;
  serveur.on('exit', () => { mortPremature = true; });

  try {
    await attendreServeur(url, DELAI_DEMARRAGE_MS);
    semerReferentielEtSession(dbPath);

    console.log('1. Cookie `mode` malforme : lecture des sessions (handler synchrone) :');
    for (const cookie of ['mode=%', 'mode=%zz', 'mode=%E0%A4%A', 'autre=x; mode=100%']) {
      const res = await fetch(`${url}/api/sessions`, { headers: { Cookie: cookie } });
      const corps = await res.text();
      check(res.status === 200, `Cookie "${cookie}" -> 200 (recu ${res.status})`);
      check(!/^5\d\d$/.test(String(res.status)), `Cookie "${cookie}" ne produit aucun 5xx`);
      let liste = null;
      try { liste = JSON.parse(corps); } catch { /* laisse liste a null */ }
      check(Array.isArray(liste), `Cookie "${cookie}" -> la liste des sessions est bien rendue (JSON tableau)`);
      // Un cookie illisible n'est PAS 'demo' : on doit voir les sessions du mode
      // reel, donc au moins celle semee plus haut (est_demo = 0).
      check(Array.isArray(liste) && liste.some((s) => s.id === SESSION_ID), `Cookie "${cookie}" -> mode par defaut (reel) : la session reelle semee est visible`);
    }

    console.log('   Le cookie malforme ne fait pas tomber la CREATION de session non plus :');
    const creation = await fetchMutant(`${url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'mode=%' },
      body: JSON.stringify({ ouverture_at: '2026-02-01T00:00:00.000Z', fermeture_at: '2026-03-01T00:00:00.000Z' }),
    });
    const creee = await creation.json().catch(() => ({}));
    check(creation.status === 200, `POST /api/sessions avec "mode=%" -> 200 (recu ${creation.status})`);
    check(typeof creee.id === 'string', 'la session est bien creee (identifiant rendu)');
    check(creee.id ? lireEstDemo(dbPath, creee.id) === 0 : false, 'elle est taguee REELLE (est_demo = 0), pas demo : le cookie illisible retombe sur le mode par defaut');

    console.log('   Non-regression : un cookie `mode` VALIDE garde son sens, y compris percent-encode :');
    const enDemo = await fetchMutant(`${url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'mode=%64emo' },
      body: JSON.stringify({ ouverture_at: '2026-02-01T00:00:00.000Z', fermeture_at: '2026-03-01T00:00:00.000Z' }),
    });
    const creeeDemo = await enDemo.json().catch(() => ({}));
    // `%64emo` se decode en `demo` : si quelqu'un « corrige » l'URIError en
    // retirant purement et simplement decodeURIComponent, ce cas passe a reel et
    // ce test crie -- c'est lui qui distingue « decodage garde » de « decodage
    // supprime ».
    check(creeeDemo.id ? lireEstDemo(dbPath, creeeDemo.id) === 1 : false, 'cookie "mode=%64emo" (percent-encode) -> session DEMO : le decodage est garde, pas supprime');

    console.log('2. Borne de longueur du commentaire de restitution :');
    async function putCommentaire(texte) {
      const res = await fetchMutant(`${url}/api/sessions/${SESSION_ID}/commentaire`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipe: EQUIPE, texte }),
      });
      return { status: res.status, corps: await res.json().catch(() => ({})) };
    }

    const nominal = await putCommentaire('Bon niveau global, deux points a suivre.');
    check(nominal.status === 200, `commentaire court -> 200 (recu ${nominal.status})`);

    const pile = await putCommentaire('x'.repeat(LONGUEUR_MAX_COMMENTAIRE));
    check(pile.status === 200, `commentaire de ${LONGUEUR_MAX_COMMENTAIRE} caracteres (pile sur la borne) -> 200 (recu ${pile.status})`);

    const trop = await putCommentaire('x'.repeat(LONGUEUR_MAX_COMMENTAIRE + 1));
    check(trop.status === 400, `commentaire de ${LONGUEUR_MAX_COMMENTAIRE + 1} caracteres -> 400 (recu ${trop.status})`);
    check(typeof trop.corps.error === 'string' && /\d/.test(trop.corps.error), 'le 400 explique la borne (message chiffre)');

    // Contournement trouve en ecrivant ce test (2026-09-09) : au-dela de la
    // limite de body-parser (express.json, 100 ko par defaut), la borne
    // ci-dessus n'est JAMAIS atteinte -- le corps est refuse avant le handler.
    // Le filet terminal rendait alors 500 « erreur interne du serveur » pour
    // une requete cliente fautive. Il relaie desormais le statut 4xx que
    // l'erreur porte elle-meme (413 ici). Ce qui compte : plus aucun 5xx sur ce
    // chemin, et un refus explicite dans les deux regimes de taille.
    const enorme = await putCommentaire('x'.repeat(2 * 1024 * 1024));
    check(enorme.status === 413, `commentaire de 2 Mo (au-dela de la limite body-parser) -> 413 (recu ${enorme.status})`);
    check(enorme.status < 500, "aucun 5xx : le serveur n'endosse pas une faute du client");
    check(typeof enorme.corps.error === 'string' && enorme.corps.error.length > 0, 'le refus reste un JSON { error }');

    // Meme filet sur l'autre erreur de body-parser : un JSON malforme.
    const malforme = await fetchMutant(`${url}/api/sessions/${SESSION_ID}/commentaire`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{ "equipe": "X", "texte": ',
    });
    check(malforme.status === 400, `corps JSON tronque -> 400 (recu ${malforme.status})`);

    // La borne REJETTE, elle n'ecrase pas : le dernier commentaire valide doit
    // etre encore en base apres les trois refus.
    const relu = await fetch(`${url}/api/sessions/${SESSION_ID}/commentaire?equipe=${encodeURIComponent(EQUIPE)}`);
    const { texte: texteRelu } = await relu.json();
    check(texteRelu === 'x'.repeat(LONGUEUR_MAX_COMMENTAIRE), 'apres les refus, le commentaire stocke reste le dernier ACCEPTE (rejet, pas troncature ni ecrasement)');

    // Un texte fait uniquement d'espaces vaut effacement (comportement d'origine) :
    // la borne porte sur la chaine RECUE, pas sur sa version trimmee -- sinon
    // 2 Mo d'espaces passeraient la borne avant d'etre stockes.
    const espaces = await putCommentaire(' '.repeat(LONGUEUR_MAX_COMMENTAIRE + 1));
    check(espaces.status === 400, `${LONGUEUR_MAX_COMMENTAIRE + 1} espaces -> 400 : la borne porte sur la chaine recue, pas sur sa version trimmee (recu ${espaces.status})`);

    const apres = await fetch(`${url}/api/env`);
    check(apres.status === 200, `le serveur repond encore en fin de parcours (recu ${apres.status})`);
    check(mortPremature === false, 'le processus serveur est toujours vivant');
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
