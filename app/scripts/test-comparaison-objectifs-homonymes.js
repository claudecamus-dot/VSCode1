// Comparaison inter-sessions : l'alignement d'un objectif doit etre qualifie par
// SON PILIER, jamais par son nom seul (audit technique du 2026-09-13, dimension
// robustesse).
//
// Defaut : `ancienParObjectif` etait une Map indexee par `sc.nom` seul, a travers
// tous les piliers. Deux sous-categories homonymes dans deux piliers differents
// (cas banal : « Pilotage », « Qualite ») s'ecrasaient, le DERNIER gagnait, et
// l'axe `precedent` du radar -- puis la progression affichee a l'ecran ET dans le
// PPT remis au client -- portait sur le mauvais objectif, sans aucun signal.
//
// Ce test monte exactement ce referentiel : deux piliers, un objectif « Pilotage »
// dans chacun, avec des moyennes precedentes DIFFERENTES (1 et 3). Avant le
// correctif, les deux axes recevaient 3 (le dernier ecrit) et le Pilier A passait
// d'une progression reelle (1 -> 2) a une regression affichee (3 -> 2).
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const EQUIPE = 'EquipeCmp';
const OBJECTIF_HOMONYME = 'Pilotage';

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

async function creerSession(base, heuresAvantMaintenant) {
  const reponse = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - heuresAvantMaintenant * 60 * 60 * 1000).toISOString(),
      fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  });
  const corps = await reponse.json();
  if (!corps.id) throw new Error(`creation de session refusee : ${reponse.status} ${JSON.stringify(corps)}`);
  return corps.id;
}

// Un repondant qui soumet une reponse par pilier : `niveauA` sur l'objectif
// « Pilotage » du Pilier A, `niveauB` sur l'homonyme du Pilier B.
async function soumettre(base, sessionId, email, piliers, niveauA, niveauB) {
  const identification = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      nom: 'Nom',
      prenom: 'Prenom',
      departement: 'DeptCmp',
      equipe: EQUIPE,
      role: 'Testeur',
      est_manager: false,
      dans_equipe: true,
    }),
  });
  const { id: repondantId } = await identification.json();

  for (const [pilier, niveau] of [[piliers.a, niveauA], [piliers.b, niveauB]]) {
    const ecriture = await fetchMutant(`${base}/api/repondants/${repondantId}/piliers/${pilier.id}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reponses: [{ question_id: pilier.questionId, niveau }] }),
    });
    if (ecriture.status !== 200) {
      throw new Error(`ecriture refusee sur le pilier ${pilier.id} : ${ecriture.status} ${await ecriture.text()}`);
    }
  }

  const soumission = await fetchMutant(`${base}/api/repondants/${repondantId}/soumission`, { method: 'POST' });
  if (soumission.status !== 200) {
    throw new Error(`soumission refusee : ${soumission.status} ${await soumission.text()}`);
  }
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comparaison-homonymes-'));
  const dbPath = path.join(dossierTmp, 'homonymes.db');

  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  // Deux piliers, le MEME nom d'objectif dans chacun : c'est tout le sujet.
  reconcileReferentiel([
    {
      nom: 'Pilier A',
      ordre: 0,
      sousCategories: [{ nom: OBJECTIF_HOMONYME, ordre: 0, questions: [{ texte: 'QA', niveaux: niveaux() }] }],
    },
    {
      nom: 'Pilier B',
      ordre: 1,
      sousCategories: [{ nom: OBJECTIF_HOMONYME, ordre: 0, questions: [{ texte: 'QB', niveaux: niveaux() }] }],
    },
  ]);
  const piliers = {
    a: {
      id: dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier A'").get().id,
      questionId: dbSeed.prepare("SELECT id FROM questions WHERE texte = 'QA'").get().id,
    },
    b: {
      id: dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier B'").get().id,
      questionId: dbSeed.prepare("SELECT id FROM questions WHERE texte = 'QB'").get().id,
    },
  };
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-comparaison-homonymes', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : session PRECEDENTE (Pilotage/A = 1, Pilotage/B = 3) puis COURANTE (2 et 2) :');
    const sessionPrecedente = await creerSession(base, 48);
    await soumettre(base, sessionPrecedente, 'avant@exemple.fr', piliers, 1, 3);
    const sessionCourante = await creerSession(base, 1);
    await soumettre(base, sessionCourante, 'apres@exemple.fr', piliers, 2, 2);

    const reponse = await fetch(`${base}/api/sessions/${sessionCourante}/comparaison?equipe=${EQUIPE}`);
    check(reponse.status === 200, `GET comparaison -> 200 (recu ${reponse.status})`);
    const comparaison = await reponse.json();
    check(comparaison.disponible === true, `une session precedente est bien trouvee (recu ${JSON.stringify(comparaison.disponible)})`);

    const axeA = (comparaison.axes || []).find((a) => a.pilier === 'Pilier A' && a.label === OBJECTIF_HOMONYME);
    const axeB = (comparaison.axes || []).find((a) => a.pilier === 'Pilier B' && a.label === OBJECTIF_HOMONYME);
    check(axeA !== undefined && axeB !== undefined, 'les 2 axes homonymes sont presents, un par pilier');

    console.log('Chaque axe doit porter la moyenne precedente de SON pilier, pas celle de l homonyme :');
    check(
      axeA && axeA.precedent === 1,
      `AVANT LE CORRECTIF : l axe « ${OBJECTIF_HOMONYME} » du Pilier A recevait la valeur du Pilier B (3) -- attendu 1 (recu ${axeA && axeA.precedent})`
    );
    check(
      axeB && axeB.precedent === 3,
      `l axe « ${OBJECTIF_HOMONYME} » du Pilier B garde sa propre valeur -- attendu 3 (recu ${axeB && axeB.precedent})`
    );

    console.log('Consequence metier : le Pilier A PROGRESSE (1 -> 2), il ne regresse pas :');
    check(
      axeA && axeA.courant !== null && axeA.precedent !== null && axeA.courant > axeA.precedent,
      `AVANT LE CORRECTIF : progression inversee a l ecran et dans le PPT (courant ${axeA && axeA.courant} vs precedent ${axeA && axeA.precedent})`
    );

    console.log('Non-regression : l alignement PAR PILIER (deja correct) n a pas bouge :');
    const pilierA = (comparaison.piliers || []).find((p) => p.nom === 'Pilier A');
    check(pilierA && pilierA.precedent === 1, `le pilier A garde sa moyenne precedente (recu ${pilierA && pilierA.precedent})`);
    check(pilierA && pilierA.delta === 1, `delta du pilier A = courant - precedent = 1 (recu ${pilierA && pilierA.delta})`);

    const apres = await fetch(`${base}/api/env`);
    check(apres.status === 200, `le serveur repond encore juste apres (recu ${apres.status})`);
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
