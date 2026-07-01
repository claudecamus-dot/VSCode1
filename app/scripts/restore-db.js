// Restauration de la base SQLite depuis une sauvegarde (US8.2).
// A LANCER APP ARRETEE (on ecrase le fichier de base). Avant d'ecraser, on
// sauvegarde l'etat courant (filet de securite) et on retire les fichiers
// -wal/-shm eventuels pour qu'un ancien journal ne reapplique pas par-dessus.
//
// Usage :   node scripts/restore-db.js <fichier-sauvegarde.db>
// Respecte DB_PATH (cible) — memes variables que l'app.
const path = require('node:path');
const fs = require('node:fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const src = process.argv[2];

if (!src) {
  console.error('Usage : node scripts/restore-db.js <fichier-sauvegarde.db>');
  process.exit(2);
}
if (!fs.existsSync(src)) {
  console.error('Sauvegarde introuvable :', src);
  process.exit(1);
}

// Filet de securite : on garde l'etat courant avant de l'ecraser.
if (fs.existsSync(dbPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safety = `${dbPath}.before-restore-${stamp}`;
  fs.copyFileSync(dbPath, safety);
  console.log('Etat courant sauvegarde :', safety);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.copyFileSync(src, dbPath);
for (const ext of ['-wal', '-shm']) {
  const f = dbPath + ext;
  if (fs.existsSync(f)) fs.rmSync(f);
}
console.log('Base restauree depuis', src, '->', dbPath);
