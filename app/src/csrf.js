'use strict';

// Verification d'origine anti-CSRF (finding audit-technique securite:critique,
// 2026-09-04, cible POST /api/referentiel/import).
//
// La barriere Basic Auth (auth.js) protege l'authentification, mais PAS le
// CSRF : un navigateur rejoue les identifiants Basic mis en cache sur TOUTE
// requete vers l'origine, y compris depuis une page tierce ouverte ailleurs.
// Une requete multipart (mode=remplacer sur /api/referentiel/import, par ex.)
// est une "simple request" au sens CORS : aucun preflight, donc aucune
// verification de navigateur ne l'empeche de partir. Sans controle d'Origin,
// une page web quelconque peut declencher une purge irreversible de toutes
// les donnees collectees, avec ou sans Basic Auth active.
//
// Verifie sur les methodes qui MUTENT (POST/PUT/DELETE/PATCH) ; GET reste en
// lecture, hors perimetre CSRF. FAIL-CLOSED sur Origin/Referer ABSENTS (durci
// le 2026-09-04, arbitrage utilisateur — revue adversariale du correctif
// initial) : un navigateur envoie normalement Origin sur les methodes
// mutantes, mais un proxy d'entreprise ou une extension de confidentialite
// peut le retirer sur un VRAI navigateur avec des identifiants Basic Auth en
// cache — exactement le vecteur CSRF que ce module existe pour fermer. Un
// client non-navigateur legitime (curl, script interne) doit envoyer Origin
// explicitement s'il appelle une route mutante ; le cout assume est de
// bloquer les rares navigateurs qui strippent les deux en-tetes.

const METHODES_MUTANTES = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function memeOrigine(req) {
  const hote = req.headers.host;
  const source = req.headers.origin || req.headers.referer;
  try {
    // new URL(undefined) leve (Origin/Referer absents) -> capte par le catch,
    // meme chemin fail-closed qu'une valeur illisible.
    return new URL(source).host === hote;
  } catch {
    return false;
  }
}

function verifierOrigine(req, res, next) {
  if (!METHODES_MUTANTES.has(req.method) || memeOrigine(req)) return next();
  res.status(403).json({ error: 'Origine non autorisee (protection CSRF).' });
}

module.exports = { verifierOrigine, memeOrigine };
