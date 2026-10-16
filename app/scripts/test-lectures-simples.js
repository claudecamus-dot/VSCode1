// Lectures simples d'une session : GET /summary (200 + champs, 404 si inconnue) et
// suggestions departements/equipes (filtrees par SESSION ; dedoublonnage casse/accents a
// l'identification : « Équipe A » puis « equipe a » -> une seule valeur, car le serveur
// rattache la 2e saisie a l'orthographe deja connue ; liste vide pour une session neuve ;
// 404 si session inconnue).
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
const json = { 'Content-Type': 'application/json' };

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lectures-'));
  const dbPath = path.join(dossierTmp, 'lectures.db');
  process.env.DB_PATH = dbPath;
  const db = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [{ nom: 'Obj', ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }] },
  ]);
  db.close();

  const { base, enfant: serveur, sortie: lireSortie } = await demarrerServeur({
    chemin: CHEMIN_SERVEUR, delaiMs: 15000,
    env: { DB_PATH: dbPath, APP_ENV: 'test-lectures', AUTH_USER: '', AUTH_PASS: '' },
  });

  try {
    const ouv = new Date(Date.now() - 3600e3).toISOString();
    const fer = new Date(Date.now() + 3600e3).toISOString();
    const creer = async () => (await (await fetchMutant(`${base}/api/sessions`, {
      method: 'POST', headers: json, body: JSON.stringify({ ouverture_at: ouv, fermeture_at: fer }),
    })).json()).id;
    const s1 = await creer();
    const s2 = await creer();
    const s3 = await creer();
    const identifier = (sid, email, departement, equipe) => fetchMutant(`${base}/api/sessions/${sid}/repondants`, {
      method: 'POST', headers: json,
      body: JSON.stringify({ email, nom: 'Nom', prenom: 'Prenom', departement, equipe, role: 'Testeur', est_manager: false, dans_equipe: true }),
    });

    console.log('GET /summary :');
    const sum = await fetch(`${base}/api/sessions/${s1}/summary`);
    const cs = await sum.json();
    check(sum.status === 200, `session valide -> 200 (recu ${sum.status})`);
    check(cs.id === s1 && cs.ouverture_at === ouv && cs.fermeture_at === fer, 'champs id, ouverture_at, fermeture_at');
    check(Object.keys(cs).sort().join() === 'fermeture_at,id,ouverture_at', `aucun autre champ (${Object.keys(cs)})`);
    const inc = await fetch(`${base}/api/sessions/inconnue/summary`);
    const ci = await inc.json();
    check(inc.status === 404 && typeof ci.error === 'string', `id inconnu -> 404 { error } (recu ${inc.status})`);

    console.log('Suggestions :');
    check((await identifier(s1, 'a@exemple.fr', 'Direction Été', 'Équipe A')).status === 200, 'identification 1');
    check((await identifier(s1, 'b@exemple.fr', 'direction ete', 'equipe a')).status === 200, 'identification 2 (casse/accents differents)');
    check((await identifier(s1, 'c@exemple.fr', 'Direction Été', 'Équipe B')).status === 200, 'identification 3');
    check((await identifier(s2, 'd@exemple.fr', 'Autre Dept', 'Equipe Zeta')).status === 200, 'identification session 2');
    const eq1 = await (await fetch(`${base}/api/sessions/${s1}/equipes-suggestions`)).json();
    const dep1 = await (await fetch(`${base}/api/sessions/${s1}/departements-suggestions`)).json();
    check(JSON.stringify(eq1) === JSON.stringify(['Équipe A', 'Équipe B']), `equipes session 1 dedoublonnees (${JSON.stringify(eq1)})`);
    check(JSON.stringify(dep1) === JSON.stringify(['Direction Été']), `departements session 1 dedoublonnes (${JSON.stringify(dep1)})`);
    const eq2 = await (await fetch(`${base}/api/sessions/${s2}/equipes-suggestions`)).json();
    check(JSON.stringify(eq2) === JSON.stringify(['Equipe Zeta']), `session 2 ne voit que SES equipes (${JSON.stringify(eq2)})`);
    const dep2 = await (await fetch(`${base}/api/sessions/${s2}/departements-suggestions`)).json();
    check(JSON.stringify(dep2) === JSON.stringify(['Autre Dept']), `session 2 ne voit que SES departements (${JSON.stringify(dep2)})`);
    check(JSON.stringify(await (await fetch(`${base}/api/sessions/${s3}/equipes-suggestions`)).json()) === '[]', 'session neuve : equipes []');
    check(JSON.stringify(await (await fetch(`${base}/api/sessions/${s3}/departements-suggestions`)).json()) === '[]', 'session neuve : departements []');
    for (const route of ['equipes-suggestions', 'departements-suggestions']) {
      check((await fetch(`${base}/api/sessions/inconnue/${route}`)).status === 404, `${route} : session inconnue -> 404`);
    }
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
