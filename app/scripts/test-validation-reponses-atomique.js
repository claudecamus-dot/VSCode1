// Validation de TOUT le pilier avant d'ecrire quoi que ce soit (correctif du
// 2026-09-01, PUT /api/repondants/:id/piliers/:pilierId/reponses). L'ancienne
// boucle validait et ecrivait chaque reponse au meme tour : sur 3 reponses dont
// la 2e portait un niveau hors bornes, la 1ere etait deja persistee quand
// l'API rendait son 400 -- en pretendant qu'un pilier ne se sauvegarde que
// complet, elle venait d'en enregistrer un partiel. Ce test verifie les deux
// moities du correctif : le 400 ET l'absence de toute ecriture partielle.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function attendreServeur(base, delaiMs) {
  const fin = Date.now() + delaiMs;
  let derniereErreur = null;
  while (Date.now() < fin) {
    try {
      const res = await fetch(`${base}/api/env`);
      if (res.ok) return;
      derniereErreur = new Error(`HTTP ${res.status} sur /api/env`);
    } catch (err) {
      derniereErreur = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Serveur injoignable apres ${delaiMs} ms : ${derniereErreur}`);
}

function attendreMort(serveur, delaiMs = 5000) {
  if (serveur.exitCode !== null || serveur.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const minuteur = setTimeout(resolve, delaiMs);
    serveur.once('exit', () => { clearTimeout(minuteur); setTimeout(resolve, 100); });
  });
}

async function nettoyer(dossier) {
  for (let essai = 0; essai < 5; essai += 1) {
    try {
      fs.rmSync(dossier, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  console.warn(`  info dossier temporaire non supprime : ${dossier}`);
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-atomique-'));
  const dbPath = path.join(dossierTmp, 'atomique.db');

  // 3 questions dans le pilier : la question au NIVEAU INVALIDE est placee en
  // position 2 (ni premiere ni derniere), pour que l'ancienne boucle
  // (valide-et-ecrit-au-meme-tour) ait deja ecrit la 1ere reponse valide avant
  // de tomber sur l'invalide et de s'arreter -- c'est precisement ce que le
  // test doit detecter si le correctif etait retire.
  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    {
      nom: 'Pilier X',
      ordre: 0,
      sousCategories: [
        {
          nom: 'Objectif Y',
          ordre: 0,
          questions: [
            { texte: 'Q1', niveaux: niveaux() },
            { texte: 'Q2', niveaux: niveaux() },
            { texte: 'Q3', niveaux: niveaux() },
          ],
        },
      ],
    },
  ]);
  const pilierId = dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier X'").get().id;
  const q1 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q1'").get().id;
  const q2 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q2'").get().id;
  const q3 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q3'").get().id;
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-validation-atomique', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    const creation = await fetch(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    const { id: sessionId } = await creation.json();

    const identification = await fetch(`${base}/api/sessions/${sessionId}/repondants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'atomique@exemple.fr',
        nom: 'Nom',
        prenom: 'Prenom',
        departement: 'Dept',
        equipe: 'Equipe',
        role: 'Testeur',
        est_manager: false,
        dans_equipe: true,
      }),
    });
    const { id: repondantId } = await identification.json();

    console.log('3 reponses dont UNE (position 2) porte un niveau invalide : 400 attendu :');
    const tentative = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reponses: [
          { question_id: q1, niveau: 1 }, // valide
          { question_id: q2, niveau: 99 }, // INVALIDE : hors bornes (niveaux 0-3)
          { question_id: q3, niveau: 2 }, // valide
        ],
      }),
    });
    check(tentative.status === 400, `PUT avec un niveau invalide au milieu -> 400 (recu ${tentative.status})`);
    const corpsTentative = await tentative.json();
    check(
      typeof corpsTentative.error === 'string' && corpsTentative.error.includes(String(q2)),
      `le 400 designe la question fautive (recu ${JSON.stringify(corpsTentative)})`
    );

    console.log("AUCUNE des 2 reponses valides (Q1, Q3) n'a ete persistee malgre le 400 :");
    const relecture = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(
      relecture.reponses.length === 0,
      `0 reponse enregistree apres l'echec de validation (recu ${JSON.stringify(relecture.reponses)})`
    );

    // Defaut reproduit en HTTP reel le 2026-09-01 : le controle de completude
    // comparait `reponses.length` a la taille du pilier, donc onze fois la meme
    // question satisfaisait « pilier complet ». L'API repondait { ok: true } en
    // 200 apres avoir ecrit UNE ligne, et le repondant restait bloque a la
    // soumission (1/40) sans savoir quelle question rouvrir.
    console.log('Doublons de question_id : compter les entrees ne prouve pas la couverture :');
    const doublons = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reponses: [
          { question_id: q1, niveau: 1 },
          { question_id: q1, niveau: 2 },
          { question_id: q1, niveau: 3 },
        ],
      }),
    });
    check(doublons.status === 400, `PUT avec la meme question repetee -> 400 (recu ${doublons.status})`);
    const apresDoublons = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(
      apresDoublons.reponses.length === 0,
      `aucune ligne ecrite apres le refus des doublons (recu ${apresDoublons.reponses.length})`
    );

    // Un corps mal forme est une erreur du CLIENT : il partait en 500 « prevenez
    // l'exploitant » parce que la boucle lisait `reponse.question_id` et liait
    // `reponse.niveau` sans verifier leur type.
    console.log('Corps mal forme : 400 pour le repondant, pas 500 pour l exploitant :');
    const corpsMalFormes = [
      ['entrees nulles', { reponses: [null, null, null] }],
      ['niveau booleen', { reponses: [{ question_id: q1, niveau: true }, { question_id: q2, niveau: 1 }, { question_id: q3, niveau: 1 }] }],
      ['entree non-objet', { reponses: ['q1', 'q2', 'q3'] }],
    ];
    for (const [libelle, corps] of corpsMalFormes) {
      const reponse = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      check(reponse.status === 400, `${libelle} -> 400 (recu ${reponse.status})`);
    }
    const apresMalFormes = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(
      apresMalFormes.reponses.length === 0,
      `aucune ligne ecrite apres les corps mal formes (recu ${apresMalFormes.reponses.length})`
    );

    console.log('Non-regression : le meme pilier, entierement valide, se sauvegarde normalement :');
    const nominal = await fetch(`${base}/api/repondants/${repondantId}/piliers/${pilierId}/reponses`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reponses: [
          { question_id: q1, niveau: 1 },
          { question_id: q2, niveau: 2 },
          { question_id: q3, niveau: 3 },
        ],
      }),
    });
    check(nominal.status === 200, `PUT entierement valide -> 200 (recu ${nominal.status})`);
    const relectureNominale = await (await fetch(`${base}/api/repondants/${repondantId}`)).json();
    check(relectureNominale.reponses.length === 3, `les 3 reponses valides sont bien persistees (recu ${relectureNominale.reponses.length})`);
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
