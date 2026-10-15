// Classement et journalisation des erreurs du filet terminal (server.js).
// Fonctions PURES : aucune ecriture, aucun acces base, testables seules.
//
// node:sqlite ne pose PAS err.code = 'SQLITE_BUSY' : mesure du 2026-10-14 (second
// DatabaseSync en BEGIN EXCLUSIVE, ecriture avec timeout court) -> code
// 'ERR_SQLITE_ERROR', errcode 5, errstr 'database is locked'. Une violation
// d'unicite donne errcode 2067 (code etendu). Le code PRIMAIRE est les 8 bits bas.

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_IOERR = 10;
const SQLITE_FULL = 13;
const CODES_TRANSITOIRES = new Set([SQLITE_BUSY, SQLITE_LOCKED]); // reessayer a un sens
const CODES_INDISPONIBLES = new Set([SQLITE_IOERR, SQLITE_FULL]); // disque : l'exploitant doit intervenir

const RETRY_AFTER_S = 5;

function codePrimaireSqlite(err) {
  if (!err || err.code !== 'ERR_SQLITE_ERROR' || !Number.isInteger(err.errcode)) return null;
  return err.errcode & 0xff;
}

// -> { statut, message, retryAfter? }
function classerErreur(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return { statut: 413, message: 'Fichier trop volumineux (10 Mo maximum).' };
  }
  // Erreur CLIENTE qui porte deja son statut (body-parser : 413 et 400 `expose`).
  // On ne relaie QUE des 4xx explicitement exposables.
  if (err && err.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return {
      statut: err.status,
      message: err.status === 413 ? 'Corps de requete trop volumineux.' : 'Corps de requete illisible (JSON attendu).',
    };
  }
  const primaire = codePrimaireSqlite(err);
  if (primaire !== null && CODES_TRANSITOIRES.has(primaire)) {
    return {
      statut: 503,
      message: 'Base de donnees momentanement indisponible, reessayez dans quelques instants.',
      retryAfter: RETRY_AFTER_S,
    };
  }
  if (primaire !== null && CODES_INDISPONIBLES.has(primaire)) {
    // Pas de Retry-After : un disque plein ou une erreur d'E/S ne se resout pas en quelques secondes.
    return { statut: 503, message: "Base de donnees indisponible. Prevenez l'exploitant." };
  }
  return { statut: 500, message: "Erreur interne du serveur. Si elle persiste, prevenez l'exploitant." };
}

// Ligne de journal SANS donnee nominative : ni query string (peut porter equipe,
// email...), ni err.message (le message SQLite d'une violation d'unicite cite la
// colonne, et la pile peut embarquer des valeurs). Seulement : methode, chemin,
// nom et code de l'erreur.
function ligneJournal(req, err) {
  const chemin = (req && typeof req.path === 'string' ? req.path : '?');
  const nom = err && err.name ? err.name : typeof err;
  const code = err && err.code !== undefined ? err.code : '-';
  const detail = err && err.errcode !== undefined ? ` errcode=${err.errcode}` : '';
  return `[erreur non geree] ${req && req.method ? req.method : '?'} ${chemin} ${nom} code=${code}${detail}`;
}

// Resume d'une sortie d'erreur Python SANS donnee nominative : seul le TYPE de l'exception
// (ex. « TypeError ») est conserve. Une trace python-pptx ou un KeyError peut citer des
// valeurs du payload (equipe, departement, commentaire) : on ne journalise jamais le texte.
function resumeSortiePython(texte) {
  const lignes = String(texte || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // La derniere ligne qui commence par un TYPE d'exception (...Error, ...Exception) : en Python c'est la
  // derniere ligne de la trace ; d'autres interpreteurs ajoutent une ligne de version apres.
  for (let k = lignes.length - 1; k >= 0; k -= 1) {
    const m = /^([A-Za-z_][\w.]{0,60}(?:Error|Exception|Exit|Interrupt))(?:\s*:|$)/.exec(lignes[k]);
    if (m) return m[1];
  }
  return 'sortie-non-identifiee';
}

module.exports = { classerErreur, ligneJournal, resumeSortiePython, RETRY_AFTER_S };
