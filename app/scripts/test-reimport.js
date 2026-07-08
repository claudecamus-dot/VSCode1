// Test isole du re-import non destructif (US1.2). Utilise une base temporaire
// via DB_PATH pour ne jamais toucher la vraie app.db.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const dbFile = path.join(os.tmpdir(), `test-reimport-${crypto.randomUUID()}.db`);
process.env.DB_PATH = dbFile;

const db = require('../src/db');
const { reconcileReferentiel, getReferentiel, remplacerTout } = require('../src/referentiel');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

// Grille v1 : 1 pilier, 1 objectif, 2 questions (q1, q2).
const v1 = [
  {
    nom: 'Pilier A',
    ordre: 0,
    sousCategories: [
      {
        nom: 'Objectif 1',
        ordre: 0,
        questions: [
          { texte: 'Question 1', niveaux: niveaux() },
          { texte: 'Question 2', niveaux: niveaux() },
        ],
      },
    ],
  },
];

reconcileReferentiel(v1);

const q1 = db.prepare("SELECT id FROM questions WHERE texte = 'Question 1'").get().id;
const q2 = db.prepare("SELECT id FROM questions WHERE texte = 'Question 2'").get().id;

// Une session qui couvre q1 et q2, un repondant, et des reponses aux deux.
const sessionId = crypto.randomUUID();
db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)').run(
  sessionId, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z', '2026-01-01T00:00:00Z'
);
const insSq = db.prepare('INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)');
insSq.run(sessionId, q1);
insSq.run(sessionId, q2);
const repId = crypto.randomUUID();
db.prepare(
  `INSERT INTO repondants (id, session_id, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at)
   VALUES (?, ?, 'Doe', 'Jane', 'Dept', 'Equipe', 'PO', 0, 1, '2026-01-02T00:00:00Z', '2026-01-02T01:00:00Z')`
).run(repId, sessionId);
const insRep = db.prepare('INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, ?)');
insRep.run(repId, q1, 2);
insRep.run(repId, q2, 3);

console.log('Re-import identique (idempotence) :');
reconcileReferentiel(v1);
check(db.prepare("SELECT id FROM questions WHERE texte = 'Question 1'").get().id === q1, 'q1 garde le meme id');
check(db.prepare("SELECT id FROM questions WHERE texte = 'Question 2'").get().id === q2, 'q2 garde le meme id');
check(db.prepare('SELECT COUNT(*) AS n FROM questions').get().n === 2, 'pas de question dupliquee');

console.log('Re-import v2 : q2 retiree, q3 ajoutee, q1 inchangee :');
const v2 = [
  {
    nom: 'Pilier A',
    ordre: 0,
    sousCategories: [
      {
        nom: 'Objectif 1',
        ordre: 0,
        questions: [
          { texte: 'Question 1', niveaux: niveaux() },
          { texte: 'Question 3', niveaux: niveaux() },
        ],
      },
    ],
  },
];
const archivees = reconcileReferentiel(v2);

check(archivees === 1, `1 question archivee (recu ${archivees})`);
check(db.prepare("SELECT id FROM questions WHERE texte = 'Question 1'").get().id === q1, 'q1 garde le meme id apres v2');
check(db.prepare('SELECT niveau FROM reponses WHERE repondant_id = ? AND question_id = ?').get(repId, q1).niveau === 2, 'reponse a q1 intacte');

const q2row = db.prepare('SELECT archive FROM questions WHERE id = ?').get(q2);
check(q2row && q2row.archive === 1, 'q2 archivee (non supprimee)');
check(!!db.prepare('SELECT 1 FROM reponses WHERE repondant_id = ? AND question_id = ?').get(repId, q2), 'reponse a q2 (archivee) conservee');

const q3 = db.prepare("SELECT id FROM questions WHERE texte = 'Question 3'").get();
check(!!q3 && q3.id !== q1 && q3.id !== q2, 'q3 inseree avec un nouvel id');

console.log('Visibilite archive vs non-archive :');
const ref = getReferentiel();
const textesActifs = ref.flatMap((p) => p.sousCategories.flatMap((sc) => sc.questions.map((q) => q.texte)));
check(textesActifs.includes('Question 1') && textesActifs.includes('Question 3'), 'getReferentiel() montre q1 et q3');
check(!textesActifs.includes('Question 2'), 'getReferentiel() masque q2 archivee');

const refArch = getReferentiel({ includeArchived: true });
const textesTous = refArch.flatMap((p) => p.sousCategories.flatMap((sc) => sc.questions.map((q) => q.texte)));
check(textesTous.includes('Question 2'), 'getReferentiel({includeArchived:true}) montre q2 archivee');

console.log('Suppression d\'une entree SANS reponse :');
const v3 = [
  {
    nom: 'Pilier A',
    ordre: 0,
    sousCategories: [
      { nom: 'Objectif 1', ordre: 0, questions: [{ texte: 'Question 1', niveaux: niveaux() }] },
    ],
  },
];
reconcileReferentiel(v3);
// q3 n'avait pas de reponse -> doit etre supprimee, pas archivee.
check(!db.prepare("SELECT 1 FROM questions WHERE texte = 'Question 3'").get(), 'q3 (sans reponse) supprimee');
check(db.prepare('SELECT archive FROM questions WHERE id = ?').get(q2).archive === 1, 'q2 toujours archivee');

console.log('Remplacer complètement (mode destructif) :');
// État avant : il reste une session, un répondant et des réponses (q1 + q2 archivée).
check(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 1, 'pre-condition : 1 session existe');
check(db.prepare('SELECT COUNT(*) AS n FROM reponses').get().n > 0, 'pre-condition : des reponses existent');

// Grille v4 entièrement différente, chargée à neuf.
const v4 = [
  {
    nom: 'Pilier B',
    ordre: 0,
    sousCategories: [
      { nom: 'Objectif Z', ordre: 0, questions: [{ texte: 'Question neuve', niveaux: niveaux() }] },
    ],
  },
];
const archiveesV4 = remplacerTout(v4);

check(archiveesV4 === 0, `remplacerTout n'archive rien (recu ${archiveesV4})`);
check(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === 0, 'toutes les sessions supprimees');
check(db.prepare('SELECT COUNT(*) AS n FROM repondants').get().n === 0, 'tous les repondants supprimes');
check(db.prepare('SELECT COUNT(*) AS n FROM reponses').get().n === 0, 'toutes les reponses supprimees');
check(db.prepare('SELECT COUNT(*) AS n FROM session_questions').get().n === 0, 'tous les session_questions supprimes');
check(!db.prepare("SELECT 1 FROM questions WHERE texte = 'Question 1'").get(), 'ancienne Question 1 supprimee');
check(!db.prepare("SELECT 1 FROM questions WHERE texte = 'Question 2'").get(), 'ancienne Question 2 (archivee) supprimee');
check(!db.prepare("SELECT 1 FROM piliers WHERE nom = 'Pilier A'").get(), 'ancien Pilier A supprime');

const refV4 = getReferentiel({ includeArchived: true });
const textesV4 = refV4.flatMap((p) => p.sousCategories.flatMap((sc) => sc.questions.map((q) => q.texte)));
check(refV4.length === 1 && refV4[0].nom === 'Pilier B', 'seul Pilier B subsiste');
check(textesV4.length === 1 && textesV4[0] === 'Question neuve', 'seule la nouvelle question subsiste (aucun residu archive)');

// Nettoyage
try { fs.rmSync(dbFile); } catch { /* nettoyage best-effort */ }

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
