// Fenetre de saisie (sessionOuverteOu409, server.js) : un repondant DEJA cree dont la session
// n'est pas (ou plus) ouverte ne peut ni enregistrer de reponses ni soumettre -> 409 avec
// `statut` distinct : 'pas_encore_ouverte' (ouverture dans le futur) et 'fermee'. Garde
// `statut !== 'ouverte'` : remplacee par `statut === 'fermee'`, une session pas encore ouverte
// laisserait passer les ecritures.
// Les sessions/repondants sont inseres directement dans la base temporaire AVANT le demarrage
// du serveur (l'identification refuse deja une session non ouverte).
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
const h = (heures) => new Date(Date.now() + heures * 3600 * 1000).toISOString();

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'statut-fenetre-'));
  const dbPath = path.join(dossierTmp, 'statut.db');
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [{ nom: 'Obj', ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }] },
  ]);
  const pilierId = db.prepare("SELECT id FROM piliers WHERE nom = 'Pilier A'").get().id;
  const questionId = db.prepare("SELECT id FROM questions WHERE texte = 'QA'").get().id;
  const sessions = { future: ['s-future', h(2), h(4)], fermee: ['s-fermee', h(-4), h(-2)], ouverte: ['s-ouverte', h(-1), h(1)] };
  for (const [id, ouv, fer] of Object.values(sessions)) {
    db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)').run(id, ouv, fer, new Date().toISOString());
    db.prepare('INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)')
      .run(`r-${id}`, id, `${id}@exemple.fr`, 'Nom', 'Prenom', 'Dept', 'Equipe', 'Testeur', new Date().toISOString());
  }
  db.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-statut-fenetre', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  const json = { 'Content-Type': 'application/json' };
  const ecrire = (id) => fetchMutant(`${base}/api/repondants/r-${id}/piliers/${pilierId}/reponses`, {
    method: 'PUT', headers: json, body: JSON.stringify({ reponses: [{ question_id: questionId, niveau: 2 }] }),
  });
  const soumettre = (id) => fetchMutant(`${base}/api/repondants/r-${id}/soumission`, { method: 'POST' });
  const nbReponses = async (id) => (await (await fetch(`${base}/api/repondants/r-${id}`)).json()).reponses.length;

  try {
    await attendreServeur(base, 15000, serveur, () => sortie);
    for (const [cle, attendu] of [['future', 'pas_encore_ouverte'], ['fermee', 'fermee']]) {
      const id = sessions[cle][0];
      console.log(`Session ${cle} :`);
      const put = await ecrire(id);
      const cp = await put.json();
      check(put.status === 409, `PUT reponses -> 409 (recu ${put.status})`);
      check(cp.statut === attendu, `PUT : statut '${attendu}' (recu '${cp.statut}')`);
      check(typeof cp.error === 'string' && cp.error.length > 0, 'PUT : message { error }');
      const soum = await soumettre(id);
      const cs = await soum.json();
      check(soum.status === 409, `POST soumission -> 409 (recu ${soum.status})`);
      check(cs.statut === attendu, `soumission : statut '${attendu}' (recu '${cs.statut}')`);
      check((await nbReponses(id)) === 0, 'aucune reponse n\'a ete ecrite');
      const vue = await (await fetch(`${base}/api/repondants/r-${id}`)).json();
      check(vue.soumis_at === null, 'le repondant n\'est pas marque soumis');
    }
    const msgFutur = (await (await ecrire(sessions.future[0])).json()).error;
    const msgFermee = (await (await ecrire(sessions.fermee[0])).json()).error;
    check(msgFutur !== msgFermee, 'messages distincts entre pas encore ouverte et fermee');

    console.log('Session ouverte (temoin) :');
    check((await ecrire(sessions.ouverte[0])).status === 200, 'PUT reponses -> 200');
    check((await soumettre(sessions.ouverte[0])).status === 200, 'POST soumission -> 200');
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
