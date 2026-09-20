// Limite de debit sur l'auto-enregistrement du repondant (audit securite du
// 2026-09-19 : « aucun rate-limit nulle part, l'oracle de participation
// nominative est interrogeable en masse », ASI05/ASI06).
//
// Ce que ce test prouve :
//   1. au-dela du quota, la route repond 429 avec un Retry-After — donc
//      l'enumeration d'un annuaire a debit machine n'est plus possible ;
//   2. le message du 429 ne dit RIEN de l'email soumis (il ne doit pas devenir
//      lui-meme un oracle) ;
//   3. le parcours legitime passe : les premieres requetes, sous le quota, sont
//      servies normalement.
// Le quota reel est volontairement pris dans l'environnement (DEBIT_MAX /
// DEBIT_FENETRE_MS) pour que le test n'ait pas a envoyer 10 requetes.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const MAX = 3;

let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

function corpsRepondant(i) {
  // Emails de test fabriques (domaine .invalid, RFC 2606) : aucune donnee reelle.
  return {
    email: `sonde-${i}@exemple.invalid`,
    nom: `Nom${i}`, prenom: `Prenom${i}`,
    departement: 'D', equipe: 'E', role: 'R',
    est_manager: false, dans_equipe: true,
  };
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'debit-repondants-'));
  const dbPath = path.join(dossierTmp, 'debit.db');
  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier X', ordre: 0, sousCategories: [{ nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
  ]);
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: {
      ...process.env,
      PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-debit',
      AUTH_USER: '', AUTH_PASS: '',
      DEBIT_MAX: String(MAX), DEBIT_FENETRE_MS: '60000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 3600_000).toISOString(),
        fermeture_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
    });
    const session = await creation.json();
    check(creation.status === 200 || creation.status === 201, `session creee (recu ${creation.status})`);

    console.log("Interrogation en rafale de l'oracle de participation :");
    const statuts = [];
    for (let i = 0; i < MAX + 2; i += 1) {
      const r = await fetchMutant(`${base}/api/sessions/${session.id}/repondants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpsRepondant(i)),
      });
      statuts.push({ code: r.status, retry: r.headers.get('retry-after'), corps: await r.text() });
    }
    const sousQuota = statuts.slice(0, MAX);
    const auDela = statuts.slice(MAX);
    check(
      sousQuota.every((s) => s.code !== 429),
      `les ${MAX} premieres requetes (parcours legitime) passent : ${sousQuota.map((s) => s.code).join(', ')}`,
    );
    check(
      auDela.every((s) => s.code === 429),
      `au-dela du quota, la route repond 429 : ${auDela.map((s) => s.code).join(', ')}`,
    );
    check(
      auDela.every((s) => s.retry && Number(s.retry) > 0),
      `le 429 porte un Retry-After exploitable (${auDela.map((s) => s.retry).join(', ')})`,
    );
    check(
      auDela.every((s) => !/deja|inconnu|identifie/i.test(s.corps)),
      'le corps du 429 ne dit rien de l\'email soumis (pas un oracle de repli)',
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
