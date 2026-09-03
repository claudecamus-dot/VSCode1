// backup-db.js n'avait aucun test (audit technique du 2026-09-02, robustesse +
// securite). Deux scenarios verrouilles ici :
//   1. Le cas nominal : VACUUM INTO produit une sauvegarde SQLite valide et
//      fidele au contenu source.
//   2. Le fichier PARTIEL n'est pas laisse derriere en cas d'echec du VACUUM
//      (le `finally` d'origine ne fermait que la connexion, jamais le
//      nettoyage du fichier de sortie). VACUUM INTO echoue de maniere fiable
//      et portable quand le fichier cible existe deja ("file is not a
//      database") : on pre-cree un fichier au chemin de sortie EXACT en
//      figeant Date.now() via un module de test, pour reproduire l'echec sans
//      deviner un horodatage.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function lancerBackup(env) {
  return spawnSync(process.execPath, [path.join(__dirname, 'backup-db.js')], {
    env: { ...process.env, ...env }, encoding: 'utf8',
  });
}

function seulFichier(dir) {
  const noms = fs.readdirSync(dir);
  return noms.length === 1 ? path.join(dir, noms[0]) : null;
}

async function main() {
  console.log('Cas nominal : VACUUM INTO produit une sauvegarde SQLite fidele :');
  const dossier1 = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-nominal-'));
  try {
    const dbPath = path.join(dossier1, 'app.db');
    const backupDir = path.join(dossier1, 'backups');
    const src = new DatabaseSync(dbPath);
    src.exec('CREATE TABLE marqueur (valeur TEXT)');
    src.prepare('INSERT INTO marqueur (valeur) VALUES (?)').run('CONTENU-A-SAUVEGARDER');
    src.close();

    const r = lancerBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir, APP_ENV: 'test' });
    check(r.status === 0, `le script sort en 0 (recu ${r.status}) : ${(r.stderr || '').trim()}`);
    const fichier = fs.existsSync(backupDir) ? seulFichier(backupDir) : null;
    check(!!fichier, `un fichier de sauvegarde est ecrit (${fichier || 'aucun'})`);
    if (fichier) {
      const restauree = new DatabaseSync(fichier, { readOnly: true });
      const valeur = restauree.prepare('SELECT valeur FROM marqueur').get().valeur;
      restauree.close();
      check(valeur === 'CONTENU-A-SAUVEGARDER', `le contenu sauvegarde est fidele (recu « ${valeur} »)`);
    }
  } finally {
    fs.rmSync(dossier1, { recursive: true, force: true });
  }

  console.log("Echec du VACUUM (fichier cible deja present) : aucun fichier PARTIEL ne reste :");
  const dossier2 = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-echec-'));
  try {
    const dbPath = path.join(dossier2, 'app.db');
    const backupDir = path.join(dossier2, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const src = new DatabaseSync(dbPath);
    src.exec('CREATE TABLE t (x INTEGER)');
    src.close();

    // BACKUP_STAMP_TEST fige le nom de sortie (surcharge ajoutee au script pour
    // ce test) : on pre-cree un fichier BIDON a ce chemin EXACT, sans dependre
    // d'un timing de course sur l'horodatage reel. VACUUM INTO echoue de facon
    // fiable et portable quand le fichier cible existe deja.
    const stampTest = 'FIGE-POUR-TEST';
    const cheminAttendu = path.join(backupDir, `app-test-${stampTest}.db`);
    fs.writeFileSync(cheminAttendu, 'BIDON-DEJA-LA');

    const avant = new Set(fs.readdirSync(backupDir));
    const r = lancerBackup({ DB_PATH: dbPath, BACKUP_DIR: backupDir, APP_ENV: 'test', BACKUP_STAMP_TEST: stampTest });
    check(r.status !== 0, `le script sort en erreur quand VACUUM echoue (recu ${r.status})`);
    const apres = new Set(fs.readdirSync(backupDir));
    const nouveaux = [...apres].filter((f) => !avant.has(f));
    check(nouveaux.length === 0, `aucun fichier PARTIEL nouveau apres l'echec (recu ${JSON.stringify(nouveaux)})`);
    check(fs.readFileSync(cheminAttendu, 'utf8') === 'BIDON-DEJA-LA', 'le fichier bidon preexistant n\'a pas ete altere');
  } finally {
    fs.rmSync(dossier2, { recursive: true, force: true });
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
