// Compromis D (robustesse) : la liste blanche CHAMPS_FUSIONNABLES borne le nom
// de colonne interpole en SQL. Verrou : seuls 'departement' et 'equipe' passent ;
// les cles heritees d'Object.prototype ('constructor', '__proto__', 'toString')
// et toute injection sont refusees en 400 (jamais 500) sur les deux routes.
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

async function main() {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fusion-'));
  const serveur = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dossierTmp, 'f.db'), APP_ENV: 'test-fusion', AUTH_NON_REQUISE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, 15000);
    const mauvais = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nom', 'departement; DROP TABLE repondants', ''];
    for (const champ of mauvais) {
      const g = await fetch(`${base}/api/repondants/valeurs/${encodeURIComponent(champ || '%20')}`);
      assert.equal(g.status, 400, `GET valeurs/${champ} doit etre 400, recu ${g.status}`);
      const p = await fetchMutant(`${base}/api/repondants/fusion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ champ, source: 'a', cible: 'b' }),
      });
      assert.equal(p.status, 400, `POST fusion champ=${champ} doit etre 400, recu ${p.status}`);
    }
    const dbPath = path.join(dossierTmp, 'f.db');
    const bd = new DatabaseSync(dbPath);
    bd.exec('PRAGMA busy_timeout = 5000');
    const maintenant = new Date().toISOString();
    bd.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)')
      .run('S', maintenant, maintenant, maintenant);
    let seq = 0;
    const ajouterRepondant = (equipe, departement = 'dep') => {
      seq += 1;
      bd.prepare(`INSERT INTO repondants (id, session_id, nom, prenom, departement, equipe, role, est_manager,
        dans_equipe, created_at, soumis_at) VALUES (?, 'S', 'n', 'p', ?, ?, 'r', 0, 1, ?, ?)`)
        .run(`r${seq}`, departement, equipe, maintenant, maintenant);
    };
    const ajouterCommentaire = (equipe, texte) => bd.prepare(
      'INSERT INTO commentaires (session_id, equipe, texte, updated_at) VALUES (?, ?, ?, ?)',
    ).run('S', equipe, texte, maintenant);
    const equipes = () => bd.prepare('SELECT equipe FROM repondants ORDER BY id').all().map((r) => r.equipe);
    const commentaires = () => bd.prepare('SELECT equipe, texte FROM commentaires ORDER BY equipe').all()
      .map((r) => ({ equipe: r.equipe, texte: r.texte }));
    const fusion = (corps) => fetchMutant(`${base}/api/repondants/fusion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
    });

    // Cas legitimes : la source doit exister (sinon 404).
    ajouterRepondant('a', 'a');
    for (const champ of ['departement', 'equipe']) {
      const g = await fetch(`${base}/api/repondants/valeurs/${champ}`);
      assert.equal(g.status, 200, `GET valeurs/${champ} legitime`);
      const p = await fusion({ champ, source: 'a', cible: 'b' });
      assert.equal(p.status, 200, `POST fusion ${champ} legitime`);
    }
    // a) espaces autour de source/cible : fusion sur les valeurs trimees.
    ajouterRepondant('t1');
    let p = await fusion({ champ: 'equipe', source: '  t1 ', cible: '	t2  ' });
    assert.equal(p.status, 200, 'fusion avec espaces');
    assert.equal((await p.json()).reaffectes, 1);
    assert.equal(equipes().pop(), 't2', 'cible trimee appliquee');
    // f) source === cible apres trim, ou vide apres trim : 400.
    for (const corps of [{ source: 'x', cible: ' x ' }, { source: '   ', cible: 'y' }, { source: 'x', cible: ' ' }]) {
      p = await fusion({ champ: 'equipe', ...corps });
      assert.equal(p.status, 400, `400 attendu pour ${JSON.stringify(corps)}`);
    }
    // b) source inexistante : 404 avec corps JSON { error }.
    p = await fusion({ champ: 'equipe', source: 'inconnue', cible: 'z' });
    assert.equal(p.status, 404, 'source inexistante -> 404');
    assert.equal(typeof (await p.json()).error, 'string', '404 avec corps JSON { error }');
    // c) commentaires : sans collision il passe sur la cible ; avec collision, concatenation.
    ajouterRepondant('A'); ajouterRepondant('B'); ajouterRepondant('C');
    ajouterCommentaire('C', 'cc');
    p = await fusion({ champ: 'equipe', source: 'C', cible: 'D' });
    assert.equal(p.status, 200);
    assert.deepEqual(commentaires(), [{ equipe: 'D', texte: 'cc' }], 'commentaire sans collision passe sur la cible');
    bd.exec('DELETE FROM commentaires');
    ajouterCommentaire('A', 'ca'); ajouterCommentaire('B', 'cb');
    p = await fusion({ champ: 'equipe', source: 'A', cible: 'B' });
    assert.equal(p.status, 200);
    const apres = commentaires();
    assert.equal(apres.length, 1, 'un seul commentaire (S,B)');
    assert.equal(apres[0].equipe, 'B');
    assert.equal(apres[0].texte, 'cb' + String.fromCharCode(10, 10) + 'ca', 'cible puis source');
    // d) depassement 5000 : 409 JSON, rien modifie.
    ajouterRepondant('E'); ajouterRepondant('F');
    bd.exec('DELETE FROM commentaires');
    ajouterCommentaire('E', 'e'.repeat(3000)); ajouterCommentaire('F', 'f'.repeat(2500));
    const avantEquipes = equipes();
    const avantCommentaires = commentaires();
    p = await fusion({ champ: 'equipe', source: 'E', cible: 'F' });
    assert.equal(p.status, 409, 'depassement -> 409');
    assert.equal(typeof (await p.json()).error, 'string', '409 avec corps JSON { error }');
    assert.deepEqual(equipes(), avantEquipes, 'repondants intacts apres 409');
    assert.deepEqual(commentaires(), avantCommentaires, 'commentaires intacts apres 409');
    // e) champ=departement : commentaires intacts.
    ajouterRepondant('G', 'dg');
    ajouterCommentaire('G', 'cg');
    const avantDep = commentaires();
    p = await fusion({ champ: 'departement', source: 'dg', cible: 'dh' });
    assert.equal(p.status, 200);
    assert.deepEqual(commentaires(), avantDep, 'departement : commentaires intacts');
    // g) equipe sans repondant mais avec commentaire : fusionnable (commentaire non orphelin).
    bd.exec('DELETE FROM commentaires');
    ajouterCommentaire('Fantome', 'cf');
    p = await fusion({ champ: 'equipe', source: 'Fantome', cible: 'Reel' });
    assert.equal(p.status, 200, 'equipe sans repondant mais avec commentaire -> fusionnable');
    assert.deepEqual(commentaires(), [{ equipe: 'Reel', texte: 'cf' }], 'commentaire de l equipe sans repondant migre');
    // h) PUT commentaire : equipe trimee a l ecriture (meme normalisation que la fusion).
    bd.exec('DELETE FROM commentaires');
    p = await fetchMutant(`${base}/api/sessions/S/commentaire`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipe: '  Zeta ', texte: 'cz' }),
    });
    assert.equal(p.status, 200, 'PUT commentaire avec equipe a espaces');
    assert.deepEqual(commentaires(), [{ equipe: 'Zeta', texte: 'cz' }], 'equipe trimee a l ecriture');
    p = await fetchMutant(`${base}/api/sessions/S/commentaire`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipe: '   ', texte: 'x' }),
    });
    assert.equal(p.status, 400, 'equipe vide apres trim -> 400');
    bd.close();
    console.log('Fusion champs OK');
  } catch (e) {
    console.error(`Sortie serveur (exitCode=${serveur.exitCode}) :\n` + sortie);
    throw e;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
