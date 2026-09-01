// Verrou du tout-ou-rien de enTransaction() (app/src/tx.js, nouveau le
// 2026-09-01). Trois routes ecrivent desormais plusieurs lignes qui n'ont de
// sens qu'ensemble (creation de session + perimetre, remplacement d'invites,
// enregistrement d'un pilier) : un echec au milieu doit rendre la base
// INTACTE, pas partiellement ecrite, et l'erreur doit remonter tel quel a
// l'appelant (aucune des routes ne doit avoir a la re-decorer). Ce test isole
// enTransaction() de toute route HTTP : base SQLite temporaire, table
// jetable, aucune dependance a express.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbFile = path.join(os.tmpdir(), `test-tx-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbFile;

const db = require('../src/db');
const { enTransaction } = require('../src/tx');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

db.exec('CREATE TABLE demo_tx (id INTEGER PRIMARY KEY, valeur TEXT)');

console.log('Cas nominal : plusieurs ecritures dans une transaction qui reussit :');
const rendu = enTransaction(() => {
  db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('a');
  db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('b');
  return 'valeur-de-retour';
});
check(rendu === 'valeur-de-retour', 'la valeur de retour de fn() traverse enTransaction()');
check(db.prepare('SELECT COUNT(*) AS n FROM demo_tx').get().n === 2, 'les 2 lignes sont bien commitees');

console.log("Cas d'echec : une ecriture qui jette au milieu ne laisse AUCUNE ligne :");
let erreurRecue = null;
try {
  enTransaction(() => {
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('c');
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('d');
    throw new Error('echec simule au milieu de la transaction');
  });
} catch (err) {
  erreurRecue = err;
}
check(
  erreurRecue !== null && erreurRecue.message === 'echec simule au milieu de la transaction',
  "l'erreur d'origine remonte telle quelle a l'appelant (pas de decoration, pas d'avalage)"
);
check(
  db.prepare('SELECT COUNT(*) AS n FROM demo_tx').get().n === 2,
  "aucune des 2 lignes de la transaction en echec n'est persistee (rollback integral, on reste a 2)"
);
check(!db.prepare("SELECT 1 FROM demo_tx WHERE valeur = 'c'").get(), "la ligne 'c' n'existe pas");
check(!db.prepare("SELECT 1 FROM demo_tx WHERE valeur = 'd'").get(), "la ligne 'd' n'existe pas");

console.log("Une transaction en echec ne bloque pas la suivante (ROLLBACK a bien libere la base) :");
enTransaction(() => {
  db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('e');
});
check(db.prepare('SELECT COUNT(*) AS n FROM demo_tx').get().n === 3, 'une transaction ulterieure ecrit normalement (recu 3 lignes)');

// Une `fn` asynchrone est le piege silencieux du helper : le COMMIT partirait
// avant le travail qui suit le premier `await`, et les ecritures suivantes
// tomberaient HORS transaction — validees definitivement, sans rollback possible
// et sans aucun signal. Le geste est naturel (deux des trois appelants sont des
// handlers `async`), donc il doit ECHOUER FORT plutot que mentir.
console.log("Une fonction asynchrone est refusee au lieu de rendre une garantie qui n'existe pas :");
let erreurAsync = null;
try {
  enTransaction(async () => {
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('async-1');
  });
} catch (err) {
  erreurAsync = err;
}
check(erreurAsync instanceof TypeError, `fn asynchrone -> TypeError (recu ${erreurAsync && erreurAsync.constructor.name})`);
check(
  db.prepare('SELECT COUNT(*) AS n FROM demo_tx').get().n === 3,
  'aucune ligne supplementaire apres le refus (recu ' + db.prepare('SELECT COUNT(*) AS n FROM demo_tx').get().n + ')'
);
check(
  (() => { try { enTransaction(() => db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('reprise')); return true; } catch { return false; } })(),
  'la base reste utilisable apres le refus (transaction bien annulee)'
);

console.log("Preuve rouge->vert : sans BEGIN/COMMIT/ROLLBACK, l'echec laisserait un etat partiel :");
// Copie NEUTRALISEE de tx.js dans un dossier temporaire (jamais dans le depot) :
// meme scenario, mais fn() est appele nu, sans transaction du tout. Si ce test
// passait aussi avec cette version, il ne verrouillerait rien.
const dossierCopie = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-neutralisee-'));
const fichierNeutralise = path.join(dossierCopie, 'tx-sans-transaction.js');
fs.writeFileSync(
  fichierNeutralise,
  "function enTransaction(fn) { return fn(); }\nmodule.exports = { enTransaction };\n"
);
const { enTransaction: enTransactionNeutralisee } = require(fichierNeutralise);
let erreurNeutralisee = null;
try {
  enTransactionNeutralisee(() => {
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('f');
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('g');
    throw new Error('echec simule, version neutralisee');
  });
} catch (err) {
  erreurNeutralisee = err;
}
check(erreurNeutralisee !== null, "la version neutralisee laisse aussi remonter l'erreur");
check(
  !!db.prepare("SELECT 1 FROM demo_tx WHERE valeur = 'f'").get() && !!db.prepare("SELECT 1 FROM demo_tx WHERE valeur = 'g'").get(),
  "MAIS sans transaction, 'f' et 'g' restent en base malgre l'echec : c'est exactement le defaut que enTransaction() corrige (preuve que le scenario ci-dessus est bien discriminant)"
);

fs.rmSync(dossierCopie, { recursive: true, force: true });
try { fs.rmSync(dbFile); } catch { /* nettoyage best-effort */ }

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
