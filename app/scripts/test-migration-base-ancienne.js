// Migrations de src/db.js sur une base ANCIENNE (sans user_version, ALTER
// conditionnels non transactionnels) :
//   - une base au schema initial (sans archive, email, texte_intro, est_demo,
//     tables invites/commentaires/session_questions/roles) est migree a l'ouverture ;
//   - l'ouverture est IDEMPOTENTE (deuxieme ouverture sans erreur ni changement) ;
//   - les routes d'ecriture fonctionnent ensuite (serveur reel sur cette base) ;
//   - base avec doublons (session, e-mail) : l'alerte « Index d'unicite ... non cree »
//     est emise et le serveur demarre quand meme (decision : pas d'echec dur).
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, lancer, json, fetchMutant, nettoyer } = require('./harnais-robustesse');

const RACINE = path.join(__dirname, '..');
const OUVRIR = "require('./src/db'); require('./src/db').close(); console.log('ouverte');";

const SCHEMA_ANCIEN = `
  CREATE TABLE piliers (id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL, ordre INTEGER NOT NULL);
  CREATE TABLE sous_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, pilier_id INTEGER NOT NULL REFERENCES piliers(id) ON DELETE CASCADE, nom TEXT NOT NULL, ordre INTEGER NOT NULL);
  CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, sous_categorie_id INTEGER NOT NULL REFERENCES sous_categories(id) ON DELETE CASCADE, ordre INTEGER NOT NULL, texte TEXT NOT NULL);
  CREATE TABLE niveaux (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, niveau INTEGER NOT NULL, texte TEXT NOT NULL, valeur_numerique INTEGER NOT NULL);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, ouverture_at TEXT NOT NULL, fermeture_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE repondants (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, nom TEXT NOT NULL, prenom TEXT NOT NULL, departement TEXT NOT NULL, equipe TEXT NOT NULL, role TEXT NOT NULL, est_manager INTEGER NOT NULL, dans_equipe INTEGER NOT NULL, created_at TEXT NOT NULL, soumis_at TEXT);
  CREATE TABLE reponses (id INTEGER PRIMARY KEY AUTOINCREMENT, repondant_id TEXT NOT NULL REFERENCES repondants(id) ON DELETE CASCADE, question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, niveau INTEGER NOT NULL, UNIQUE(repondant_id, question_id));
  INSERT INTO piliers (nom, ordre) VALUES ('Pilier', 0);
  INSERT INTO sous_categories (pilier_id, nom, ordre) VALUES (1, 'Objectif', 0);
  INSERT INTO questions (sous_categorie_id, ordre, texte) VALUES (1, 0, 'Q1');
  INSERT INTO niveaux (question_id, niveau, texte, valeur_numerique) VALUES (1, 0, 'n0', 0), (1, 1, 'n1', 1), (1, 2, 'n2', 2), (1, 3, 'n3', 3);
  INSERT INTO sessions VALUES ('sess-ancienne', '2020-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z');
  INSERT INTO repondants VALUES ('ancien-1', 'sess-ancienne', 'Nom', 'Prenom', 'Dept', 'Equipe', 'Testeur', 0, 1, '2020-01-02T00:00:00.000Z', NULL);
`;

