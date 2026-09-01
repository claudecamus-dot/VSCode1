// La copie de surete de la restauration doit rester HORS de git (correctif du
// 2026-09-01).
//
// `scripts/restore-db.js` duplique la base courante avant de l'ecraser. Le nom
// produit etait `app.db.before-restore-<stamp>` : le motif `data/**/*.db` de
// .gitignore est un glob sur l'EXTENSION, il ne le couvrait donc pas. Un
// `git add -A` apres restauration versionnait une base nominative complete,
// de facon irrevocable (l'historique garde le fichier meme apres suppression).
// Le nom se termine desormais par `.db`.
//
// Le test execute le VRAI script sur une base bidon dans un dossier temporaire
// (DB_PATH surcharge — app/data/ n'est jamais touche), puis demande a git s'il
// ignorerait le nom reellement produit, place sous app/data/.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const RACINE_APP = path.join(__dirname, '..');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-ignore-'));
const dbPath = path.join(dossierTmp, 'app.db');
const sauvegarde = path.join(dossierTmp, 'sauvegarde-2026.db');

try {
  // Etat courant (celui qui sera ecrase, donc copie) et sauvegarde a restaurer.
  // Contenus differents : ils servent aussi a verifier que la copie est fidele.
  fs.writeFileSync(dbPath, 'BASE-COURANTE-NOMINATIVE');
  fs.writeFileSync(sauvegarde, 'SAUVEGARDE-A-RESTAURER');

  console.log('Execution reelle de scripts/restore-db.js sur une base temporaire :');
  const resultat = spawnSync(process.execPath, [path.join(__dirname, 'restore-db.js'), sauvegarde], {
    env: { ...process.env, DB_PATH: dbPath },
    encoding: 'utf8',
  });
  check(resultat.status === 0, `le script sort en 0 (recu ${resultat.status})${resultat.status ? ' — ' + (resultat.stderr || '').trim() : ''}`);

  const copies = fs.readdirSync(dossierTmp).filter((f) => f.includes('before-restore'));
  check(copies.length === 1, `une seule copie de surete creee (recu ${copies.length} : ${JSON.stringify(copies)})`);

  const copie = copies[0] || '';
  check(copie.endsWith('.db'), `le nom se termine par .db (recu « ${copie} »)`);
  check(
    /^app\.db\.before-restore-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9-]+Z\.db$/.test(copie),
    `le nom garde sa forme horodatee (recu « ${copie} »)`,
  );
  if (copie) {
    check(
      fs.readFileSync(path.join(dossierTmp, copie), 'utf8') === 'BASE-COURANTE-NOMINATIVE',
      'la copie contient bien l\'etat courant d\'avant restauration',
    );
  }
  check(
    fs.readFileSync(dbPath, 'utf8') === 'SAUVEGARDE-A-RESTAURER',
    'la base cible a bien ete restauree depuis la sauvegarde',
  );

  console.log('Ce nom, place sous app/data/, est-il ignore par git ?');
  // On interroge git sur le motif REEL du depot, pas sur une relecture humaine
  // du .gitignore. `check-ignore` accepte un chemin qui n'existe pas : rien
  // n'est cree sous app/data/.
  let gitDisponible = true;
  function ignorePar(cheminRelatif) {
    try {
      execFileSync('git', ['check-ignore', '-q', '--', cheminRelatif], {
        cwd: RACINE_APP, stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true; // code 0 = ignore
    } catch (err) {
      if (err.status === 1) return false; // code 1 = NON ignore
      gitDisponible = false; // git absent ou hors depot
      return null;
    }
  }

  const sousData = `data/${copie}`;
  const verdict = ignorePar(sousData);
  if (gitDisponible) {
    check(verdict === true, `git ignore « ${sousData} »`);
    // Temoin de mordant : le nom SANS le suffixe (l'ancien) n'est pas couvert.
    // Informatif seulement — si un jour .gitignore devient plus large, cette
    // ligne changera sans que le verrou ci-dessus perde sa valeur.
    const ancien = ignorePar(`data/${copie.replace(/\.db$/, '')}`);
    console.log(`  info l'ancien nom (sans suffixe .db) serait ${ancien ? 'ignore' : 'VERSIONNE'} — c'est ce qui a motive le correctif`);
  } else {
    console.log('  info git indisponible : verification du .gitignore sautee, seul le nom produit a ete verifie');
  }
} finally {
  try { fs.rmSync(dossierTmp, { recursive: true, force: true }); } catch { /* nettoyage best-effort */ }
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
