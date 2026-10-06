'use strict';

// Fusion des doublons residuels d'equipe/departement (US3.4bis), extraite de
// server.js (compromis D, 2026-10-06 : server.js monolithique). Comportement
// des routes inchange, sauf la liste blanche : elle est desormais testee en
// PROPRIETE PROPRE, car `CHAMPS_FUSIONNABLES['constructor']` (heritage
// d'Object.prototype) etait truthy et finissait en 500 au lieu de 400.
const express = require('express');

// Champs fusionnables : la valeur sert a construire un nom de colonne, donc on
// la restreint a une liste blanche pour eviter toute injection SQL.
const CHAMPS_FUSIONNABLES = Object.freeze({ departement: 'departement', equipe: 'equipe' });

function colonneFusionnable(champ) {
  // MUTANT: remplacer par `return CHAMPS_FUSIONNABLES[champ];` fait rougir test-fusion-champs.js
  return typeof champ === 'string' && Object.hasOwn(CHAMPS_FUSIONNABLES, champ)
    ? CHAMPS_FUSIONNABLES[champ]
    : undefined;
}

function routesFusion({ db, refuserSiImportEnCours }) {
  const router = express.Router();

  router.get('/api/repondants/valeurs/:champ', (req, res) => {
    const colonne = colonneFusionnable(req.params.champ);
    if (!colonne) return res.status(400).json({ error: 'Champ inconnu (departement ou equipe).' });
    const valeurs = db
      .prepare(`SELECT ${colonne} AS valeur, COUNT(*) AS n FROM repondants GROUP BY ${colonne} ORDER BY ${colonne}`)
      .all();
    res.json(valeurs);
  });

  router.post('/api/repondants/fusion', (req, res) => {
    if (refuserSiImportEnCours(res)) return;
    const { champ, source, cible } = req.body || {};
    const colonne = colonneFusionnable(champ);
    if (!colonne) return res.status(400).json({ error: 'Champ inconnu (departement ou equipe).' });
    if (!source || !cible || typeof source !== 'string' || typeof cible !== 'string') {
      return res.status(400).json({ error: 'source et cible sont requis.' });
    }
    if (source === cible) return res.status(400).json({ error: 'La source et la cible doivent etre differentes.' });
    // Reaffectation globale : un doublon peut s'etre glisse dans plusieurs sessions.
    const info = db.prepare(`UPDATE repondants SET ${colonne} = ? WHERE ${colonne} = ?`).run(cible, source);
    res.json({ ok: true, reaffectes: info.changes });
  });

  return router;
}

module.exports = { routesFusion, colonneFusionnable, CHAMPS_FUSIONNABLES };
