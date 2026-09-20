'use strict';

// Limite de debit en memoire (audit securite du 2026-09-19, finding « aucun
// rate-limit nulle part », ASI05 en amplification de ASI06).
//
// Ce qu'on borne : `POST /api/sessions/:id/repondants` est ouverte a quiconque
// detient un lien de session (liste blanche du parcours repondant, auth.js) et
// distingue « email deja vu » (409) de « email inconnu » (201). C'est donc un
// oracle de participation NOMINATIVE, jusqu'ici interrogeable a debit machine :
// l'enumeration d'un annuaire d'entreprise etait possible. Le libelle du 409
// est un choix produit documente (server.js) qu'on ne change PAS ici ; on
// supprime l'interrogation EN MASSE, qui est ce qui transforme cet oracle en
// fuite d'annuaire.
//
// En memoire, par processus : suffisant pour un serveur mono-processus (c'est
// le deploiement reel de cette application) et sans nouvelle dependance. Un
// deploiement multi-instances exigerait un compteur partage.

const FENETRE_MS_DEFAUT = 60_000;
const MAX_DEFAUT = 10;

function limiteDebit({
  fenetreMs = Number(process.env.DEBIT_FENETRE_MS) || FENETRE_MS_DEFAUT,
  max = Number(process.env.DEBIT_MAX) || MAX_DEFAUT,
  cle = (req) => `${req.ip}|${req.params.id || ''}`,
} = {}) {
  const compteurs = new Map();

  return function middlewareDebit(req, res, next) {
    const maintenant = Date.now();
    const k = cle(req);
    // Purge paresseuse : evite une croissance non bornee de la Map (le
    // limiteur lui-meme ne doit pas devenir le vecteur d'epuisement memoire).
    for (const [autre, seau] of compteurs) {
      if (maintenant - seau.debut > fenetreMs) compteurs.delete(autre);
    }
    let seau = compteurs.get(k);
    if (!seau || maintenant - seau.debut > fenetreMs) {
      seau = { debut: maintenant, n: 0 };
      compteurs.set(k, seau);
    }
    seau.n += 1;
    if (seau.n > max) {
      const resteS = Math.max(1, Math.ceil((fenetreMs - (maintenant - seau.debut)) / 1000));
      res.set('Retry-After', String(resteS));
      // Message volontairement neutre : il ne doit rien dire de l'existence
      // (ou non) de l'email soumis.
      return res.status(429).json({ error: 'Trop de tentatives, reessayez dans quelques instants.' });
    }
    return next();
  };
}

module.exports = { limiteDebit, FENETRE_MS_DEFAUT, MAX_DEFAUT };
