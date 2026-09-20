// Verrou fail-closed pendant la fenetre destructive de l'import mode=remplacer
// (decision de conception arbitree le 2026-09-04, docs/wiki/todo.md). Avant ce
// correctif : le correcteur orthographique tourne dans un worker (~qq secondes),
// le serveur reste disponible pendant ce temps, et une soumission/reponse
// enregistree dans cette fenetre etait acceptee (200) PUIS effacee sans trace
// par le remplacerTout qui suit — aucune erreur, aucune trace, la personne
// croyait avoir repondu. Ce test verifie que la fenetre est desormais fermee
// (503, rien ecrit) et qu'elle se rouvre normalement une fois l'import termine.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ExcelJS = require('exceljs');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./test-helpers-serveur');

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

// Grille minimale au format exact attendu par parseWorkbook (referentiel.js) :
// entete "PILIER - OBJECTIF", ligne "Question", ligne "1 choix possible" avec
// les 4 niveaux aux colonnes D/F/H/J.
async function construireClasseurXlsx(nomPilier) {
  const workbook = new ExcelJS.Workbook();
  const feuille = workbook.addWorksheet('Referentiel');
  feuille.getCell('A1').value = `${nomPilier} - Objectif test`;
  feuille.getCell('A2').value = 'Question';
  feuille.getCell('B2').value = 'Question test ?';
  feuille.getCell('A3').value = '1 choix possible';
  feuille.getCell('D3').value = 'Niveau 0';
  feuille.getCell('F3').value = 'Niveau 1';
  feuille.getCell('H3').value = 'Niveau 2';
  feuille.getCell('J3').value = 'Niveau 3';
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function importer(base, nomPilier, mode) {
  const buffer = await construireClasseurXlsx(nomPilier);
  const form = new FormData();
  form.append('fichier', new Blob([buffer]), 'referentiel.xlsx');
  form.append('mode', mode);
  return fetchMutant(`${base}/api/referentiel/import`, { method: 'POST', body: form });
}

async function creerSessionEtRepondant(base) {
  const creation = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  check(creation.status === 200, `session creee (recu ${creation.status})`);
  const { id: sessionId } = await creation.json();

  const identification = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'fenetre-import@exemple.fr',
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

  const referentiel = await (await fetch(`${base}/api/sessions/${sessionId}/referentiel`)).json();
  const question = referentiel[0].sousCategories[0].questions[0];
  return { sessionId, repondantId, pilierId: referentiel[0].id, questionId: question.id };
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenetre-import-'));
  const dbPath = path.join(dossierTmp, 'fenetre-import.db');

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-fenetre-import', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : referentiel initial (import conserver), session ouverte, repondant identifie :');
    const importInitial = await importer(base, 'Pilier Initial', 'conserver');
    check(importInitial.status === 200, `import initial conserver -> 200 (recu ${importInitial.status})`);
    const { sessionId, repondantId, pilierId, questionId } = await creerSessionEtRepondant(base);

    console.log("Hors fenetre d'import : enregistrer un pilier reussit (temoin nominal) :");
    const temoin = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: questionId, niveau: 0 }] }),
    });
    check(temoin.status === 200, `PUT reponses hors fenetre -> 200 (recu ${temoin.status})`);

    console.log("Lancement d'un import mode=remplacer (non attendu) puis tentatives d'ecriture PENDANT la fenetre :");
    const importRemplacer = importer(base, 'Pilier Remplace', 'remplacer');
    // Le correcteur (chargement dictionnaire + suggestions) prend plusieurs
    // secondes ; 800 ms suffit largement a laisser importFromBuffer poser le
    // verrou (parseWorkbook d'un classeur de 3 lignes est quasi instantane) sans
    // pour autant risquer que l'import se termine avant nos verifications.
    await new Promise((r) => setTimeout(r, 800));

    const ecritureBloquee = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: questionId, niveau: 3 }] }),
    });
    check(ecritureBloquee.status === 503, `PUT reponses PENDANT la fenetre -> 503 (recu ${ecritureBloquee.status})`);

    const soumissionBloquee = await fetchMutant(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
    check(soumissionBloquee.status === 503, `POST soumission PENDANT la fenetre -> 503 (recu ${soumissionBloquee.status})`);

    const inscriptionBloquee = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pendant-fenetre@exemple.fr', nom: 'N', prenom: 'P', departement: 'D', equipe: 'E', role: 'R',
        est_manager: false, dans_equipe: true,
      }),
    });
    check(inscriptionBloquee.status === 503, `POST inscription (nouveau repondant) PENDANT la fenetre -> 503 (recu ${inscriptionBloquee.status})`);

    // Creation de SESSION pendant la fenetre (audit robustesse du 2026-09-19).
    // POST /api/sessions etait la seule route mutante sans
    // refuserSiImportEnCours : la session creee materialise son perimetre dans
    // session_questions, que le REMPLACER en cours efface ensuite par cascade.
    // activeQuestionIds() retombe alors sur son repli « aucune ligne = tout le
    // referentiel », confondant session jamais cadree et perimetre DETRUIT : le
    // questionnaire s'elargit en silence.
    const creationBloquee = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 3600_000).toISOString(),
        fermeture_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    });
    check(creationBloquee.status === 503, `POST /api/sessions PENDANT la fenetre -> 503 (recu ${creationBloquee.status})`);


    const resultatImport = await importRemplacer;
    check(resultatImport.status === 200, `import remplacer -> 200 une fois termine (recu ${resultatImport.status})`);
    const corpsImport = await resultatImport.json();
    check(corpsImport.mode === 'remplacer', `mode confirme "remplacer" (recu ${corpsImport.mode})`);

    console.log("La tentative bloquee n'a rien ecrit (le repondant a disparu avec remplacerTout, comme attendu) :");
    const relectureApresRemplacement = await fetch(`${base}/api/repondants/${repondantId}`);
    check(relectureApresRemplacement.status === 404, `ancien repondant introuvable apres remplacement (recu ${relectureApresRemplacement.status})`);

    console.log("Fenetre refermee : un nouveau cycle identification + reponse reussit normalement apres l'import :");
    const apres = await creerSessionEtRepondant(base);
    const ecritureApres = await fetchMutant(`${base}/api/repondants/${apres.repondantId}/piliers/${apres.pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: apres.questionId, niveau: 1 }] }),
    });
    check(ecritureApres.status === 200, `PUT reponses APRES l'import -> 200, verrou relache (recu ${ecritureApres.status})`);

    console.log('Bug corrige : un import CONSERVER concurrent ne doit PAS relacher le verrou d\'un REMPLACER encore en cours :');
    // Volontairement des id BIDON pour les verifications ci-dessous : le verrou
    // repond AVANT toute lecture en base (premiere ligne du handler), donc 503
    // pendant la fenetre / 404 hors fenetre sont observables sans dependre d'un
    // repondant ou d'un pilier reels -- ce qui evite tout couplage avec l'etat
    // du referentiel que ces deux imports concurrents vont remanier.
    const conserverConcurrent = importer(base, 'Pilier Conserver Concurrent', 'conserver');
    // Depart decale : le conserver, parti en premier, doit finir en premier
    // (meme cout de chargement du dictionnaire ~qq s pour les deux, le
    // remplacer a 1,5 s de retard au demarrage) -- pendant que le remplacer
    // est ENCORE en cours quand on verifie juste apres. Marge elargie de
    // 500 ms a 1,5 s (flakiness constatee sous charge machine : plusieurs
    // sous-agents + suite de tests tournant en parallele reduisaient la marge
    // au point d'inverser l'ordre de fin une fois sur ~20 runs).
    await new Promise((r) => setTimeout(r, 1500));
    const remplacerConcurrent = importer(base, 'Pilier Remplacer Concurrent', 'remplacer');

    const resultatConserverConcurrent = await conserverConcurrent;
    check(resultatConserverConcurrent.status === 200, `import conserver concurrent -> 200 (recu ${resultatConserverConcurrent.status})`);

    const ecritureJusteApresConserver = await fetchMutant(`${base}/api/repondants/bidon/piliers/0/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [] }),
    });
    check(
      ecritureJusteApresConserver.status === 503,
      `PUT juste apres la fin du CONSERVER concurrent -> toujours 503 (verrou tenu par le REMPLACER en cours, recu ${ecritureJusteApresConserver.status})`
    );

    const resultatRemplacerConcurrent = await remplacerConcurrent;
    check(resultatRemplacerConcurrent.status === 200, `import remplacer concurrent -> 200 une fois termine (recu ${resultatRemplacerConcurrent.status})`);

    const ecritureApresLesDeux = await fetchMutant(`${base}/api/repondants/bidon/piliers/0/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [] }),
    });
    check(
      ecritureApresLesDeux.status === 404,
      `verrou bien releve une fois le REMPLACER concurrent termine (404 "repondant inconnu", plus de 503 ; recu ${ecritureApresLesDeux.status})`
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
