// Sauvegarde de la base SQLite (US8.2). Produit un instantane COHERENT meme si
// l'app tourne, via `VACUUM INTO` (transaction de lecture SQLite) — pas une
// simple copie de fichier. Le fichier produit est une base SQLite autonome.
//
// Usage :   node scripts/backup-db.js
// Respecte DB_PATH, BACKUP_DIR, APP_ENV (memes variables que l'app).
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
if (!fs.existsSync(dbPath)) {
  console.error('Base introuvable :', dbPath);
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
fs.mkdirSync(backupDir, { recursive: true });

// Surchargeable (tests) : reproduire de facon deterministe un nom de sortie deja
// pris, sans dependre d'une course de timing sur l'horodatage reel.
const stamp = process.env.BACKUP_STAMP_TEST || new Date().toISOString().replace(/[:.]/g, '-');
const env = process.env.APP_ENV ? `${process.env.APP_ENV}-` : '';
const out = path.join(backupDir, `app-${env}${stamp}.db`);

// Le fichier n'existait pas AVANT notre tentative : s'il existe apres un echec,
// c'est un residu PARTIEL du VACUUM en cours, sur a nettoyer. S'il existait
// deja avant (nom deja pris par autre chose), ce n'est pas notre fichier a
// supprimer -- VACUUM INTO echoue de toute facon dans ce cas ("file is not a
// database"), sans jamais y toucher.
const existaitAvant = fs.existsSync(out);

const db = new DatabaseSync(dbPath);
try {
  // Chemin en litteral SQLite : on echappe les quotes simples (VACUUM INTO ne
  // supporte pas de parametre lie pour la destination, c'est le seul canal).
  try {
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  } catch (err) {
    // Audit du 2026-09-02 (securite/robustesse) : un VACUUM qui echoue en cours
    // de route laissait un fichier PARTIEL sous BACKUP_DIR, sans nettoyage --
    // seule la connexion etait fermee. Un fichier tronque pourrait ensuite etre
    // pris pour une sauvegarde valide par un `restore-db.js` sans validation
    // (defaut ferme separement le 2026-09-03).
    if (!existaitAvant && fs.existsSync(out)) fs.rmSync(out, { force: true });
    throw err;
  }
} finally {
  db.close();
}
console.log('Sauvegarde ecrite :', out, `(${fs.statSync(out).size} octets)`);
