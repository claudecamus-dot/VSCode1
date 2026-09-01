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

console.log('Perimetre d\'une session : une question CADREE mais SANS reponse survit au re-import :');
// Regression BLOQUANTE reproduite le 2026-09-01. Une question sans reponse etait
// SUPPRIMEE ; `session_questions.question_id` est en ON DELETE CASCADE, donc le
// cadrage de la session partait avec elle. `activeQuestionIds` (server.js) retombait
// alors sur son repli « aucune ligne = tout le referentiel est actif » — repli concu
// pour les sessions anterieures a la fonctionnalite, incapable de distinguer
// « jamais cadree » de « cadrage efface ». Resultat vecu : l'animateur corrige une
// coquille dans le texte de deux questions (le TEXTE est la cle de rapprochement,
// donc elles passent pour disparues), et le repondant recoit les 5 questions du
// referentiel au lieu des 2 de son perimetre.
function grilleC(textes) {
  return [
    {
      nom: 'Pilier C',
      ordre: 0,
      sousCategories: [
        { nom: 'Objectif Q', ordre: 0, questions: textes.map((t) => ({ texte: t, niveaux: niveaux() })) },
      ],
    },
  ];
}

// Repliques exactes de server.js (activeQuestionIds l.64-70, referentielPourSession
// l.77-92) : ces deux fonctions ne sont pas exportees, mais ce sont elles qui
// decident de ce que le repondant recoit. Les recopier ici est le seul moyen de
// mesurer l'effet du re-import sur le perimetre reellement servi.
function activeQuestionIds(sessionId) {
  const rows = db.prepare('SELECT question_id FROM session_questions WHERE session_id = ?').all(sessionId);
  if (rows.length === 0) {
    return new Set(db.prepare('SELECT id FROM questions WHERE archive = 0').all().map((q) => q.id));
  }
  return new Set(rows.map((r) => r.question_id));
}
function referentielPourSession(sessionId) {
  const actives = activeQuestionIds(sessionId);
  return getReferentiel({ includeArchived: true })
    .map((pilier) => ({
      ...pilier,
      sousCategories: pilier.sousCategories
        .map((sc) => ({ ...sc, questions: sc.questions.filter((q) => actives.has(q.id)) }))
        .filter((sc) => sc.questions.length > 0),
    }))
    .filter((pilier) => pilier.sousCategories.length > 0);
}

// Base a neuf : 5 questions, aucune reponse nulle part.
remplacerTout(grilleC(['C1', 'C2', 'C3', 'C4', 'C5']));
const idC2 = db.prepare("SELECT id FROM questions WHERE texte = 'C2'").get().id;
const idC4 = db.prepare("SELECT id FROM questions WHERE texte = 'C4'").get().id;

const sessionCadree = crypto.randomUUID();
db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)').run(
  sessionCadree, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z', '2026-01-01T00:00:00Z'
);
const insSqCadree = db.prepare('INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)');
insSqCadree.run(sessionCadree, idC2);
insSqCadree.run(sessionCadree, idC4);

check(db.prepare('SELECT COUNT(*) AS n FROM reponses').get().n === 0, 'pre-condition : AUCUNE reponse en base');
check(db.prepare('SELECT COUNT(*) AS n FROM questions').get().n === 5, 'pre-condition : 5 questions au referentiel');
check(activeQuestionIds(sessionCadree).size === 2, 'pre-condition : la session est cadree sur 2 questions');

// L'animateur corrige le texte de C2 et C4 (elles paraissent disparues), et
// retire C5 (ni cadree ni repondue : elle, doit bien etre supprimee).
const archiveesCadrage = reconcileReferentiel(grilleC(['C1', 'C2 corrigee', 'C3', 'C4 corrigee']));

check(archiveesCadrage === 2, `2 questions archivees car cadrees (recu ${archiveesCadrage})`);
check(
  db.prepare('SELECT COUNT(*) AS n FROM session_questions WHERE session_id = ?').get(sessionCadree).n === 2,
  'session_questions conserve ses 2 lignes (le cadrage n\'a pas ete emporte par la cascade)'
);
const idsCadres = db.prepare('SELECT question_id FROM session_questions WHERE session_id = ? ORDER BY question_id').all(sessionCadree).map((r) => r.question_id);
check(idsCadres.includes(idC2) && idsCadres.includes(idC4), 'le cadrage pointe toujours sur les MEMES question_id');
// `get()` rend undefined si la question a ete SUPPRIMEE : on teste la ligne
// avant son champ, sinon l'echec se manifeste en TypeError au lieu d'un FAIL lisible.
const ligneC2 = db.prepare('SELECT archive FROM questions WHERE id = ?').get(idC2);
const ligneC4 = db.prepare('SELECT archive FROM questions WHERE id = ?').get(idC4);
check(!!ligneC2 && ligneC2.archive === 1, 'C2 archivee (non supprimee)');
check(!!ligneC4 && ligneC4.archive === 1, 'C4 archivee (non supprimee)');
check(!db.prepare("SELECT 1 FROM questions WHERE texte = 'C5'").get(), 'C5 (ni cadree ni repondue) reste supprimee');

const activesApres = activeQuestionIds(sessionCadree);
check(activesApres.size === 2, `activeQuestionIds rend 2 questions, pas tout le referentiel (recu ${activesApres.size})`);
check(activesApres.has(idC2) && activesApres.has(idC4), 'le perimetre actif est bien C2 et C4');

const refSession = referentielPourSession(sessionCadree);
const textesSession = refSession.flatMap((p) => p.sousCategories.flatMap((sc) => sc.questions.map((q) => q.texte)));
check(textesSession.length === 2, `le repondant recoit 2 questions (recu ${textesSession.length})`);
check(
  textesSession.includes('C2') && textesSession.includes('C4'),
  `la session sert la formulation avec laquelle elle a ete lancee (recu ${JSON.stringify(textesSession)})`
);

// Les nouvelles formulations existent bien, actives, pour les prochaines sessions.
const textesActifsApres = getReferentiel().flatMap((p) => p.sousCategories.flatMap((sc) => sc.questions.map((q) => q.texte)));
check(textesActifsApres.length === 4, `4 questions actives au referentiel apres correction (recu ${textesActifsApres.length})`);
check(
  textesActifsApres.includes('C2 corrigee') && textesActifsApres.includes('C4 corrigee'),
  'les textes corriges sont actifs pour les futures sessions'
);

// Nettoyage
try { fs.rmSync(dbFile); } catch { /* nettoyage best-effort */ }

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
