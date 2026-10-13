// Export PPT par DEPARTEMENT : cloisonnement departement ET equipe, et alignement
// des objectifs par (pilier, objectif) dans les blocs d'equipe.
//
// Defauts couverts :
//  (A) scope=departement construisait les blocs d'equipe avec { equipe } seul : une
//      equipe homonyme d'un autre departement etait agregee (effectif, moyennes,
//      libelle departement « D1, D2 »).
//  (B) la comparaison avec la session precedente melangeait aussi les departements.
//  (C) `precParObjectif[a.label]` : objectifs homonymes de deux piliers ecrases,
//      `__proto__` qui fuit le prototype.
//  (D) limite de schema connue (pas de migration) : `commentaires` n'a pas de
//      colonne departement, deux equipes homonymes d'une session partagent le
//      commentaire -- ce test FIGE ce comportement.
//
// Python n'est pas lance : PYTHON=node et NODE_OPTIONS=--require <shim> ; le shim
// copie le JSON recu (argv[2]) dans un dossier de capture et ecrit 1 octet dans
// argv[3], puis sort en 0 (la route n'ecarte que les fichiers de 0 octet).
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = process.env.SERVEUR_SOUS_TEST || path.join(__dirname, '..', 'src', 'server.js');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function creerSession(base, heuresAvant) {
  const r = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - heuresAvant * 3600 * 1000).toISOString(),
      fermeture_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    }),
  });
  const corps = await r.json();
  if (!corps.id) throw new Error(`session refusee : ${r.status} ${JSON.stringify(corps)}`);
  return corps.id;
}

