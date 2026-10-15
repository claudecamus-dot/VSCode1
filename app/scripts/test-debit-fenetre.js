// Limiteur de debit (src/debit.js) : la fenetre se REINITIALISE. Apres `max` requetes, la
// suivante est en 429 (avec Retry-After) ; une fois la fenetre ecoulee, le compteur repart
// a zero et la requete repasse. Garde `!seau || maintenant - seau.debut > fenetreMs` : sans
// la comparaison de duree, le seau n'est jamais renouvele et le blocage devient definitif.
// Le limiteur precede la validation : session inconnue -> 404 tant qu'on n'est pas limite.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');
const FENETRE_MS = 600;
const MAX = 3;
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'debit-fenetre-'));
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: path.join(dossierTmp, 'debit.db'), APP_ENV: 'test-debit-fenetre',
      AUTH_USER: '', AUTH_PASS: '', DEBIT_FENETRE_MS: String(FENETRE_MS), DEBIT_MAX: String(MAX),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  const post = () => fetchMutant(`${base}/api/sessions/inconnue/repondants`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });

  try {
    await attendreServeur(base, 15000, serveur, () => sortie);
    // Les premieres requetes doivent tenir dans UNE fenetre : on les envoie en rafale.
    const debut = Date.now();
    const statuts = [];
    for (let i = 0; i < MAX; i += 1) statuts.push((await post()).status);
    const suivante = await post();
    const duree = Date.now() - debut;
    check(duree < FENETRE_MS - 100, `rafale terminee dans la fenetre (${duree} ms < ${FENETRE_MS} ms)`);
    check(statuts.every((s) => s !== 429), `les ${MAX} premieres passent (statuts ${statuts})`);
    check(suivante.status === 429, `la ${MAX + 1}e est en 429 (recu ${suivante.status})`);
    check(Number(suivante.headers.get('retry-after')) >= 1, 'Retry-After >= 1 s present');
    const j = await suivante.json();
    check(typeof j.error === 'string', 'corps JSON { error } sur le 429');

    await new Promise((r) => setTimeout(r, FENETRE_MS + 400));
    const apres = await post();
    check(apres.status !== 429, `apres la fenetre, la requete repasse (recu ${apres.status})`);
    const apres2 = await post();
    check(apres2.status !== 429, `le compteur repart a zero : 2e requete de la nouvelle fenetre passe (recu ${apres2.status})`);
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
