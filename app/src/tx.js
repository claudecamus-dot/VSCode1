const db = require('./db');

// Execute `fn` dans une transaction SQLite : tout ou rien.
//
// A utiliser des qu'une route ecrit PLUSIEURS lignes qui n'ont de sens
// qu'ensemble — un echec au milieu laissait sinon un etat partiel qu'aucun
// appelant ne pouvait detecter (audit du 2026-09-01 : reponses d'un pilier
// persistees avant le 400 qui rejette la suivante, liste d'invites detruite
// avant d'etre reecrite, session creee sans son perimetre).
//
// SQLite ne connait pas les transactions imbriquees : un `BEGIN` a l'interieur
// d'un autre echoue. Ne pas appeler `enTransaction` depuis une fonction deja
// appelee dans une transaction (referentiel.js gere les siennes en direct, avec
// la meme forme BEGIN / COMMIT / ROLLBACK).
function enTransaction(fn) {
  db.exec('BEGIN');
  try {
    const resultat = fn();
    // `fn` ASYNCHRONE : le COMMIT partirait ici, avant le travail qui suit le
    // premier `await`, et les ecritures suivantes tomberaient HORS transaction —
    // definitivement validees, sans rollback possible, sans le moindre signal.
    // Le geste est naturel (deux des appelants sont des handlers `async`) : on le
    // refuse explicitement plutot que de rendre une garantie qui n'existe pas.
    if (resultat && typeof resultat.then === 'function') {
      db.exec('ROLLBACK');
      throw new TypeError("enTransaction n'accepte pas de fonction asynchrone : le COMMIT partirait avant le travail.");
    }
    db.exec('COMMIT');
    return resultat;
  } catch (err) {
    // SQLite annule LUI-MEME la transaction sur les erreurs les plus graves
    // (disque plein, erreur d'E/S) : le ROLLBACK leve alors « cannot rollback -
    // no transaction is active » et, non protege, cette erreur-la REMPLACAIT la
    // cause reelle. On perdait le diagnostic exactement dans le cas ou il compte.
    try {
      db.exec('ROLLBACK');
    } catch (errRollback) {
      if (err instanceof Error && err.cause === undefined) err.cause = errRollback;
    }
    throw err;
  }
}

module.exports = { enTransaction };
