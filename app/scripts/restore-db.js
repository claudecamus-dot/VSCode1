// Restauration de la base SQLite depuis une sauvegarde (US8.2).
// A LANCER APP ARRETEE (on ecrase le fichier de base). Avant d'ecraser, on
// sauvegarde l'etat courant (filet de securite) et on retire les fichiers
// -wal/-shm eventuels pour qu'un ancien journal ne reapplique pas par-dessus.
//
// Usage :   node scripts/restore-db.js <fichier-sauvegarde.db>
// Respecte DB_PATH (cible) — memes variables que l'app.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

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

// Audit du 2026-09-02 (robustesse) : aucun controle sur la source avant d'ecraser
// la production. Un fichier texte ou une base corrompue passait tel quel. Deux
// verifications AVANT tout ecrasement : l'en-tete SQLite (16 premiers octets,
// signature fixe du format), puis une ouverture reelle + PRAGMA integrity_check
// (une entete valide n'exclut pas une base tronquee/corrompue plus loin).
const SIGNATURE_SQLITE = Buffer.from('SQLite format 3\0', 'utf8');

function verifierSourceValide(fichier) {
  const fd = fs.openSync(fichier, 'r');
  let entete;
  try {
    entete = Buffer.alloc(16);
    const lus = fs.readSync(fd, entete, 0, 16, 0);
    if (lus < 16 || !entete.equals(SIGNATURE_SQLITE)) {
      throw new Error(`la source ne porte pas la signature SQLite (${fichier})`);
    }
  } finally {
    fs.closeSync(fd);
  }
  let base;
  try {
    base = new DatabaseSync(fichier, { readOnly: true });
    const { integrity_check: resultat } = base.prepare('PRAGMA integrity_check').get();
    if (resultat !== 'ok') {
      throw new Error(`PRAGMA integrity_check a echoue sur la source : ${resultat}`);
    }
  } finally {
    if (base) base.close();
  }
}

verifierSourceValide(src);

// Filet de securite : on garde l'etat courant avant de l'ecraser.
// Le nom se TERMINE par `.db` : le motif `data/**/*.db` de .gitignore est un
// glob sur l'extension, il ne couvrait pas `app.db.before-restore-<stamp>`.
// Verifie le 2026-09-01 : `git check-ignore` sortait 1 (non ignore) sur cette
// copie et 0 sur les sauvegardes normales — un `git add -A` apres restauration
// versionnait donc une base nominative complete, de facon irrevocable.
let safety = null;
if (fs.existsSync(dbPath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  safety = `${dbPath}.before-restore-${stamp}.db`;
  fs.copyFileSync(dbPath, safety);
  // Audit du 2026-09-02 (securite) : cette copie porte la base nominative COMPLETE
  // (repondants, emails, reponses) aux permissions par defaut du processus — le
  // meme incident de fuite via `git add -A` que ci-dessus a un second etage : le
  // fichier reste lisible par quiconque a un acces au systeme de fichiers.
  // 0o600 (lecture/ecriture proprietaire seul) : pas d'equivalent Windows via
  // fs.chmodSync (ACL NTFS ignore le mode POSIX), mais inoffensif et correct sur
  // le canal de deploiement reel (Linux, cf. .env.prod / systemd).
  try {
    fs.chmodSync(safety, 0o600);
  } catch (err) {
    console.warn('Permissions de la copie de securite non restreintes :', err.message);
  }
  console.log('Etat courant sauvegarde :', safety);
}

// Audit du 2026-09-02 (robustesse) : si `copyFileSync` echoue A MI-PARCOURS
// (disque plein, panne), le fichier de production restait dans un etat tronque
// SANS restauration depuis la copie de securite qu'on venait de prendre. Le
// filet existait, il n'etait simplement jamais utilise.
try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(src, dbPath);
  for (const ext of ['-wal', '-shm']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) fs.rmSync(f);
  }
} catch (err) {
  if (safety) {
    console.error(`Echec de la restauration (${err.message}) — retour a l'etat d'avant depuis ${safety}`);
    fs.copyFileSync(safety, dbPath);
  } else {
    console.error(`Echec de la restauration (${err.message}) — aucune copie de securite a restaurer (base absente avant)`);
  }
  process.exit(1);
}

console.log('Base restauree depuis', src, '->', dbPath);
