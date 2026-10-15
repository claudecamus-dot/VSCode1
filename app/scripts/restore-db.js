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

const TABLES_APP = ['piliers', 'questions', 'sessions', 'repondants', 'reponses'];

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
    // Une base SQLite saine mais ETRANGERE (autre application) passait ces
    // controles et ecrasait la production. On exige les tables coeur de db.js
    // (pas de user_version : la presence des tables est le seul signal). Les
    // tables ajoutees plus tard (roles, invites, commentaires...) sont exclues
    // expres : une ancienne sauvegarde legitime n'en a pas, db.js les recree
    // (CREATE TABLE IF NOT EXISTS) au demarrage.
    const presentes = new Set(base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    const manquantes = TABLES_APP.filter((t) => !presentes.has(t));
    if (manquantes.length) {
      throw new Error(`la source n'est pas une base de cette application (tables manquantes : ${manquantes.join(', ')})`);
    }
    // Une sauvegarde peut porter des lignes ORPHELINES (reponse sans repondant,
    // etc.) : integrity_check ne les voit pas (il controle la structure du fichier,
    // pas les cles etrangeres), et db.js active foreign_keys = ON -> la base
    // restauree serait incoherente. On refuse AVANT toute copie de securite.
    const orphelines = base.prepare('PRAGMA foreign_key_check').all();
    if (orphelines.length) {
      const tables = [...new Set(orphelines.map((r) => r.table))].join(', ');
      throw new Error(`la source contient ${orphelines.length} ligne(s) orpheline(s) (cle etrangere sans parent, table(s) : ${tables}) : sauvegarde incoherente`);
    }
  } finally {
    if (base) base.close();
  }
}

try {
  verifierSourceValide(src);
} catch (err) {
  console.error('Source refusee, base cible intacte :', err.message);
  process.exit(1);
}

// Filet de securite : on garde l'etat courant avant de l'ecraser.
// Le nom se TERMINE par `.db` : le motif `data/**/*.db` de .gitignore est un
// glob sur l'extension, il ne couvrait pas `app.db.before-restore-<stamp>`.
// Verifie le 2026-09-01 : `git check-ignore` sortait 1 (non ignore) sur cette
// copie et 0 sur les sauvegardes normales — un `git add -A` apres restauration
// versionnait donc une base nominative complete, de facon irrevocable.
let safety = null;
if (fs.existsSync(dbPath)) {
  // Copie COHERENTE avec le WAL (db.js active journal_mode=WAL) : un simple
  // copyFileSync du .db perd les transactions validees seulement dans le -wal
  // (arret brutal de l'app). VACUUM INTO (comme backup-db.js) lit dans une
  // transaction et voit le WAL ; choisi plutot que checkpoint+copie car il ne
  // modifie pas la base de production et n'exige pas de la verrouiller.
  // VACUUM INTO echoue si le fichier existe : nom unique (ms + pid + compteur)
  // et verification d'inexistence.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let n = 0;
  do {
    n += 1;
    safety = `${dbPath}.before-restore-${stamp}-${process.pid}-${n}.db`;
  } while (fs.existsSync(safety));
  try {
    const courante = new DatabaseSync(dbPath, { timeout: 5000 });
    try {
      courante.exec(`VACUUM INTO '${safety.replace(/'/g, "''")}'`);
    } finally {
      courante.close();
    }
  } catch (err) {
    // Base courante illisible/corrompue : on ne bloque pas sa restauration, mais
    // on garde les fichiers bruts (le -wal suit la copie, SQLite le relit).
    console.warn(`Copie coherente impossible (${err.message}) — copie brute avec journal WAL`);
    fs.rmSync(safety, { force: true });
    fs.copyFileSync(dbPath, safety);
    if (fs.existsSync(dbPath + '-wal')) fs.copyFileSync(dbPath + '-wal', safety + '-wal');
  }
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
    try {
      // Defensif : un -wal laisse a cote ne va pas avec la copie de securite (VACUUM INTO
      // range les pages autrement). On le retire, puis on remet le -wal que la copie brute
      // de repli aurait emporte (cas non prouve : SQLite supprime lui-meme un -wal invalide).
      for (const ext of ['-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
      fs.copyFileSync(safety, dbPath);
      if (fs.existsSync(safety + '-wal')) fs.copyFileSync(safety + '-wal', dbPath + '-wal');
    } catch (err2) {
      console.error(`ECHEC DU RETOUR ARRIERE (${err2.message}) — la base d'avant est conservee dans ${safety}, a recopier manuellement sur ${dbPath}`);
    }
  } else {
    console.error(`Echec de la restauration (${err.message}) — aucune copie de securite a restaurer (base absente avant)`);
  }
  process.exit(1);
}

console.log('Base restauree depuis', src, '->', dbPath);
