// Confidentialite de la consolidation departement (correctif du 2026-09-01,
// agregerResultats(..., { nominatif: false })). Le detail "qui a repondu quoi"
// (nom/prenom par reponse) n'a de destinataire legitime que l'ecran animateur
// d'UNE equipe (drill-down) et l'export PPT, tous deux cote serveur. La
// consolidation departement le recevait quand meme : le navigateur du sponsor
// telechargeait nom, prenom et niveau de chaque reponse du departement, alors
// que le document des personas promet une granularite equipe minimum. Ce test
// verrouille l'ABSENCE totale de nom/prenom cote consolidation, et verifie en
// temoin que la route resultats d'UNE equipe, elle, les porte toujours (la
// regression a corriger n'est pas "plus jamais de nominatif nulle part").
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');

// Identifiants improbables ailleurs dans le referentiel/les libelles, pour que
// leur ABSENCE du JSON de consolidation soit une preuve fiable (pas de faux
// positif venant d'un texte de pilier/objectif qui contiendrait le mot "nom").
const NOM_REPONDANT = 'Zorglurbin';
const PRENOM_REPONDANT = 'Xanthophyle';

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
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'confid-consolidation-'));
  const dbPath = path.join(dossierTmp, 'confid.db');

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
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-confid-consolidation', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : session ouverte, repondant identifie, pilier repondu et soumis :');
    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    const { id: sessionId } = await creation.json();

    const identification = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'confid@exemple.fr',
        nom: NOM_REPONDANT,
        prenom: PRENOM_REPONDANT,
        departement: 'DeptConfid',
        equipe: 'EquipeConfid',
        role: 'Testeur',
        est_manager: false,
        dans_equipe: true,
      }),
    });
    check(identification.status === 200, `repondant identifie (recu ${identification.status})`);
    const { id: repondantId } = await identification.json();

    const enregistrement = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: q1, niveau: 2 }] }),
    });
    check(enregistrement.status === 200, `pilier enregistre (recu ${enregistrement.status})`);

    const soumission = await fetchMutant(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
    check(soumission.status === 200, `questionnaire soumis (recu ${soumission.status})`);

    console.log("Consolidation departement (nominatif:false) : NI nom NI prenom du repondant dans le JSON :");
    const consolidation = await fetch(`${base}/api/sessions/${sessionId}/consolidation?departement=DeptConfid`);
    check(consolidation.status === 200, `GET consolidation -> 200 (recu ${consolidation.status})`);
    const texteConsolidation = JSON.stringify(await consolidation.json());
    check(!texteConsolidation.includes(NOM_REPONDANT), `le nom du repondant est absent de la consolidation (${NOM_REPONDANT})`);
    check(!texteConsolidation.includes(PRENOM_REPONDANT), `le prenom du repondant est absent de la consolidation (${PRENOM_REPONDANT})`);

    console.log("Temoin : la route resultats d'UNE equipe reste nominative (la regression n'etend pas le silence partout) :");
    const resultatsEquipe = await fetch(`${base}/api/sessions/${sessionId}/resultats?equipe=EquipeConfid`);
    check(resultatsEquipe.status === 200, `GET resultats -> 200 (recu ${resultatsEquipe.status})`);
    const texteResultats = JSON.stringify(await resultatsEquipe.json());
    check(texteResultats.includes(NOM_REPONDANT), `le nom du repondant est present dans les resultats d'equipe (${NOM_REPONDANT})`);
    check(texteResultats.includes(PRENOM_REPONDANT), `le prenom du repondant est present dans les resultats d'equipe (${PRENOM_REPONDANT})`);
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
