'use strict';
// Peuple le MODE DÉMO (sessions est_demo=1) avec un jeu de données fictives riche,
// pour la phase de démonstration : 1 département, 3 équipes aux profils de maturité
// distincts, réponses variées (dispersion intra-équipe réaliste), + une session
// ANTÉRIEURE pour exercer la comparaison dans le temps (US6.5). Le référentiel
// (piliers/questions) est lu tel quel dans la base — importer une grille au préalable.
//
// - Idempotent : purge d'abord toutes les sessions démo existantes (cascade), puis
//   régénère. Déterministe (PRNG semé) => "regénère" redonne le même jeu.
// - Ne touche JAMAIS les données réelles (est_demo=0) : purge et insertions filtrées.
// - Cible DB_PATH (comme db.js). Lancer sur le DEV :
//     node --env-file=.env.dev scripts/seed-demo.js
//   Sur PROD (APP_ENV=PROD) : refuse sauf --force.
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
if ((process.env.APP_ENV || '') === 'PROD' && !process.argv.includes('--force')) {
  console.error(`Refus : APP_ENV=PROD (${dbPath}). Relancez avec --force pour semer la démo en PROD.`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

// PRNG déterministe (mulberry32).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260722);

// Référentiel courant : piliers (ordre stable) + questions actives -> index de pilier.
const piliers = db.prepare('SELECT id FROM piliers WHERE archive = 0 ORDER BY ordre').all();
const idxPilier = new Map(piliers.map((p, i) => [p.id, i]));
const questions = db.prepare(`
  SELECT q.id AS qid, sc.pilier_id AS pid
  FROM questions q JOIN sous_categories sc ON sc.id = q.sous_categorie_id
  WHERE q.archive = 0 AND sc.archive = 0
  ORDER BY q.id`).all();
if (questions.length === 0) {
  console.error('Aucune question active dans le référentiel : importez une grille avant de semer la démo.');
  process.exit(1);
}

const DEPT = 'Direction Digitale';
const ROLES = ['Product Owner', 'Scrum Master', 'Tech Lead', 'Développeur'];
const PRENOMS = ['Sofia', 'Marc', 'Inès', 'Yanis', 'Léa', 'Karim', 'Chloé', 'Hugo', 'Nadia', 'Tom', 'Emma', 'Sacha'];
const NOMS = ['Lambert', 'Diallo', 'Roy', 'Nguyen', 'Bernard', 'Moreau', 'Faure', 'Petit', 'Garcia', 'Lemoine', 'Dubois', 'Rossi'];

// Profils par équipe : maturité de base par pilier (index), sur 0..3 (donne la
// silhouette du radar et différencie les équipes dans la vue pilotage).
const TEAMS = [
  { equipe: 'Squad Paiement', bases: [2.6, 2.4, 2.2, 1.8], commentaire: "Équipe mûre : socle produit et craftsmanship solides, à capitaliser. L'effort prioritaire porte sur le passage à l'échelle." },
  { equipe: 'Squad Mobilité', bases: [1.9, 2.1, 1.6, 1.2], commentaire: 'Bonnes pratiques techniques ; la culture agile et le pilotage par la valeur restent à ancrer.' },
  { equipe: 'Squad Data', bases: [1.4, 1.2, 1.7, 0.8], commentaire: "Équipe en construction : prioriser la structuration du backlog produit et l'outillage d'ingénierie." },
];
const baseFor = (bases, i) => (i < bases.length ? bases[i] : 1.5);
function niveauFor(base) {
  const noise = (rnd() + rnd() - 1) * 0.9; // ~[-0.9, 0.9] : dispersion intra-équipe
  return Math.max(0, Math.min(3, Math.round(base + noise)));
}

const now = Date.now();
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
// Session antérieure (plus faible) puis courante (progrès) — la comparaison US6.5
// associe l'équipe par nom à la session la plus récente antérieure.
const SESSIONS = [
  { ouverture: now - 60 * DAY, fermeture: now - 30 * DAY, delta: -0.4, commentaires: false },
  { ouverture: now - 12 * DAY, fermeture: now + 18 * DAY, delta: 0.0, commentaires: true },
];

// --- Purge de la démo existante uniquement (cascade via foreign_keys ON) ---
const anciennes = db.prepare('SELECT id FROM sessions WHERE est_demo = 1').all().length;
db.prepare('DELETE FROM sessions WHERE est_demo = 1').run();

const insSession = db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at, texte_intro, est_demo) VALUES (?, ?, ?, ?, ?, 1)');
const insSQ = db.prepare('INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)');
const insRep = db.prepare(`INSERT INTO repondants
  (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
const insReponse = db.prepare('INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, ?)');
const insComment = db.prepare('INSERT INTO commentaires (session_id, equipe, texte, updated_at) VALUES (?, ?, ?, ?)');

let nSess = 0, nRep = 0, nRepo = 0, ni = 0;
for (const s of SESSIONS) {
  const sid = crypto.randomUUID();
  insSession.run(sid, iso(s.ouverture), iso(s.fermeture), iso(s.ouverture), 'Session de démonstration — données fictives.');
  for (const q of questions) insSQ.run(sid, q.qid);
  nSess++;
  for (const t of TEAMS) {
    for (let r = 0; r < 4; r++) {
      const estManager = r === 0 ? 1 : 0;
      const prenom = PRENOMS[ni % PRENOMS.length];
      const nom = NOMS[(ni * 5 + 3) % NOMS.length];
      const role = estManager ? 'Manager' : ROLES[(r - 1) % ROLES.length];
      const rid = crypto.randomUUID();
      insRep.run(rid, sid, `${prenom}.${nom}@demo.example`.toLowerCase(), nom, prenom, DEPT, t.equipe, role,
        estManager, iso(s.ouverture), iso(s.ouverture + (2 + r) * DAY));
      nRep++;
      for (const q of questions) {
        insReponse.run(rid, q.qid, niveauFor(baseFor(t.bases, idxPilier.get(q.pid)) + s.delta));
        nRepo++;
      }
      ni++;
    }
    if (s.commentaires) insComment.run(sid, t.equipe, t.commentaire, iso(s.ouverture + 5 * DAY));
  }
}

console.log(`Purge : ${anciennes} session(s) démo supprimée(s).`);
console.log(`Semé (est_demo=1) : ${nSess} sessions, ${nRep} répondants, ${nRepo} réponses.`);
console.log(`  Département "${DEPT}" · équipes : ${TEAMS.map((t) => t.equipe).join(', ')}.`);
console.log(`  Base : ${dbPath}`);
db.close();
