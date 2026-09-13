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

// --- Le MEME ROLLBACK protege sur les 2 transactions en direct de referentiel.js ---
//
// referentiel.js ne passe pas par enTransaction() (SQLite ne connait pas les
// transactions imbriquees, et remplacerTout rejoue la reconciliation dans sa
// propre transaction englobante) : il ouvre BEGIN / COMMIT / ROLLBACK a la main.
// Ses deux catch faisaient un `db.exec('ROLLBACK')` NU (audit-technique
// 2026-09-09) : quand SQLite a deja annule la transaction lui-meme, ce ROLLBACK
// leve « cannot rollback - no transaction is active » et cette erreur-la
// REMPLACE la cause reelle -- sur les deux gestes les plus destructifs du
// produit (reconciliation d'import, remplacement total). Ils partagent
// desormais annulerTransaction() avec tx.js.
const { reconcileReferentiel, remplacerTout } = require('../src/referentiel');

// Simule le cas reel : SQLite a deja annule la transaction, donc le ROLLBACK
// leve. On remplace db.exec le temps de l'appel (propriete propre qui masque la
// methode du prototype, exactement le chemin qu'emprunte referentiel.js), puis
// on ferme la transaction restee ouverte pour de vrai.
function avecRollbackQuiEchoue(fn) {
  const execOriginal = db.exec.bind(db);
  let rollbacksInterceptes = 0;
  db.exec = (sql) => {
    if (/ROLLBACK/i.test(sql)) {
      rollbacksInterceptes += 1;
      throw new Error('cannot rollback - no transaction is active');
    }
    return execOriginal(sql);
  };
  let erreur = null;
  try {
    fn();
  } catch (err) {
    erreur = err;
  } finally {
    delete db.exec;
    // Le ROLLBACK ayant ete intercepte, la transaction est restee OUVERTE :
    // sans cette fermeture, le BEGIN du cas suivant echouerait.
    try { db.exec('ROLLBACK'); } catch { /* deja fermee */ }
  }
  return { erreur, rollbacksInterceptes };
}

for (const [nom, appel] of [
  ['reconcileReferentiel', () => reconcileReferentiel(null)],
  ['remplacerTout', () => remplacerTout(null)],
]) {
  console.log(`\n${nom}() : un ROLLBACK qui echoue n'ecrase plus la cause reelle :`);
  const { erreur, rollbacksInterceptes } = avecRollbackQuiEchoue(appel);
  check(rollbacksInterceptes === 1, `le ROLLBACK a bien ete tente et intercepte (${rollbacksInterceptes})`);
  check(
    erreur instanceof TypeError,
    `la cause REELLE remonte a l'appelant (recu ${erreur && erreur.constructor.name} : ${erreur && erreur.message})`
  );
  check(
    !!erreur && !/cannot rollback/i.test(String(erreur.message)),
    "ce n'est PAS l'echec du ROLLBACK qui remonte a sa place (c'etait le defaut)"
  );
  check(
    !!erreur && erreur.cause instanceof Error && /cannot rollback/i.test(erreur.cause.message),
    "l'echec du ROLLBACK est conserve en `cause`, pas perdu (recu " + (erreur && erreur.cause && erreur.cause.message) + ')'
  );
}

console.log('\nNon-regression : quand le ROLLBACK REUSSIT, rien ne s\'attache a l\'erreur :');
let erreurNominale = null;
try {
  reconcileReferentiel(null);
} catch (err) {
  erreurNominale = err;
}
check(erreurNominale instanceof TypeError, "la cause reelle remonte telle quelle (recu " + (erreurNominale && erreurNominale.constructor.name) + ')');
check(erreurNominale && erreurNominale.cause === undefined, 'aucune `cause` parasite quand le ROLLBACK a fonctionne');
check(
  (() => { try { enTransaction(() => db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('apres-referentiel')); return true; } catch { return false; } })(),
  'la base reste utilisable apres ces trois annulations (aucune transaction laissee ouverte)'
);

// --- Le dernier ROLLBACK NU du module etait dans le module lui-meme -----------
//
// Audit-technique du 2026-09-13 : tx.js interdit le `db.exec('ROLLBACK')` nu a
// referentiel.js (bloc ci-dessus) mais en gardait un, sur le refus de `fn`
// asynchrone. S'il levait -- le cas que le module documente lui-meme : SQLite a
// deja annule seul -- l'exception partait dans le catch, annulerTransaction
// retentait un ROLLBACK, et c'est l'erreur SQLite qui etait relancee : le
// TypeError explicatif, SEULE raison d'etre de la garde, etait perdu. Le
// developpeur recevait « cannot rollback » pour un `async` oublie.
console.log('\nfn asynchrone ET ROLLBACK qui echoue : le TypeError explicatif ne doit pas etre perdu :');
const asyncRollbackKo = avecRollbackQuiEchoue(() => {
  enTransaction(async () => {
    db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('async-rollback-ko');
  });
});
check(
  asyncRollbackKo.erreur instanceof TypeError,
  `AVANT LE CORRECTIF : l'erreur SQLite du ROLLBACK remontait a sa place (recu ${asyncRollbackKo.erreur && asyncRollbackKo.erreur.constructor.name} : ${asyncRollbackKo.erreur && asyncRollbackKo.erreur.message})`
);
check(
  !!asyncRollbackKo.erreur && /asynchrone/i.test(String(asyncRollbackKo.erreur.message)),
  "le message explique bien le vrai probleme (fn asynchrone), pas l'echec du rollback"
);
check(
  !!asyncRollbackKo.erreur && asyncRollbackKo.erreur.cause instanceof Error && /cannot rollback/i.test(asyncRollbackKo.erreur.cause.message),
  "l'echec du ROLLBACK est conserve en `cause`, pas perdu"
);
check(
  asyncRollbackKo.rollbacksInterceptes === 1,
  `un SEUL ROLLBACK tente, par annulerTransaction (le nu en faisait 2) -- recu ${asyncRollbackKo.rollbacksInterceptes}`
);

// Voisin de la meme ligne : un `throw 'chaine'` (un handler Express peut en
// produire) n'est pas une Error, donc rien ne pouvait porter la `cause` : l'echec
// du ROLLBACK etait TOTALEMENT avale -- ni log, ni cause, ni relance.
console.log("Cause d'origine non-Error : l'echec du ROLLBACK est au moins JOURNALISE, plus avale :");
const erreurOriginale = console.error;
const journal = [];
console.error = (...args) => { journal.push(args.map(String).join(' ')); };
let erreurChaine;
try {
  const r = avecRollbackQuiEchoue(() => {
    enTransaction(() => { throw 'echec simule non-Error'; });
  });
  erreurChaine = r.erreur;
} finally {
  console.error = erreurOriginale;
}
check(erreurChaine === 'echec simule non-Error', `la cause d'origine remonte telle quelle (recu ${JSON.stringify(erreurChaine)})`);
check(
  journal.some((l) => /cannot rollback/i.test(l)),
  `AVANT LE CORRECTIF : l'echec du ROLLBACK disparaissait sans trace (journal : ${JSON.stringify(journal)})`
);

check(
  (() => { try { enTransaction(() => db.prepare('INSERT INTO demo_tx (valeur) VALUES (?)').run('apres-async')); return true; } catch { return false; } })(),
  'la base reste utilisable apres ces deux annulations supplementaires'
);

fs.rmSync(dossierCopie, { recursive: true, force: true });
try { fs.rmSync(dbFile); } catch { /* nettoyage best-effort */ }

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
