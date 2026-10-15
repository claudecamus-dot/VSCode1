// Prechargement de TEST (node --require), jamais utilise en production : permet a
// un test de provoquer, sur le VRAI serveur lance en processus enfant, deux etats
// qu'on ne sait pas armer de facon deterministe de l'exterieur. Aucune ligne de
// src/ n'a de crochet de test : tout vit ici, et ne s'active que si le test le demande.
//   PRELOAD_FORCER_IMPORT=1      -> estImportRemplacerEnCours() rend true (verrou d'import arme)
//   PRELOAD_FERMER_BASE=<chemin> -> des que ce fichier existe, la base du serveur est fermee
const fs = require('node:fs');
const path = require('node:path');

if (process.env.PRELOAD_FORCER_IMPORT === '1') {
  // Meme fichier resolu que celui de server.js -> meme objet exports, patche
  // avant que server.js ne le destructure.
  const referentiel = require(path.join(__dirname, '..', 'src', 'referentiel.js'));
  referentiel.estImportRemplacerEnCours = () => true;
}
if (process.env.PRELOAD_FERMER_BASE) {
  const drapeau = process.env.PRELOAD_FERMER_BASE;
  const minuteur = setInterval(() => {
    if (!fs.existsSync(drapeau)) return;
    clearInterval(minuteur);
    require(path.join(__dirname, '..', 'src', 'db.js')).close();
  }, 50);
  minuteur.unref();
}
