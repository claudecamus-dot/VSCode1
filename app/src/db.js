const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
// Cree le dossier de la base au besoin (sinon DB_PATH pointant vers un dossier
// d'environnement inexistant — ./data/dev, ./data/prod… — ferait echouer l'ouverture).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
// `timeout` : duree pendant laquelle une ecriture qui trouve la base verrouillee
// REESSAIE avant d'echouer. Sans lui, busy_timeout vaut 0 ms (mesure le
// 2026-09-01) : une sauvegarde lancee pendant qu'un repondant enregistre un
// pilier faisait echouer l'un des deux cotes immediatement, sans reessai.
const db = new DatabaseSync(dbPath, { timeout: 5000 });

// WAL : lecteurs et ecrivain ne se bloquent plus mutuellement — le cas normal ici,
// ou l'animateur lit ses resultats pendant que l'equipe repond. Compatible avec les
// deux scripts qui touchent au fichier : backup-db.js passe par `VACUUM INTO` (qui
// lit dans une transaction, donc voit le WAL) et restore-db.js retire deja les
// fichiers -wal/-shm avant d'ecraser la base. Ces deux fichiers sont ignores par
// app/.gitignore, ou le glob `*.db` ne suffisait pas a les couvrir.
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS piliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    ordre INTEGER NOT NULL,
    archive INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sous_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pilier_id INTEGER NOT NULL REFERENCES piliers(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    ordre INTEGER NOT NULL,
    archive INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sous_categorie_id INTEGER NOT NULL REFERENCES sous_categories(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL,
    texte TEXT NOT NULL,
    archive INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS niveaux (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    niveau INTEGER NOT NULL,
    texte TEXT NOT NULL,
    valeur_numerique INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    ouverture_at TEXT NOT NULL,
    fermeture_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    texte_intro TEXT
  );

  CREATE TABLE IF NOT EXISTS repondants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    email TEXT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    departement TEXT NOT NULL,
    equipe TEXT NOT NULL,
    role TEXT NOT NULL,
    est_manager INTEGER NOT NULL,
    dans_equipe INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    soumis_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reponses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repondant_id TEXT NOT NULL REFERENCES repondants(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    niveau INTEGER NOT NULL,
    UNIQUE(repondant_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nom TEXT
  );

  CREATE TABLE IF NOT EXISTS session_questions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS commentaires (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    equipe TEXT NOT NULL,
    texte TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (session_id, equipe)
  );
`);

// Migration : ajoute la colonne `archive` aux bases anterieures au re-import
// non destructif (US1.2). CREATE TABLE IF NOT EXISTS ne modifie pas une table
// deja presente, d'ou cet ALTER conditionnel idempotent.
for (const table of ['piliers', 'sous_categories', 'questions']) {
  const colonnes = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!colonnes.some((c) => c.name === 'archive')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN archive INTEGER NOT NULL DEFAULT 0`);
  }
}

// Migration : email du repondant (US2.5), pour cibler le rappel sur les invites
// n'ayant pas soumis. Nullable, car les repondants anterieurs n'en ont pas.
if (!db.prepare('PRAGMA table_info(repondants)').all().some((c) => c.name === 'email')) {
  db.exec('ALTER TABLE repondants ADD COLUMN email TEXT');
}

// Migration : un email ne s'identifie qu'UNE fois par session. Sans cette
// contrainte, rouvrir le lien et re-remplir l'ecran d'identification creait une
// seconde ligne, avec son propre jeu de reponses : la personne comptait double
// dans l'effectif et dans les moyennes, et la relance (qui deduplique par email)
// n'alertait de rien. Index PARTIEL : les repondants anterieurs a US2.5 n'ont pas
// d'email, et plusieurs NULL ne se comparent pas entre eux en SQLite de toute
// facon — la clause `WHERE email IS NOT NULL` le rend explicite.
// La creation echoue si la base porte deja des doublons : on ne bloque pas le
// demarrage pour autant (la garde applicative de POST /repondants suffit a ne
// plus en creer), mais on le DIT, faute de quoi la base resterait silencieusement
// sans contrainte.
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_repondants_session_email ON repondants (session_id, email) WHERE email IS NOT NULL');
} catch (err) {
  // NE PAS renvoyer vers /api/repondants/fusion : cette route ne fusionne que des
  // LIBELLES de departement/equipe (UPDATE), elle ne supprime aucune ligne et ne
  // peut donc pas resoudre un doublon (session_id, email). L'exploitant qui la
  // suivait redemarrait sur le meme avertissement, indefiniment.
  console.warn(
    "[db] Index d'unicite (session_id, email) non cree : la base porte deja des doublons.",
    'Les lister avec : SELECT session_id, email, COUNT(*) FROM repondants',
    'WHERE email IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1 ;',
    "puis supprimer les lignes en trop (la garde applicative de POST /repondants",
    "empeche d'en creer de nouveaux entre-temps), et redemarrer.",
    String(err.message)
  );
}

// Migration : texte d'accueil parametrable par session (US3.5). Nullable :
// une session sans texte affiche le message par defaut.
if (!db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'texte_intro')) {
  db.exec('ALTER TABLE sessions ADD COLUMN texte_intro TEXT');
}

// Migration : separation demo / reel (page d'accueil). Chaque session est fictive
// (est_demo=1, pour montrer l'outil) ou reelle (0, defaut SUR : on ne marque jamais
// des donnees existantes comme demo par accident). Le mode courant (cookie pose par
// la page d'accueil) filtre les listings et tague les creations, pour ne jamais
// melanger donnees de demonstration et vraies donnees d'equipe.
if (!db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'est_demo')) {
  db.exec('ALTER TABLE sessions ADD COLUMN est_demo INTEGER NOT NULL DEFAULT 0');
}

const defaultRoles = ['Product Owner', 'Scrum Master', 'Tech Lead', 'Développeur', 'Testeur', 'Manager'];
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (nom) VALUES (?)');
for (const role of defaultRoles) {
  insertRole.run(role);
}

module.exports = db;
