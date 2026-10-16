// Anti-CSRF (src/csrf.js) : TOUTES les methodes mutantes (POST, PUT, DELETE, PATCH) sont
// controlees. Origin tierce ou Origin/Referer absents -> 403 (fail-closed) ; Origin = celle
// de la requete -> jamais 403. Garde la liste METHODES_MUTANTES : retirer DELETE (ou PUT,
// PATCH, POST) de l'ensemble fait passer la requete correspondante sans 403.
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

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-methodes-'));
  const { base, enfant: serveur, sortie: lireSortie } = await demarrerServeur({
    chemin: CHEMIN_SERVEUR, delaiMs: 15000,
    env: { DB_PATH: path.join(dossierTmp, 'csrf.db'), APP_ENV: 'test-csrf-methodes', AUTH_USER: '', AUTH_PASS: '' },
  });

  const appel = (methode, chemin, origin, corps) => fetch(`${base}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const roles = async () => (await fetch(`${base}/api/roles`)).json();

  try {
    const propre = new URL(base).origin;
    const tierce = 'http://evil.example';

    check((await appel('POST', '/api/roles', propre, { nom: 'RoleCsrf' })).status === 200, 'POST avec Origin propre : cree le role (200)');

    // Une mutation par methode, sur des routes reelles ; le 403 doit survenir avant toute logique.
    const cas = [
      ['POST', '/api/roles', { nom: 'RoleIntrus' }],
      ['PUT', '/api/sessions/inconnue/commentaire', { equipe: 'X', texte: 'x' }],
      ['DELETE', '/api/roles/RoleCsrf', undefined],
      ['PATCH', '/api/roles/RoleCsrf', { nom: 'Autre' }],
    ];
    for (const [methode, chemin, corps] of cas) {
      const tiers = await appel(methode, chemin, tierce, corps);
      check(tiers.status === 403, `${methode} avec Origin tierce -> 403 (recu ${tiers.status})`);
      const j = await tiers.json().catch(() => ({}));
      check(typeof j.error === 'string' && /CSRF/.test(j.error), `${methode} Origin tierce : corps JSON { error } CSRF`);
      const sans = await appel(methode, chemin, null, corps);
      check(sans.status === 403, `${methode} sans Origin ni Referer -> 403 fail-closed (recu ${sans.status})`);
    }
    const r = await roles();
    check(r.includes('RoleCsrf') && !r.includes('RoleIntrus'), `aucune mutation passee malgre les 403 (roles : ${JSON.stringify(r)})`);

    for (const methode of ['PUT', 'PATCH']) {
      const ok = await appel(methode, '/api/roles/RoleCsrf', propre, { nom: 'x' });
      check(ok.status !== 403, `${methode} avec Origin propre : pas de 403 (recu ${ok.status})`);
    }
    const ok = await appel('DELETE', '/api/roles/RoleCsrf', propre);
    check(ok.status === 200, `DELETE avec Origin propre : 200 (recu ${ok.status})`);
    check(!(await roles()).includes('RoleCsrf'), 'le role est bien supprime par le DELETE legitime');
    const get = await fetch(`${base}/api/roles`, { headers: { Origin: tierce } });
    check(get.status === 200, 'GET avec Origin tierce reste hors perimetre CSRF (200)');
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
