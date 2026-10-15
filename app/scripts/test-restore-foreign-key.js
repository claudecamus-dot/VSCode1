// restore-db.js refuse une sauvegarde qui porte des lignes ORPHELINES
// (PRAGMA foreign_key_check de la SOURCE) : message clair, code 1, base cible
// intacte, AUCUNE copie de securite creee. Controle : la meme sauvegarde sans
// orpheline est restauree normalement.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const SCRIPT = path.join(__dirname, 'restore-db.js');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

const SCHEMA = `
  CREATE TABLE piliers (id INTEGER PRIMARY KEY);
  CREATE TABLE questions (id INTEGER PRIMARY KEY);
  CREATE TABLE sessions (id TEXT PRIMARY KEY);
  CREATE TABLE repondants (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id));
  CREATE TABLE reponses (id INTEGER PRIMARY KEY, repondant_id TEXT NOT NULL REFERENCES repondants(id), question_id INTEGER NOT NULL REFERENCES questions(id));
  CREATE TABLE marqueur (valeur TEXT);
`;

function creer(chemin, marqueur, avecOrpheline) {
  const b = new DatabaseSync(chemin);
  b.exec('PRAGMA foreign_keys = OFF'); // fixture : les orphelines doivent pouvoir exister
  b.exec(SCHEMA);
  b.exec("INSERT INTO sessions VALUES ('s1'); INSERT INTO repondants VALUES ('r1', 's1'); INSERT INTO questions VALUES (1)");
  b.exec('INSERT INTO reponses VALUES (1, \'r1\', 1)');
  if (avecOrpheline) b.exec("INSERT INTO reponses VALUES (2, 'repondant-fantome', 1)");
  b.prepare('INSERT INTO marqueur VALUES (?)').run(marqueur);
  b.close();
}
function marqueur(chemin) {
  const b = new DatabaseSync(chemin, { readOnly: true });
  try { return b.prepare('SELECT valeur FROM marqueur').get().valeur; } finally { b.close(); }
}
function restaurer(cible, source) {
  return spawnSync(process.execPath, [SCRIPT, source], { env: { ...process.env, DB_PATH: cible }, encoding: 'utf8', timeout: 60000 });
}

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-fk-'));
try {
  const cible = path.join(dossier, 'cible.db');
  const orpheline = path.join(dossier, 'orpheline.db');
  const saine = path.join(dossier, 'saine.db');
  creer(cible, 'cible-d-origine', false);
  creer(orpheline, 'sauvegarde-orpheline', true);
  creer(saine, 'sauvegarde-saine', false);

  const r = restaurer(cible, orpheline);
  check(r.status === 1, `source avec ligne orpheline : code de sortie 1 (recu ${r.status})`);
  check(/orpheline/.test(r.stderr) && /reponses/.test(r.stderr) && /Source refusee, base cible intacte/.test(r.stderr), `message clair (${(r.stderr || '').trim()})`);
  check(marqueur(cible) === 'cible-d-origine', 'base cible intacte');
  const copies = fs.readdirSync(dossier).filter((f) => f.includes('before-restore'));
  check(copies.length === 0, `aucune copie de securite creee (${JSON.stringify(copies)})`);

  const ok = restaurer(cible, saine);
  check(ok.status === 0, `controle : source sans orpheline restauree (code ${ok.status} ${ok.stderr})`);
  check(marqueur(cible) === 'sauvegarde-saine', 'controle : la base cible porte la sauvegarde saine');
} finally {
  fs.rmSync(dossier, { recursive: true, force: true });
}
if (echecs > 0) { console.error(`${echecs} verification(s) en echec`); process.exit(1); }
console.log('Restauration : controle des cles etrangeres OK');
