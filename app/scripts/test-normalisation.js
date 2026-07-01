// Test de la saisie tolerante (US3.3) : normalisation casse/accents/espaces,
// sans fusion des libelles reellement distincts.
const { cleNormalisee, valeurCanonique } = require('../src/normalisation');

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}

console.log('cleNormalisee :');
check(cleNormalisee('Équipe Alpha') === cleNormalisee('equipe alpha'), 'casse + accents identiques');
check(cleNormalisee('  Équipe   Alpha ') === 'equipe alpha', 'espaces externes/internes reduits');
check(cleNormalisee('Crédit Agricole') === 'credit agricole', 'accents retires');
check(cleNormalisee('Team A1') !== cleNormalisee('Team A2'), 'libelles distincts -> cles distinctes');

console.log('valeurCanonique :');
// Aucune valeur connue -> on garde la saisie nettoyee.
check(valeurCanonique([], '  Nouvelle   Equipe ') === 'Nouvelle Equipe', 'valeur inconnue : saisie nettoyee');

// Variante casse/accents/espaces -> rattachee a l'orthographe connue.
const connues = [{ valeur: 'Équipe Alpha', n: 3 }, { valeur: 'Équipe Beta', n: 1 }];
check(valeurCanonique(connues, 'equipe alpha') === 'Équipe Alpha', 'rattachement a la valeur canonique connue');
check(valeurCanonique(connues, '  ÉQUIPE   ALPHA  ') === 'Équipe Alpha', 'rattachement malgre casse/espaces');

// Tie-break : la plus frequente l'emporte.
const ambigues = [{ valeur: 'equipe alpha', n: 1 }, { valeur: 'Équipe Alpha', n: 5 }];
check(valeurCanonique(ambigues, 'Equipe Alpha') === 'Équipe Alpha', 'la plus frequente est choisie');

// Tie-break a frequence egale : ordre alphabetique, deterministe.
const egales = [{ valeur: 'Equipe B', n: 2 }, { valeur: 'Equipe A', n: 2 }];
check(valeurCanonique(egales.map(e => ({ ...e })), 'EQUIPE A') === 'Equipe A', 'tie-break alphabetique a frequence egale');

// Faute de frappe reelle -> NON fusionnee (nouvelle valeur conservee).
check(valeurCanonique(connues, 'Equpe Alpha') === 'Equpe Alpha', 'faute de frappe non fusionnee (reste distincte)');

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
