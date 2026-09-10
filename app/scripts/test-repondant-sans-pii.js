// GET /api/repondants/:id ne livre plus de donnees nominatives (finding
// securite de l'audit du 2026-09-04).
//
// Le defaut : cette route est en LISTE BLANCHE du parcours repondant
// (src/auth.js, ROUTES_REPONDANT — US10.5), donc atteignable SANS identifiants
// meme barriere Basic Auth active, et elle rendait la LIGNE COMPLETE du
// repondant : email, nom, prenom, departement, equipe, role. L'identifiant qui
// l'ouvre est un jeton porteur sans expiration, qui voyage dans l'URL, dans
// l'historique du navigateur et dans les liens copies : quiconque en detient un
// lisait l'etat civil de la personne.
//
// Le correctif est une PROJECTION cote serveur (server.js, CHAMPS_VUE_REPONDANT)
// et non une fermeture de la route : le parcours de reponse en a besoin sans
// compte, et son seul appelant (src/public/repondre.html) n'utilise que id,
// session_id, soumis_at et les reponses.
//
// Ce test tient les deux bouts, en HTTP reel avec la barriere ACTIVE :
//   - sans identifiants, la reponse ne porte AUCUNE des valeurs nominatives
//     saisies a l'identification, et le parcours (relecture, enregistrement,
//     soumission) continue de fonctionner ;
//   - avec identifiants, l'animateur voit toujours le detail nominatif de son
//     equipe (/api/sessions/:id/resultats) — garde-fou contre une correction
//     trop large qui casserait le drill-down US6.2.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');

// Valeurs volontairement improbables : on cherche leur presence dans le corps
// BRUT de la reponse, pas seulement dans une propriete attendue — une fuite par
// un champ renomme ou imbrique serait attrapee de la meme facon.
const PII = {
  email: 'zzz-pii-email@exemple.invalid',
  nom: 'ZzzNomNominatif',
  prenom: 'YyyPrenomNominatif',
  departement: 'WwwDepartementNominatif',
  equipe: 'VvvEquipeNominative',
  role: 'UuuRoleNominatif',
};

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

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repondant-sans-pii-'));
  const dbPath = path.join(dossierTmp, 'sans-pii.db');

  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier X', ordre: 0, sousCategories: [{ nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
  ]);
  const pilierId = dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier X'").get().id;
  const q1 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q1'").get().id;
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  // Barriere ACTIVE : c'est la configuration de production, celle ou la route en
  // liste blanche est la seule porte ouverte sur la table repondants.
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-repondant-sans-pii', AUTH_USER: USER, AUTH_PASS: PASS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  const entetesAnimateur = { Authorization: basic(USER, PASS) };

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation (cote animateur, avec identifiants) : une session ouverte :');
    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...entetesAnimateur },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    check(creation.status === 200, `session creee (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();

    console.log("Le repondant s'identifie SANS identifiants (parcours ouvert US10.5) :");
    const identification = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...PII, est_manager: false, dans_equipe: true }),
    });
    check(identification.status === 200, `identification -> 200 sans compte (recu ${identification.status})`);
    const { id: repondantId } = await identification.json();

    console.log('LE POINT DU TEST : relecture SANS identifiants -> aucune donnee nominative :');
    const relecture = await fetch(`${base}/api/repondants/${repondantId}`);
    check(relecture.status === 200, `relecture ouverte au repondant -> 200 (recu ${relecture.status})`);
    const brut = await relecture.text();
    for (const [champ, valeur] of Object.entries(PII)) {
      check(!brut.includes(valeur), `la reponse ne porte pas ${champ} (valeur "${valeur}")`);
    }
    const vue = JSON.parse(brut);
    for (const champ of Object.keys(PII)) {
      check(vue[champ] === undefined, `aucun champ "${champ}" dans la reponse (recu ${JSON.stringify(vue[champ])})`);
    }

    console.log('...et le parcours de reponse dispose toujours de ce dont il se sert :');
    check(vue.id === repondantId, "l'identifiant est rendu (repondre.html s'en sert pour ses ecritures)");
    check(vue.session_id === sessionId, 'session_id est rendu (controle d appartenance du lien ?rid=)');
    check(vue.soumis_at === null, 'soumis_at est rendu (ecran "deja soumis")');
    check(Array.isArray(vue.reponses) && vue.reponses.length === 0, 'reponses est rendu (reprise de la saisie)');

    console.log('Le parcours complet fonctionne encore sans compte (enregistrement, soumission, relecture) :');
    const enregistrement = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: q1, niveau: 2 }] }),
    });
    check(enregistrement.status === 200, `PUT reponses -> 200 (recu ${enregistrement.status})`);
    const apresEcriture = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(
      apresEcriture.reponses.length === 1 && apresEcriture.reponses[0].niveau === 2,
      `la reponse enregistree est relue (recu ${JSON.stringify(apresEcriture.reponses)})`
    );
    const soumission = await fetchMutant(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
    check(soumission.status === 200, `POST soumission -> 200 (recu ${soumission.status})`);
    const apresSoumission = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(apresSoumission.soumis_at !== null, 'soumis_at bascule apres la soumission');

    // CONTRE-EPREUVE, reformulee le 2026-09-10. Elle garde son role — prouver
    // que le durcissement du parcours repondant n'a pas casse le drill-down de
    // l'animateur — mais vise la route ou ce drill-down vit desormais. Depuis
    // l'arbitrage du 2026-09-10, /resultats rend l'agrege sans appariement
    // nom <-> niveau ; le detail d'UNE question s'obtient a la demande sur
    // /questions/:questionId/detail, authentifie de la meme facon.
    console.log("Contre-epreuve : l'ANIMATEUR authentifie obtient toujours le detail nominatif, a la demande (US6.2) :");
    const resultats = await fetch(
      `${base}/api/sessions/${sessionId}/resultats?equipe=${encodeURIComponent(PII.equipe)}&manager=avec`,
      { headers: entetesAnimateur }
    );
    check(resultats.status === 200, `resultats animateur -> 200 (recu ${resultats.status})`);
    const { piliers } = await resultats.json();
    check(
      !JSON.stringify(piliers).includes(PII.nom),
      "l'agrege ne porte plus l'appariement nom <-> niveau (il ne descend plus masque dans le DOM)"
    );

    const detail = await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(PII.equipe)}&manager=avec`,
      { headers: entetesAnimateur }
    );
    check(detail.status === 200, `detail d'une question -> 200 pour l'animateur (recu ${detail.status})`);
    const brutDetail = await detail.text();
    check(brutDetail.includes(PII.nom), 'le nom du repondant est bien rendu a la demande (drill-down non casse)');
    check(brutDetail.includes(PII.prenom), 'le prenom du repondant est bien rendu a la demande');

    // Et le repondant, lui, n'y accede pas : cette route n'est pas dans la
    // liste blanche du parcours repondant, donc la barriere fail-closed la
    // protege comme le reste de l'espace animateur.
    const detailSansIdentifiants = await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(PII.equipe)}&manager=avec`
    );
    check(
      detailSansIdentifiants.status === 401,
      `la route de detail refuse un appel du parcours repondant (recu ${detailSansIdentifiants.status})`
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
