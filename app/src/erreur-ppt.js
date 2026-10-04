// Corps de reponse JSON d'un echec de generation du PPT (route export-ppt).
// Le stderr de Python (chemins du serveur, pile d'appels) ne part JAMAIS au client :
// il est journalise cote serveur par l'appelant ; le client recoit un message fixe.
function corpsEchecPpt(err) {
  const expire = err.killed || err.signal === 'SIGTERM';
  return {
    error: expire ? 'La generation du PPT a depasse le delai de 2 minutes.' : 'Echec de la generation du PPT.',
  };
}

module.exports = { corpsEchecPpt };
