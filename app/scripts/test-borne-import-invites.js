// Borne de cardinalite sur l'import d'invites (audit VSCode1, dimension performance,
// residu "note" scinde du N+1 de reconciliation ferme le 2026-09-22) : multer ne
// bornait que la TAILLE du fichier (10 Mo), rien ne bornait le NOMBRE d'emails valides
// qu'un import peut injecter. Ce test ne demarre aucun serveur : il exerce directement
// importInvitesFromBuffer, une fonction pure sur un buffer CSV en memoire.
const { importInvitesFromBuffer, MAX_INVITES } = require('../src/invites');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function csvAvecNEmails(n) {
  const lignes = [];
  for (let i = 0; i < n; i += 1) lignes.push(`invite${i}@exemple.fr;Nom${i}`);
  return Buffer.from(lignes.join('\n'), 'utf-8');
}

async function main() {
  console.log(`Import a la limite (${MAX_INVITES} emails valides) : accepte :`);
  const auxBords = await importInvitesFromBuffer(csvAvecNEmails(MAX_INVITES), 'invites.csv');
  check(auxBords.length === MAX_INVITES, `${MAX_INVITES} invites importes (recu ${auxBords.length})`);

  console.log(`Import au-dela de la limite (${MAX_INVITES + 1} emails valides) : refuse :`);
  let erreur = null;
  try {
    await importInvitesFromBuffer(csvAvecNEmails(MAX_INVITES + 1), 'invites.csv');
  } catch (err) {
    erreur = err;
  }
  check(erreur instanceof Error, 'une erreur est levee (pas un import partiel silencieux)');
  check(!!erreur && /trop volumineux/i.test(erreur.message), `message explicite (recu ${JSON.stringify(erreur && erreur.message)})`);

  console.log('Import ordinaire (3 emails) : comportement inchange :');
  const ordinaire = await importInvitesFromBuffer(Buffer.from('a@b.fr;A\nc@d.fr;C\ne@f.fr;E', 'utf-8'), 'invites.csv');
  check(ordinaire.length === 3, `3 invites importes (recu ${ordinaire.length})`);

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
