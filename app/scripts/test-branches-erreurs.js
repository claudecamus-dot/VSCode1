// Branches d'erreur HTTP jusqu'ici sans assertion :
//  - 413 sur POST /api/referentiel/import au-dela de 10 Mo (JSON { error }, base intacte) ;
//  - 404 GET /api/repondants/<inconnu> : corps { error } seul, aucun champ de repondant ;
//  - 404 DELETE /api/roles/<inconnu> ;
//  - 500 de l'export PPT quand l'interpreteur Python echoue (PYTHON = node lancant le .py :
//    erreur de syntaxe + chemin du script sur stderr) : corps JSON fixe, SANS fuite de stderr.
// Non couvert ici : le 503 d'une ecriture pendant un import « remplacer » EN COURS. Le verrou
// (importsRemplacerEnCours) est un compteur interne arme pendant un import asynchrone de
// quelques ms ; sans point d'injection (aucune modification du code autorisee) il est
// impossible de l'armer de facon deterministe.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { demarrerServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}
const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'branches-erreurs-'));
  const dbPath = path.join(dossierTmp, 'branches.db');
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
  db.prepare('INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)')
    .run('r1', 's1', 'r1@exemple.fr', 'Nom', 'Prenom', 'Dept', 'Alpha', 'Testeur', maintenant, maintenant);
  db.prepare('INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, 2)').run('r1', questionId);
  db.close();

  const { base, enfant: serveur, sortie: lireSortie } = await demarrerServeur({
    chemin: CHEMIN_SERVEUR, delaiMs: 15000,
    env: { DB_PATH: dbPath, APP_ENV: 'test-branches-erreurs', AUTH_USER: '', AUTH_PASS: '', PYTHON: process.execPath },
  });

  try {

    console.log('413 import referentiel > 10 Mo :');
    const stats = async () => JSON.stringify(await (await fetch(`${base}/api/referentiel/stats`)).json());
    const refAvant = JSON.stringify(await (await fetch(`${base}/api/referentiel`)).json());
    const statsAvant = await stats();
    const form = new FormData();
    form.append('mode', 'remplacer');
    form.append('fichier', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1024, 1)]), 'gros.xlsx');
    const gros = await fetchMutant(`${base}/api/referentiel/import`, { method: 'POST', body: form });
    const cg = await gros.json().catch(() => null);
    check(gros.status === 413, `413 (recu ${gros.status})`);
    check(cg && typeof cg.error === 'string' && /10 Mo/.test(cg.error), `corps JSON { error } mentionnant 10 Mo (${JSON.stringify(cg)})`);
    check(await stats() === statsAvant, 'compteurs de la base inchanges');
    check(JSON.stringify(await (await fetch(`${base}/api/referentiel`)).json()) === refAvant, 'referentiel intact (le mode remplacer n\'a pas ete execute)');

    console.log('404 repondant / role inconnus :');
    const rep = await fetch(`${base}/api/repondants/inconnu`);
    const cr = await rep.json();
    check(rep.status === 404, `GET repondant inconnu -> 404 (recu ${rep.status})`);
    check(JSON.stringify(Object.keys(cr)) === '["error"]', `corps = { error } seul, aucun champ de repondant (${JSON.stringify(cr)})`);
    const role = await fetchMutant(`${base}/api/roles/RoleInexistant`, { method: 'DELETE' });
    const cro = await role.json();
    check(role.status === 404 && cro.error === 'Role inconnu.', `DELETE role inconnu -> 404 « Role inconnu. » (recu ${role.status} ${JSON.stringify(cro)})`);

    console.log('500 export PPT, interpreteur en echec :');
    const ppt = await fetch(`${base}/api/sessions/s1/export-ppt?scope=equipe&equipe=Alpha`);
    const texte = await ppt.text();
    check(ppt.status === 500, `500 (recu ${ppt.status})`);
    let cp = null;
    try { cp = JSON.parse(texte); } catch { /* verifie ci-dessous */ }
    check(cp !== null && JSON.stringify(Object.keys(cp)) === '["error"]', `corps JSON { error } seul (${texte.slice(0, 200)})`);
    check(cp && cp.error === 'Echec de la generation du PPT.', `message fixe (${cp && cp.error})`);
    for (const fuite of ['SyntaxError', 'Traceback', 'export-restitution-ppt', '.py', 'restit-', os.tmpdir(), 'node:internal']) {
      check(!texte.includes(fuite), `pas de fuite « ${fuite} » cote client`);
    }
    check(/export-ppt/.test(lireSortie()), 'le diagnostic reste cote serveur (log [export-ppt])');
    check(/echec python : SyntaxError/.test(lireSortie()), "le journal garde le TYPE de l'exception Python");
    check(!/export-restitution-ppt\.py/.test(lireSortie()), 'le journal ne contient ni le chemin du script ni le texte de la trace Python');
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
