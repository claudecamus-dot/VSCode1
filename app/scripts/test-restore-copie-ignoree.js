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
const { DatabaseSync } = require('node:sqlite');

const RACINE_APP = path.join(__dirname, '..');

// `restore-db.js` verifie desormais (audit du 2026-09-02, corrige le 2026-09-03)
// que la SOURCE est une vraie base SQLite (entete + PRAGMA integrity_check) avant
// d'ecraser la production — les fixtures de ce test doivent donc etre de vraies
// bases, pas du texte brut portant un nom de fichier .db.
function creerBaseMarquee(chemin, marqueur) {
  const base = new DatabaseSync(chemin);
  base.exec('CREATE TABLE marqueur (valeur TEXT)');
  base.prepare('INSERT INTO marqueur (valeur) VALUES (?)').run(marqueur);
  base.close();
}

function lireMarqueur(chemin) {
  const base = new DatabaseSync(chemin, { readOnly: true });
  try {
    return base.prepare('SELECT valeur FROM marqueur').get().valeur;
  } finally {
    base.close();
  }
}

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
  // Contenus differents (vraies bases SQLite) : ils servent aussi a verifier
  // que la copie est fidele.
  creerBaseMarquee(dbPath, 'BASE-COURANTE-NOMINATIVE');
  creerBaseMarquee(sauvegarde, 'SAUVEGARDE-A-RESTAURER');

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
      lireMarqueur(path.join(dossierTmp, copie)) === 'BASE-COURANTE-NOMINATIVE',
      'la copie contient bien l\'etat courant d\'avant restauration',
    );
  }
  check(
    lireMarqueur(dbPath) === 'SAUVEGARDE-A-RESTAURER',
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

// Audit du 2026-09-02 (robustesse + securite), corrige le 2026-09-03 : une
// source invalide (fichier arbitraire, base corrompue) ecrasait la production
// sans aucun controle ; la copie de securite restait lisible par quiconque.
const dossier2 = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-validation-'));
try {
  const dbPath2 = path.join(dossier2, 'app.db');
  creerBaseMarquee(dbPath2, 'PRODUCTION-A-PROTEGER');

  console.log("Une source qui n'est PAS une base SQLite est refusee AVANT d'ecraser la production :");
  const fauxFichier = path.join(dossier2, 'pas-une-base.db');
  fs.writeFileSync(fauxFichier, 'ceci est du texte, pas du SQLite');
  const r1 = spawnSync(process.execPath, [path.join(__dirname, 'restore-db.js'), fauxFichier], {
    env: { ...process.env, DB_PATH: dbPath2 }, encoding: 'utf8',
  });
  check(r1.status !== 0, `le script refuse (recu code ${r1.status})`);
  check(lireMarqueur(dbPath2) === 'PRODUCTION-A-PROTEGER', 'la production n\'a PAS ete ecrasee par un fichier non-SQLite');

  console.log('Une base SQLite CORROMPUE (entete valide, contenu casse) est refusee de meme :');
  const corrompue = path.join(dossier2, 'corrompue.db');
  creerBaseMarquee(corrompue, 'sera-corrompue');
  const octets = fs.readFileSync(corrompue);
  // On abime des octets APRES l'entete (16 premiers) pour passer le premier
  // controle et n'echouer qu'au PRAGMA integrity_check, la seconde ligne de
  // defense — pas un octet au hasard qui casserait aussi la signature.
  for (let i = 100; i < Math.min(200, octets.length); i += 1) octets[i] = 0xff;
  fs.writeFileSync(corrompue, octets);
  const r2 = spawnSync(process.execPath, [path.join(__dirname, 'restore-db.js'), corrompue], {
    env: { ...process.env, DB_PATH: dbPath2 }, encoding: 'utf8',
  });
  check(r2.status !== 0, `le script refuse une base corrompue (recu code ${r2.status})`);
  check(lireMarqueur(dbPath2) === 'PRODUCTION-A-PROTEGER', 'la production n\'a PAS ete ecrasee par une base corrompue');

  console.log('La copie de securite est creee avec des permissions restreintes (best effort hors POSIX) :');
  creerBaseMarquee(path.join(dossier2, 'bonne-sauvegarde.db'), 'RESTAURATION-VALIDE');
  const r3 = spawnSync(process.execPath, [path.join(__dirname, 'restore-db.js'), path.join(dossier2, 'bonne-sauvegarde.db')], {
    env: { ...process.env, DB_PATH: dbPath2 }, encoding: 'utf8',
  });
  check(r3.status === 0, `restauration valide -> sort en 0 (recu ${r3.status})`);
  const copieSecu = fs.readdirSync(dossier2).find((f) => f.includes('before-restore'));
  if (process.platform === 'win32') {
    console.log('  info Windows : fs.chmodSync ne restreint pas via ACL NTFS, mode POSIX non verifiable ici');
  } else if (copieSecu) {
    const mode = fs.statSync(path.join(dossier2, copieSecu)).mode & 0o777;
    check(mode === 0o600, `permissions 0600 sur la copie de securite (recu ${mode.toString(8)})`);
  }
} finally {
  try { fs.rmSync(dossier2, { recursive: true, force: true }); } catch { /* nettoyage best-effort */ }
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
