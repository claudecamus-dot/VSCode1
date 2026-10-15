// restore-db.js : copie de securite coherente avec le WAL, noms uniques,
// validation du schema de la source (correctif A1). Lance le VRAI script.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

let echecs = 0;
function check(c, m) {
  if (c) console.log(`  ok   ${m}`);
  else { echecs += 1; console.error(`  FAIL ${m}`); }
}
const TABLES = 'CREATE TABLE piliers (id INTEGER); CREATE TABLE questions (id INTEGER); CREATE TABLE sessions (id INTEGER); CREATE TABLE repondants (id INTEGER); CREATE TABLE reponses (id INTEGER); CREATE TABLE marqueur (valeur TEXT);';
function creer(chemin, marqueur, wal) {
  const b = new DatabaseSync(chemin);
  if (wal) b.exec('PRAGMA journal_mode = WAL');
  b.exec(TABLES);
  b.prepare('INSERT INTO marqueur (valeur) VALUES (?)').run(marqueur);
  return b;
}
function lire(chemin) {
  const b = new DatabaseSync(chemin, { readOnly: true });
  try { return b.prepare('SELECT valeur FROM marqueur').all().map((r) => r.valeur); } catch { return []; } finally { b.close(); }
}
function restaurer(dbPath, src, extraEnv) {
  return spawnSync(process.execPath, [path.join(__dirname, 'restore-db.js'), src], {
    env: { ...process.env, DB_PATH: dbPath, ...extraEnv }, encoding: 'utf8',
  });
}
const copiesDe = (dir) => fs.readdirSync(dir).filter((f) => f.startsWith('app.db.before-restore') && f.endsWith('.db'));
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-wal-'));
let ouvert = null;
try {
  console.log('(a) transaction presente seulement dans le -wal : la copie de securite la contient :');
  // Etat « apres arret brutal » : handle garde ouvert, aucun checkpoint ; on fige
  // db + -wal par copie de fichiers (sans -shm), puis on ferme l'original (Windows
  // interdit de supprimer un -wal ouvert, et l'app est censee etre arretee).
  const dbOrig = path.join(dir, 'orig.db');
  ouvert = creer(dbOrig, 'LIGNE-DANS-LE-WAL', true);
  check(fs.existsSync(dbOrig + '-wal') && fs.statSync(dbOrig + '-wal').size > 0, 'le -wal existe et est non vide (precondition)');
  const dbPath = path.join(dir, 'app.db');
  fs.copyFileSync(dbOrig, dbPath);
  fs.copyFileSync(dbOrig + '-wal', dbPath + '-wal');
  ouvert.close();
  ouvert = null;
  const brut = new DatabaseSync(dbPath, { readOnly: true });
  check(brut.prepare('SELECT valeur FROM marqueur').all().length === 1, 'precondition : la ligne est lisible via le -wal');
  brut.close();
  fs.rmSync(dbOrig, { force: true });
  const src = path.join(dir, 'source.db');
  creer(src, 'SOURCE-VALIDE', false).close();
  const r = restaurer(dbPath, src);
  check(r.status === 0, `restauration sort en 0 (recu ${r.status}) ${(r.stderr || '').trim()}`);
  const copies = copiesDe(dir);
  check(copies.length === 1, `une copie de securite (recu ${JSON.stringify(copies)})`);
  if (copies[0]) {
    const seule = path.join(dir, 'seule-' + copies[0]);
    fs.copyFileSync(path.join(dir, copies[0]), seule); // copie SANS -wal
    check(lire(seule).includes('LIGNE-DANS-LE-WAL'), 'la copie, ouverte seule, contient la ligne du WAL');
  }
  check(lire(dbPath).join() === 'SOURCE-VALIDE', '(d) la base cible est restauree depuis la source');

  console.log('(b) deux restaurations rapprochees : copies aux noms distincts :');
  // Horloge figee : meme horodatage, donc seul le suffixe unique les distingue.
  const gel = path.join(dir, 'gel.js');
  fs.writeFileSync(gel, "Date.prototype.toISOString = () => '2026-01-01T00:00:00.000Z';");
  const gelEnv = { NODE_OPTIONS: `--require ${JSON.stringify(gel.split(path.sep).join('/'))}` };
  const r2 = restaurer(dbPath, src, gelEnv);
  const r3 = restaurer(dbPath, src, gelEnv);
  check(r2.status === 0 && r3.status === 0, 'deux restaurations reussissent');
  const n = copiesDe(dir).length;
  check(n === 3, `trois copies distinctes au total (dont 2 au meme horodatage) (recu ${n})`);

  console.log('(c) source SQLite saine mais etrangere : refusee, cible inchangee :');
  const etrangere = path.join(dir, 'etrangere.db');
  const e = new DatabaseSync(etrangere);
  e.exec('CREATE TABLE autre (x TEXT)');
  e.close();
  const avant = hash(dbPath);
  const nAvant = fs.readdirSync(dir).length;
  const r4 = restaurer(dbPath, etrangere);
  check(r4.status !== 0, `code de sortie non nul (recu ${r4.status})`);
  check(/tables manquantes/.test(r4.stderr), `message clair (${(r4.stderr || '').trim()})`);
  check(hash(dbPath) === avant, 'base cible octet pour octet inchangee');
  check(fs.readdirSync(dir).length === nAvant, 'aucune copie de securite creee pour une source refusee');

  console.log("(f) echec de la copie en cours de restauration : la base d'avant est remise en etat :");
  // Base courante avec un VRAI -wal (handle ouvert, pas de checkpoint), puis la copie
  // src -> dbPath est forcee a echouer (shim sur fs.copyFileSync) : le retour arriere doit
  // remettre l'etat d'avant (la copie de securite VACUUM INTO contient le contenu du WAL).
  const dbOrig2 = path.join(dir, 'orig2.db');
  ouvert = creer(dbOrig2, 'AVANT-ECHEC', true);
  const dbPath2 = path.join(dir, 'sous', 'app.db');
  fs.mkdirSync(path.dirname(dbPath2));
  fs.copyFileSync(dbOrig2, dbPath2);
  fs.copyFileSync(dbOrig2 + '-wal', dbPath2 + '-wal');
  ouvert.close();
  ouvert = null;
  const srcEchec = path.join(dir, 'source-echec.db');
  creer(srcEchec, 'NE-DOIT-PAS-ARRIVER', false).close();
  const casse = path.join(dir, 'casse.js');
  fs.writeFileSync(casse, [
    "const fs = require('node:fs');",
    'const vrai = fs.copyFileSync;',
    'fs.copyFileSync = function (a, b, ...r) {',
    "  if (String(a).endsWith('source-echec.db')) throw new Error('disque plein (simule)');",
    '  return vrai.call(this, a, b, ...r);',
    '};',
  ].join(String.fromCharCode(10)));
  const r5 = restaurer(dbPath2, srcEchec, { NODE_OPTIONS: `--require ${JSON.stringify(casse.split(path.sep).join('/'))}` });
  check(r5.status === 1, `sortie 1 apres l'echec de copie (recu ${r5.status})`);
  check(/retour a l'etat d'avant/.test(r5.stderr), 'le retour arriere est annonce');
  check(!fs.existsSync(dbPath2 + '-wal'), 'aucun -wal ne reste a cote de la base remise en etat');
  check(lire(dbPath2).join() === 'AVANT-ECHEC', `la base d'avant est remise en etat (recu ${JSON.stringify(lire(dbPath2))})`);

} finally {
  try { if (ouvert) ouvert.close(); } catch { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}
console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