function colonnes(dbPath, table) {
  const d = new DatabaseSync(dbPath, { readOnly: true });
  try { return d.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name); } finally { d.close(); }
}
function ouvrir(dbPath) {
  return spawnSync(process.execPath, ['-e', OUVRIR], { cwd: RACINE, env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8', timeout: 60000 });
}

(async () => {
  const dossier = dossierTemporaire('migration-ancienne');
  try {
    // --- Base ancienne
    const dbPath = path.join(dossier, 'ancienne.db');
    const ancienne = new DatabaseSync(dbPath);
    ancienne.exec(SCHEMA_ANCIEN);
    ancienne.close();
    check(!colonnes(dbPath, 'piliers').includes('archive') && !colonnes(dbPath, 'repondants').includes('email'), 'preparation : la base fabriquee est bien ancienne (pas d\'archive, pas d\'email)');

    const o1 = ouvrir(dbPath);
    check(o1.status === 0 && o1.stdout.includes('ouverte'), `premiere ouverture via src/db.js sans erreur (code ${o1.status} ${o1.stderr})`);
    const attendu = { piliers: ['archive'], sous_categories: ['archive'], questions: ['archive'], repondants: ['email'], sessions: ['texte_intro', 'est_demo'] };
    for (const [table, cols] of Object.entries(attendu)) {
      const presentes = colonnes(dbPath, table);
      check(cols.every((c) => presentes.includes(c)), `colonne(s) ${cols.join(', ')} ajoutee(s) a ${table}`);
    }
    const d = new DatabaseSync(dbPath, { readOnly: true });
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    const index = d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_repondants_session_email'").all();
    const avant = JSON.stringify(d.prepare('SELECT * FROM repondants').all());
    d.close();
    check(['invites', 'commentaires', 'session_questions', 'roles'].every((t) => tables.includes(t)), 'tables recentes creees (invites, commentaires, session_questions, roles)');
    check(index.length === 1, 'index d\'unicite (session, e-mail) cree');

    const o2 = ouvrir(dbPath);
    check(o2.status === 0 && !/ALTER|duplicate column|error/i.test(o2.stderr), `deuxieme ouverture idempotente (code ${o2.status} ${o2.stderr})`);
    const d2 = new DatabaseSync(dbPath, { readOnly: true });
    check(JSON.stringify(d2.prepare('SELECT * FROM repondants').all()) === avant, 'les donnees existantes sont inchangees apres 2 ouvertures');
    d2.close();

    const serveur = await lancer({ dbPath, nom: 'migration' });
    try {
      const base = serveur.base;
      const s = await json(base, '/api/sessions', 'POST', { ouverture_at: new Date(Date.now() - 3600e3).toISOString(), fermeture_at: new Date(Date.now() + 3600e3).toISOString() });
      check(s.status === 200, `creation de session sur base migree (recu ${s.status} ${serveur.sortie().slice(-200)})`);
      const id = (await s.json()).id;
      const r = await json(base, `/api/sessions/${id}/repondants`, 'POST', { email: 'nouveau@example.com', nom: 'N', prenom: 'P', departement: 'Dept', equipe: 'Equipe', role: 'Testeur', est_manager: false, dans_equipe: true });
      check(r.status === 200, `inscription sur base migree (recu ${r.status})`);
      const c = await json(base, `/api/sessions/${id}/commentaire`, 'PUT', { equipe: 'Equipe', texte: 'ok' });
      check(c.status === 200, `commentaire sur base migree (recu ${c.status})`);
      const f = new FormData();
      f.append('fichier', new Blob(['email\nanna@example.com\n'], { type: 'text/csv' }), 'invites.csv');
      const i = await fetchMutant(`${base}/api/sessions/${id}/invites`, { method: 'POST', body: f });
      check(i.status === 200, `import d'invites sur base migree (recu ${i.status})`);
      const anciens = await json(base, '/api/sessions/sess-ancienne', 'GET');
      check(anciens.status === 200, 'la session historique reste lisible');
    } finally { await serveur.arreter(); }

    // --- Base avec doublons d'e-mail : alerte, mais demarrage quand meme
    const dbDoublons = path.join(dossier, 'doublons.db');
    const dd = new DatabaseSync(dbDoublons);
    dd.exec(SCHEMA_ANCIEN);
    dd.exec('ALTER TABLE repondants ADD COLUMN email TEXT');
    dd.exec("INSERT INTO repondants VALUES ('d1', 'sess-ancienne', 'N', 'P', 'D', 'E', 'R', 0, 1, '2020-01-02T00:00:00.000Z', NULL, 'double@example.com'), ('d2', 'sess-ancienne', 'N', 'P', 'D', 'E', 'R', 0, 1, '2020-01-02T00:00:00.000Z', NULL, 'double@example.com')");
    dd.close();
    const od = ouvrir(dbDoublons);
    check(od.status === 0, `base avec doublons : ouverture sans echec dur (code ${od.status})`);
    check(/\[db\] Index d'unicite \(session_id, email\) non cree/.test(od.stderr), 'l\'alerte explicite « Index d\'unicite ... non cree » est emise');
    const sd = await lancer({ dbPath: dbDoublons, nom: 'doublons' });
    try {
      check(/Index d'unicite/.test(sd.sortie()), 'le serveur emet l\'alerte au demarrage');
      const l = await fetchMutant(`${sd.base}/api/sessions/sess-ancienne`);
      check(l.status === 200, 'le serveur demarre et sert la base a doublons');
    } finally { await sd.arreter(); }
  } finally { await nettoyer(dossier); }
  terminer();
  console.log('Migration de base ancienne OK');
})().catch((e) => { console.error(e); process.exit(1); });