// `niveauDe(texteQuestion)` donne le niveau repondu a chaque question.
async function soumettre(base, sessionId, piliers, email, departement, equipe, niveauDe) {
  const ident = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, nom: 'Nom', prenom: 'Prenom', departement, equipe, role: 'Testeur', est_manager: false, dans_equipe: true }),
  });
  const { id } = await ident.json();
  if (!id) throw new Error(`identification refusee pour ${email}`);
  for (const p of piliers) {
    const w = await fetchMutant(`${base}/api/repondants/${id}/piliers/${p.id}/reponses`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ reponses: p.questions.map((q) => ({ question_id: q.id, niveau: niveauDe(q.texte) })) }),
    });
    if (w.status !== 200) throw new Error(`ecriture refusee : ${w.status} ${await w.text()}`);
  }
  const s = await fetchMutant(`${base}/api/repondants/${id}/soumission`, { method: 'POST' });
  if (s.status !== 200) throw new Error(`soumission refusee : ${s.status} ${await s.text()}`);
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'export-homonymes-'));
  const dbPath = path.join(dossierTmp, 'export.db');
  const capture = path.join(dossierTmp, 'capture');
  fs.mkdirSync(capture);
  const shim = path.join(dossierTmp, 'shim-python.js');
  fs.writeFileSync(
    shim,
    [
      "const path = require('node:path');",
      "if (path.basename(process.argv[1] || '') === 'export-restitution-ppt.py') {",
      "  const fs = require('node:fs');",
      "  fs.copyFileSync(process.argv[2], path.join(process.env.CAPTURE_DIR, 'payload.json'));",
      "  fs.writeFileSync(process.argv[3], 'x');",
      '  process.exit(0);',
      '}',
      '',
    ].join('\n')
  );

  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  const sc = (nom, texte, ordre) => ({ nom, ordre, questions: [{ texte, niveaux: niveaux() }] });
  reconcileReferentiel([
    { nom: 'Pilier A', ordre: 0, sousCategories: [sc('Pilotage', 'QA', 0), sc('constructor', 'QC', 1)] },
    { nom: 'Pilier B', ordre: 1, sousCategories: [sc('Pilotage', 'QB', 0), sc('__proto__', 'QP', 1)] },
  ]);
  const piliers = ['Pilier A', 'Pilier B'].map((nom) => {
    const id = dbSeed.prepare('SELECT id FROM piliers WHERE nom = ?').get(nom).id;
    const questions = dbSeed
      .prepare('SELECT q.id, q.texte FROM questions q JOIN sous_categories s ON s.id = q.sous_categorie_id WHERE s.pilier_id = ?')
      .all(id);
    return { id, questions };
  });
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-export-homonymes', AUTH_USER: '', AUTH_PASS: '',
      PYTHON: process.execPath, NODE_OPTIONS: `--require ${shim}`, CAPTURE_DIR: capture,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  async function exporter(session, params) {
    fs.rmSync(path.join(capture, 'payload.json'), { force: true });
    const r = await fetch(`${base}/api/sessions/${session}/export-ppt?${new URLSearchParams(params)}`);
    await r.arrayBuffer();
    if (r.status !== 200) throw new Error(`export refuse : ${r.status}`);
    return JSON.parse(fs.readFileSync(path.join(capture, 'payload.json'), 'utf-8'));
  }
  const moy = (bloc, nom) => (bloc.piliers.find((p) => p.nom === nom) || {}).moyenne;
  const obj = (bloc, pilierIndex, nom) => bloc.objectifs.find((o) => o.pilierIndex === pilierIndex && o.nom === nom);

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);
    const tout = (n) => () => n;

    // Session PRECEDENTE : Alpha/D1 = 1, Alpha/D2 = 3 (1 repondant chacun) ;
    // Solo/D1 : Pilotage A = 1, Pilotage B = 3, constructor = 2, __proto__ = 2.
    const prec = await creerSession(base, 72);
    await soumettre(base, prec, piliers, 'p1@x.fr', 'D1', 'Alpha', tout(1));
    await soumettre(base, prec, piliers, 'p2@x.fr', 'D2', 'Alpha', tout(3));
    const parTexte = { QA: 1, QB: 3, QC: 2, QP: 2 };
    await soumettre(base, prec, piliers, 'p3@x.fr', 'D1', 'Solo', (t) => parTexte[t]);

    // Session COURANTE : Alpha/D1 = 2 (1 rep.), Alpha/D2 = 0 (2 rep.), Solo/D1 = 2.
    const cur = await creerSession(base, 1);
    await soumettre(base, cur, piliers, 'c1@x.fr', 'D1', 'Alpha', tout(2));
    await soumettre(base, cur, piliers, 'c2@x.fr', 'D2', 'Alpha', tout(0));
    await soumettre(base, cur, piliers, 'c3@x.fr', 'D2', 'Alpha', tout(0));
    await soumettre(base, cur, piliers, 'c4@x.fr', 'D1', 'Solo', tout(2));

    console.log('(A) scope=departement D1 : le bloc Alpha n agrege QUE D1 :');
    const pD1 = await exporter(cur, { scope: 'departement', departement: 'D1' });
    const alpha = pD1.blocs.find((b) => b.type === 'equipe' && b.nom === 'Alpha');
    check(alpha !== undefined, 'un bloc equipe Alpha existe dans l export du departement D1');
    check(alpha && alpha.effectif === 1, `effectif Alpha = 1 (D1 seul) -- recu ${alpha && alpha.effectif}`);
    check(alpha && moy(alpha, 'Pilier A') === 2, `moyenne Pilier A d Alpha = 2 (D1 seul) -- recu ${alpha && moy(alpha, 'Pilier A')}`);
    check(alpha && alpha.departement === 'D1', `libelle departement = D1 -- recu "${alpha && alpha.departement}"`);
    check(pD1.blocs.length === 3, `1 bloc departement + 2 equipes (Alpha, Solo) -- recu ${pD1.blocs.length}`);

    console.log('(B) comparaison : le precedent d Alpha/D1 vient de D1 seul :');
    check(alpha && alpha.comparaison.disponible === true, 'comparaison disponible pour Alpha/D1');
    const pil = alpha && alpha.comparaison.piliers.find((p) => p.nom === 'Pilier A');
    check(pil && pil.precedent === 1, `precedent Pilier A d Alpha/D1 = 1 (pas la moyenne D1+D2) -- recu ${pil && pil.precedent}`);
    const oAlpha = alpha && obj(alpha, 0, 'Pilotage');
    check(oAlpha && oAlpha.precedent === 1, `precedent objectif Pilotage d Alpha/D1 = 1 -- recu ${oAlpha && oAlpha.precedent}`);

    console.log('(C) objectifs homonymes et noms de prototype (scope=equipe, Solo) :');
    const pS = await exporter(cur, { scope: 'equipe', equipe: 'Solo' });
    const solo = pS.blocs[0];
    const pa = obj(solo, 0, 'Pilotage');
    const pb = obj(solo, 1, 'Pilotage');
    check(pa && pa.precedent === 1, `Pilotage du Pilier A : precedent 1 -- recu ${pa && pa.precedent}`);
    check(pb && pb.precedent === 3, `Pilotage du Pilier B : precedent 3 -- recu ${pb && pb.precedent}`);
    const oc = obj(solo, 0, 'constructor');
    const op = obj(solo, 1, '__proto__');
    check(oc && oc.precedent === 2, `objectif constructor : precedent 2 -- recu ${JSON.stringify(oc && oc.precedent)}`);
    check(op && op.precedent === 2, `objectif __proto__ : precedent 2, pas de fuite de prototype -- recu ${JSON.stringify(op && op.precedent)}`);

    console.log('(D) limite connue : equipes homonymes de la meme session = meme commentaire :');
    const put = await fetchMutant(`${base}/api/sessions/${cur}/commentaire`, {
      method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ equipe: 'Alpha', texte: 'Commentaire partage' }),
    });
    check(put.status === 200, `PUT commentaire Alpha -> 200 (recu ${put.status})`);
    const eqAlpha = (p) => p.blocs.find((b) => b.nom === 'Alpha' && b.type === 'equipe');
    const aD1 = eqAlpha(await exporter(cur, { scope: 'departement', departement: 'D1' }));
    const aD2 = eqAlpha(await exporter(cur, { scope: 'departement', departement: 'D2' }));
    check(aD1 && aD1.commentaire === 'Commentaire partage', 'Alpha/D1 porte le commentaire (limite de schema)');
    check(aD2 && aD2.commentaire === 'Commentaire partage', 'Alpha/D2 porte le MEME commentaire (limite de schema : pas de colonne departement)');
    check(aD2 && aD2.effectif === 2 && aD2.departement === 'D2', `reste cloisonne pour le reste : effectif 2, departement D2 (recu ${aD2 && aD2.effectif}, ${aD2 && aD2.departement})`);
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
