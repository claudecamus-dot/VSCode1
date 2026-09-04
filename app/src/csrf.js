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
// lecture, hors perimetre CSRF. Fail-open sur Origin/Referer ABSENTS : un
// navigateur envoie systematiquement Origin sur les methodes mutantes (meme
// requete same-origin, standard Fetch depuis plusieurs annees) — son absence
// signale un client non-navigateur (curl, script, test), pas une attaque :
// celui-ci n'a de toute façon aucun cache de credentials a rejouer malgre lui.

const METHODES_MUTANTES = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function memeOrigine(req) {
  const hote = req.headers.host;
  const source = req.headers.origin || req.headers.referer;
  if (!hote || !source) return true;
  try {
    return new URL(source).host === hote;
  } catch {
    // Origin/Referer illisible : plus prudent de refuser que de laisser passer.
    return false;
  }
}

function verifierOrigine(req, res, next) {
  if (!METHODES_MUTANTES.has(req.method) || memeOrigine(req)) return next();
  res.status(403).json({ error: 'Origine non autorisee (protection CSRF).' });
}

module.exports = { verifierOrigine, memeOrigine };
