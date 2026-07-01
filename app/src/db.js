const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
// Cree le dossier de la base au besoin (sinon DB_PATH pointant vers un dossier
// d'environnement inexistant — ./data/dev, ./data/prod… — ferait echouer l'ouverture).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

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

// Migration : texte d'accueil parametrable par session (US3.5). Nullable :
// une session sans texte affiche le message par defaut.
if (!db.prepare('PRAGMA table_info(sessions)').all().some((c) => c.name === 'texte_intro')) {
  db.exec('ALTER TABLE sessions ADD COLUMN texte_intro TEXT');
}

const defaultRoles = ['Product Owner', 'Scrum Master', 'Tech Lead', 'Développeur', 'Testeur', 'Manager'];
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (nom) VALUES (?)');
for (const role of defaultRoles) {
  insertRole.run(role);
}

module.exports = db;
