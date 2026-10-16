// Agregats : (1) /resultats n'agrege QUE les repondants ayant SOUMIS (selectionnerRepondants,
// `AND soumis_at IS NOT NULL`) : un repondant non soumis, meme avec des reponses en base,
// n'entre ni dans l'effectif ni dans les moyennes ; (2) /equipes et /departements avec
// `?manager=sans` excluent les managers de l'effectif (agregerEffectifPar,
// `AND est_manager = 0`). Les valeurs sont choisies pour distinguer les cas :
// soumis niveau 1, non soumis niveau 3 -> moyenne 1 (avec le non soumis : 2).
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerServeur, attendreMort, nettoyer } = require('./helpers-serveur');

const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}
const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agregats-'));
  const dbPath = path.join(dossierTmp, 'agregats.db');
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [{ nom: 'Obj', ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }] },
  ]);
  const questionId = db.prepare("SELECT id FROM questions WHERE texte = 'QA'").get().id;
  const maintenant = new Date().toISOString();
  db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)')
    .run('s1', new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString(), maintenant);
  // [id, equipe, departement, est_manager, soumis, niveau]
  const lignes = [
    ['soumis', 'Alpha', 'DeptX', 0, true, 1],
    ['non-soumis', 'Alpha', 'DeptX', 0, false, 3],
    ['manager', 'Beta', 'DeptX', 1, true, 3],
    ['collab', 'Beta', 'DeptX', 0, true, 1],
  ];
  for (const [id, equipe, dep, mgr, soumis, niveau] of lignes) {
    db.prepare('INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .run(id, 's1', `${id}@exemple.fr`, id, 'P', dep, equipe, 'Testeur', mgr, maintenant, soumis ? maintenant : null);
    db.prepare('INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, ?)').run(id, questionId, niveau);
  }
  db.close();

  const { base, enfant: serveur, sortie: lireSortie } = await demarrerServeur({
    chemin: CHEMIN_SERVEUR, delaiMs: 15000,
    env: { DB_PATH: dbPath, APP_ENV: 'test-agregats', AUTH_USER: '', AUTH_PASS: '' },
  });
  const get = async (chemin) => (await fetch(`${base}/api/sessions/s1/${chemin}`)).json();

  try {
    console.log('(1) /resultats exclut le non soumis :');
    const res = await get('resultats?equipe=Alpha');
    const q = res.piliers[0].sousCategories[0].questions[0];
    check(res.effectif === 1, `effectif = 1 (recu ${res.effectif})`);
    check(q.nbReponses === 1, `nbReponses = 1 (recu ${q.nbReponses})`);
    check(q.moyenne === 1 && q.max === 1, `moyenne 1 et max 1, pas le niveau 3 du non soumis (moyenne ${q.moyenne}, max ${q.max})`);
    check(res.effectifTotal === 2 && res.repondants.nonSoumis.length === 1 && res.repondants.soumis.length === 1,
      `le panneau « qui a repondu » liste bien le non soumis a part (total ${res.effectifTotal})`);

    console.log('(2) effectif par equipe/departement, manager=sans :');
    const eqAvec = await get('equipes');
    const eqSans = await get('equipes?manager=sans');
    const beta = (l) => l.find((e) => e.equipe === 'Beta');
    check(beta(eqAvec).effectif === 2, `equipes : Beta = 2 par defaut (recu ${beta(eqAvec).effectif})`);
    check(beta(eqSans).effectif === 1, `equipes?manager=sans : Beta = 1 (recu ${beta(eqSans).effectif})`);
    check(eqSans.find((e) => e.equipe === 'Alpha').effectif === 1, 'equipes : Alpha = 1 (le non soumis ne compte pas)');
    const depAvec = await get('departements');
    const depSans = await get('departements?manager=sans');
    check(depAvec.length === 1 && depAvec[0].effectif === 3, `departements : 3 soumis par defaut (recu ${JSON.stringify(depAvec)})`);
    check(depSans.length === 1 && depSans[0].effectif === 2, `departements?manager=sans : 2 (recu ${JSON.stringify(depSans)})`);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + lireSortie());
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
