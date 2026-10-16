// (a) Comparaison inter-sessions et filtre manager : avec `?manager=sans`, la session
// « precedente » doit avoir au moins UN repondant soumis de l'equipe NON manager. Une
// session N-1 qui ne contient que le manager de l'equipe donnait disponible:true,
// effectif 0 et tous les `precedent` nuls, alors que N-2 etait exploitable.
// (b) Ordre du referentiel deterministe : a `ordre` egal (une entree archivee garde son
// ancien ordre), tri par id croissant.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');
const EQUIPE = 'Alpha';

let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));

async function creerSession(base, heuresAvant) {
  const r = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - heuresAvant * 3600 * 1000).toISOString(),
      fermeture_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    }),
  });
  const corps = await r.json();
  if (!corps.id) throw new Error(`creation de session refusee : ${r.status} ${JSON.stringify(corps)}`);
  return corps.id;
}

async function soumettre(base, sessionId, email, pilier, niveau, estManager) {
  const ident = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, nom: 'Nom', prenom: 'Prenom', departement: 'DeptCmp', equipe: EQUIPE, role: 'Testeur', est_manager: estManager, dans_equipe: true }),
  });
  const { id } = await ident.json();
  const ecr = await fetchMutant(`${base}/api/repondants/${id}/piliers/${pilier.id}/reponses`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reponses: [{ question_id: pilier.questionId, niveau }] }),
  });
  if (ecr.status !== 200) throw new Error(`ecriture refusee : ${ecr.status} ${await ecr.text()}`);
  const soum = await fetchMutant(`${base}/api/repondants/${id}/soumission`, { method: 'POST' });
  if (soum.status !== 200) throw new Error(`soumission refusee : ${soum.status} ${await soum.text()}`);
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comparaison-manager-'));
  const dbPath = path.join(dossierTmp, 'manager.db');
  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel, getReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [{ nom: 'Obj', ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }] },
  ]);
  const pilier = {
    id: dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier A'").get().id,
    questionId: dbSeed.prepare("SELECT id FROM questions WHERE texte = 'QA'").get().id,
  };

  console.log('(b) Ordre du referentiel a `ordre` egal : id croissant (archive inclus) :');
  const scId = dbSeed.prepare("SELECT id FROM sous_categories WHERE nom = 'Obj'").get().id;
  // Ids croissants dans l'ordre d'insertion ; tous partagent ordre = 7. On insere en
  // archivant (ils ne doivent pas entrer dans le perimetre des sessions de la partie a).
  for (const [nom, archive] of [['Z-archive', 1], ['M-archive', 1], ['A-archive', 1]]) {
    dbSeed.prepare('INSERT INTO piliers (nom, ordre, archive) VALUES (?, 7, ?)').run(`P ${nom}`, archive);
    dbSeed.prepare('INSERT INTO sous_categories (pilier_id, nom, ordre, archive) VALUES (?, ?, 7, ?)').run(pilier.id, `SC ${nom}`, archive);
    dbSeed.prepare('INSERT INTO questions (sous_categorie_id, ordre, texte, archive) VALUES (?, 7, ?, ?)').run(scId, `Q ${nom}`, archive);
  }
  // Sans departage explicite, SQLite sert les ex-aequo dans l'ordre que lui donne le
  // plan (ici un index couvrant dont la derniere colonne est le NOM, inverse de l'id) :
  // le test force ce plan pour que l'absence de `, id` soit observable.
  dbSeed.exec('CREATE INDEX t_ord_p ON piliers (ordre, nom)');
  dbSeed.exec('CREATE INDEX t_ord_sc ON sous_categories (pilier_id, ordre, nom)');
  dbSeed.exec('CREATE INDEX t_ord_q ON questions (sous_categorie_id, ordre, texte)');
  const ref = getReferentiel({ includeArchived: true });
  const ids = (l) => l.map((x) => x.id);
  const croissant = (l) => l.every((v, i) => i === 0 || v > l[i - 1]);
  const piliersOrdre7 = ref.filter((p) => p.ordre === 7);
  check(piliersOrdre7.length === 3 && croissant(ids(piliersOrdre7)), `piliers a ordre egal servis par id croissant (${JSON.stringify(ids(piliersOrdre7))})`);
  const pA = ref.find((p) => p.nom === 'Pilier A');
  const sc7 = pA.sousCategories.filter((s) => s.ordre === 7);
  check(sc7.length === 3 && croissant(ids(sc7)), `sous-categories a ordre egal par id croissant (${JSON.stringify(ids(sc7))})`);
  const q7 = pA.sousCategories.find((s) => s.nom === 'Obj').questions.filter((q) => q.ordre === 7);
  check(q7.length === 3 && croissant(ids(q7)), `questions a ordre egal par id croissant (${JSON.stringify(ids(q7))})`);
  dbSeed.close();

  const { base, enfant: serveur, sortie: lireSortie } = await demarrerServeur({
    chemin: CHEMIN_SERVEUR, delaiMs: DELAI_DEMARRAGE_MS,
    env: { DB_PATH: dbPath, APP_ENV: 'test-comparaison-manager', AUTH_USER: '', AUTH_PASS: '' },
  });

  try {
    console.log('(a) N-2 (manager + non-manager), N-1 (SEUL le manager), courante :');
    const n2 = await creerSession(base, 72);
    await soumettre(base, n2, 'mgr2@exemple.fr', pilier, 3, true);
    await soumettre(base, n2, 'col2@exemple.fr', pilier, 1, false);
    const n1 = await creerSession(base, 48);
    await soumettre(base, n1, 'mgr1@exemple.fr', pilier, 3, true);
    const courante = await creerSession(base, 1);
    await soumettre(base, courante, 'col0@exemple.fr', pilier, 2, false);

    const get = async (qs) => (await fetch(`${base}/api/sessions/${courante}/comparaison?equipe=${EQUIPE}${qs}`)).json();

    const defaut = await get('');
    check(defaut.disponible === true && defaut.precedente.id === n1, `par defaut : N-1 reste la precedente (recu ${defaut.precedente && defaut.precedente.id}, attendu ${n1})`);

    const sans = await get('&manager=sans');
    check(sans.disponible === true, 'manager=sans : comparaison disponible');
    check(sans.precedente && sans.precedente.id === n2, `manager=sans : N-2 retenue, pas N-1 (recu ${sans.precedente && sans.precedente.id}, attendu ${n2})`);
    check(sans.precedente && sans.precedente.effectif === 1, `manager=sans : effectif precedent = 1 (recu ${sans.precedente && sans.precedente.effectif})`);
    check((sans.axes || []).length > 0 && sans.axes.every((a) => a.precedent !== null), 'manager=sans : precedent non nul sur chaque axe');

    // Parametre repete : une seule valeur « sans » suffit (echec vers le plus restrictif).
    const repete = await get('&manager=sans&manager=x');
    check(repete.precedente && repete.precedente.id === n2, 'manager repete (sans puis x) : exclusion appliquee, N-2 retenue');
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
