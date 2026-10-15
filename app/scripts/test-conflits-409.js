// Conflits 409 du parcours repondant (server.js) :
//  - POST soumission d'un questionnaire INCOMPLET -> 409 « (n/total) », le repondant n'est pas
//    marque soumis et n'entre pas dans les agregats ;
//  - POST soumission deja soumis -> 409 « deja soumis » ; PUT reponses deja soumis -> 409 ;
//    la double soumission et la tentative de modification ne changent pas les agregats.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}
const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
const json = { 'Content-Type': 'application/json' };

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conflits-409-'));
  const dbPath = path.join(dossierTmp, 'conflits.db');
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [{ nom: 'ObjA', ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }] },
    { nom: 'Pilier B', ordre: 1, sousCategories: [{ nom: 'ObjB', ordre: 0, questions: [{ texte: 'QB', niveaux: niveaux() }] }] },
  ]);
  const pA = { id: db.prepare("SELECT id FROM piliers WHERE nom = 'Pilier A'").get().id, q: db.prepare("SELECT id FROM questions WHERE texte = 'QA'").get().id };
  const pB = { id: db.prepare("SELECT id FROM piliers WHERE nom = 'Pilier B'").get().id, q: db.prepare("SELECT id FROM questions WHERE texte = 'QB'").get().id };
  db.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-conflits-409', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  const ecrire = (id, pilier, niveau) => fetchMutant(`${base}/api/repondants/${id}/piliers/${pilier.id}/reponses`, {
    method: 'PUT', headers: json, body: JSON.stringify({ reponses: [{ question_id: pilier.q, niveau }] }),
  });
  const soumettre = (id) => fetchMutant(`${base}/api/repondants/${id}/soumission`, { method: 'POST' });

  try {
    await attendreServeur(base, 15000, serveur, () => sortie);
    const cs = await (await fetchMutant(`${base}/api/sessions`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ ouverture_at: new Date(Date.now() - 3600e3).toISOString(), fermeture_at: new Date(Date.now() + 3600e3).toISOString() }),
    })).json();
    const sid = cs.id;
    const identifier = async (email) => (await (await fetchMutant(`${base}/api/sessions/${sid}/repondants`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ email, nom: 'Nom', prenom: 'Prenom', departement: 'Dept', equipe: 'Alpha', role: 'Testeur', est_manager: false, dans_equipe: true }),
    })).json()).id;
    const resultats = async () => (await fetch(`${base}/api/sessions/${sid}/resultats?equipe=Alpha`)).json();

    console.log('Questionnaire incomplet :');
    const inc = await identifier('incomplet@exemple.fr');
    check((await ecrire(inc, pA, 3)).status === 200, 'pilier A enregistre (200)');
    const rInc = await soumettre(inc);
    const cInc = await rInc.json();
    check(rInc.status === 409, `soumission incomplete -> 409 (recu ${rInc.status})`);
    check(/1\/2/.test(cInc.error || ''), `message indique 1/2 (recu "${cInc.error}")`);
    check((await (await fetch(`${base}/api/repondants/${inc}`)).json()).soumis_at === null, 'repondant non marque soumis');
    check((await resultats()).effectif === 0, 'effectif des resultats = 0');

    console.log('Double soumission / modification apres soumission :');
    const ok = await identifier('complet@exemple.fr');
    await ecrire(ok, pA, 1);
    await ecrire(ok, pB, 1);
    check((await soumettre(ok)).status === 200, 'soumission complete -> 200');
    const avant = await resultats();
    const qAvant = avant.piliers.map((p) => p.sousCategories[0].questions[0].moyenne);
    const soumisAvant = (await (await fetch(`${base}/api/repondants/${ok}`)).json()).soumis_at;

    const bis = await soumettre(ok);
    const cBis = await bis.json();
    check(bis.status === 409 && /deja soumis/i.test(cBis.error || ''), `2e soumission -> 409 deja soumis (recu ${bis.status} "${cBis.error}")`);
    const put = await ecrire(ok, pA, 3);
    const cPut = await put.json();
    check(put.status === 409 && /deja soumis/i.test(cPut.error || ''), `PUT apres soumission -> 409 (recu ${put.status} "${cPut.error}")`);

    const apres = await resultats();
    const qApres = apres.piliers.map((p) => p.sousCategories[0].questions[0].moyenne);
    check(avant.effectif === 1 && apres.effectif === 1, `effectif inchange (${avant.effectif} -> ${apres.effectif})`);
    check(JSON.stringify(qAvant) === JSON.stringify(qApres) && qAvant.every((m) => m === 1), `moyennes inchangees (${qAvant} -> ${qApres})`);
    check((await (await fetch(`${base}/api/repondants/${ok}`)).json()).soumis_at === soumisAvant, 'soumis_at inchange');
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
