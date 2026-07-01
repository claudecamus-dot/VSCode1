// Test isole du rappel cible sur les non-repondants (US2.5). Base temporaire
// via DB_PATH : ne touche jamais la vraie app.db.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

process.env.DB_PATH = path.join(os.tmpdir(), `test-rappel-${crypto.randomUUID()}.db`);

const db = require('../src/db');
const { replaceInvites, getNonRepondants, looksLikeEmail } = require('../src/invites');

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}

function creerSession() {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at) VALUES (?, ?, ?, ?)').run(
    id, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z', '2026-01-01T00:00:00Z'
  );
  return id;
}

function creerRepondant(sessionId, { email, soumis }) {
  db.prepare(
    `INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at)
     VALUES (?, ?, ?, 'N', 'P', 'D', 'E', 'PO', 0, 1, '2026-01-02T00:00:00Z', ?)`
  ).run(crypto.randomUUID(), sessionId, email, soumis ? '2026-01-02T01:00:00Z' : null);
}

console.log('Validation email :');
check(looksLikeEmail('a@b.com'), 'a@b.com accepte');
check(!looksLikeEmail('pas-un-email'), '"pas-un-email" rejete');
check(!looksLikeEmail(''), 'vide rejete');
check(!looksLikeEmail(undefined), 'undefined rejete');

console.log('Ciblage des non-repondants :');
const s1 = creerSession();
replaceInvites(s1, [
  { email: 'alice@x.com', nom: 'Alice' },
  { email: 'bob@x.com', nom: 'Bob' },
  { email: 'carol@x.com', nom: 'Carol' },
]);
creerRepondant(s1, { email: 'alice@x.com', soumis: true });   // a repondu
creerRepondant(s1, { email: 'bob@x.com', soumis: false });    // commence, non soumis
// carol : jamais venue

const nr1 = getNonRepondants(s1).map((i) => i.email).sort();
check(JSON.stringify(nr1) === JSON.stringify(['bob@x.com', 'carol@x.com']), `non-repondants = bob+carol (recu ${JSON.stringify(nr1)})`);
check(!nr1.includes('alice@x.com'), 'alice (soumis) exclue du rappel');

console.log('Rapprochement insensible a la casse :');
const s2 = creerSession();
replaceInvites(s2, [{ email: 'DUPONT@x.com', nom: 'Dupont' }]);
creerRepondant(s2, { email: 'dupont@x.com', soumis: true });
const nr2 = getNonRepondants(s2);
check(nr2.length === 0, 'DUPONT@x.com reconnu malgre la casse (aucun rappel)');

console.log('Repli sessions sans email cote repondant (legacy) :');
const s3 = creerSession();
replaceInvites(s3, [{ email: 'x@x.com', nom: null }, { email: 'y@x.com', nom: null }]);
creerRepondant(s3, { email: null, soumis: true }); // ancien repondant sans email
const nr3 = getNonRepondants(s3).map((i) => i.email).sort();
check(JSON.stringify(nr3) === JSON.stringify(['x@x.com', 'y@x.com']), 'sans email rapprochable -> rappel a tous les invites');

try { fs.rmSync(process.env.DB_PATH); } catch {}
console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
