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

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const env = process.env.APP_ENV ? `${process.env.APP_ENV}-` : '';
const out = path.join(backupDir, `app-${env}${stamp}.db`);

const db = new DatabaseSync(dbPath);
try {
  // Chemin en litteral SQLite : on echappe les quotes simples.
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
console.log('Sauvegarde ecrite :', out, `(${fs.statSync(out).size} octets)`);
