'use strict';

// Fusion des doublons residuels d'equipe/departement (US3.4bis), extraite de
// server.js (compromis D, 2026-10-06 : server.js monolithique). Comportement
// des routes inchange, sauf la liste blanche : elle est desormais testee en
// PROPRIETE PROPRE, car `CHAMPS_FUSIONNABLES['constructor']` (heritage
// d'Object.prototype) etait truthy et finissait en 500 au lieu de 400.
const express = require('express');
const { enTransaction } = require('./tx');

// Champs fusionnables : la valeur sert a construire un nom de colonne, donc on
// la restreint a une liste blanche pour eviter toute injection SQL.
const CHAMPS_FUSIONNABLES = Object.freeze({ departement: 'departement', equipe: 'equipe' });

// Meme valeur que LONGUEUR_MAX_COMMENTAIRE de server.js (~l.805), dupliquee pour ne
// pas importer server.js : a garder synchronisee.
const LONGUEUR_MAX_COMMENTAIRE = 5000;

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
    const { champ, source: sourceBrute, cible: cibleBrute } = req.body || {};
    const colonne = colonneFusionnable(champ);
    if (!colonne) return res.status(400).json({ error: 'Champ inconnu (departement ou equipe).' });
    if (typeof sourceBrute !== 'string' || typeof cibleBrute !== 'string') {
      return res.status(400).json({ error: 'source et cible sont requis.' });
    }
    const source = sourceBrute.trim();
    const cible = cibleBrute.trim();
    if (!source || !cible) return res.status(400).json({ error: 'source et cible sont requis.' });
    if (source === cible) return res.status(400).json({ error: 'La source et la cible doivent etre differentes.' });
    // Reaffectation GLOBALE (toutes sessions, voulu : un doublon peut s'etre glisse
    // dans plusieurs sessions) sur les valeurs trimees. Source inconnue -> 404 (decide
    // par SELECT, pas par info.changes). Pour champ=equipe, les commentaires de
    // restitution (PK session_id+equipe) suivent dans la MEME transaction : cible
    // sans commentaire -> il passe sur la cible ; collision -> concatenation
    // cible + source, refusee en 409 (rollback complet) si > LONGUEUR_MAX_COMMENTAIRE.
    // departement : commentaires intacts.
    // Une equipe sans repondant mais avec un commentaire reste fusionnable (sinon
    // son commentaire resterait orphelin).
    const existe = db.prepare(`SELECT 1 FROM repondants WHERE ${colonne} = ? LIMIT 1`).get(source)
      || (colonne === 'equipe' && db.prepare('SELECT 1 FROM commentaires WHERE equipe = ? LIMIT 1').get(source));
    if (!existe) return res.status(404).json({ error: 'Valeur source introuvable.' });
    const depasse = new Error('depassement');
    const fusionner = () => enTransaction(() => {
      const info = db.prepare(`UPDATE repondants SET ${colonne} = ? WHERE ${colonne} = ?`).run(cible, source);
      let commentairesFusionnes = 0;
      if (colonne === 'equipe') {
        const lus = db.prepare('SELECT session_id, texte FROM commentaires WHERE equipe = ?').all(source);
        for (const c of lus) {
          const dest = db
            .prepare('SELECT texte FROM commentaires WHERE session_id = ? AND equipe = ?')
            .get(c.session_id, cible);
          if (!dest) {
            db.prepare('UPDATE commentaires SET equipe = ? WHERE session_id = ? AND equipe = ?')
              .run(cible, c.session_id, source);
          } else {
            const texte = `${dest.texte}\n\n${c.texte}`;
            if (texte.length > LONGUEUR_MAX_COMMENTAIRE) throw depasse;
            db.prepare('UPDATE commentaires SET texte = ?, updated_at = ? WHERE session_id = ? AND equipe = ?')
              .run(texte, new Date().toISOString(), c.session_id, cible);
            db.prepare('DELETE FROM commentaires WHERE session_id = ? AND equipe = ?').run(c.session_id, source);
          }
          commentairesFusionnes += 1;
        }
      }
      return { reaffectes: info.changes, commentairesFusionnes };
    });
    try {
      const r = fusionner();
      res.json({ ok: true, reaffectes: r.reaffectes, commentairesFusionnes: r.commentairesFusionnes });
    } catch (e) {
      if (e !== depasse) throw e;
      res.status(409).json({
        error: `Fusion refusee : les commentaires fusionnes depasseraient ${LONGUEUR_MAX_COMMENTAIRE} caracteres. Rien n'a ete modifie.`,
      });
    }
  });

  return router;
}

module.exports = { routesFusion, colonneFusionnable, CHAMPS_FUSIONNABLES };
