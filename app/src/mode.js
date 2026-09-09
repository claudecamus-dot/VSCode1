// Mode courant de l'outil (page d'accueil demo / reel), lu depuis le cookie `mode`
// pose par index.html. 'demo' => on ne voit et ne cree que des sessions fictives
// (est_demo=1) ; toute autre valeur, dont l'absence de cookie => mode reel (est_demo=0).
// Extrait ici (plutot qu'inline dans server.js) pour etre testable unitairement, comme
// normalisation.js / session-utils.js.
function estModeDemo(cookieHeader) {
  const m = /(?:^|;\s*)mode=([^;]+)/.exec(cookieHeader || '');
  if (!m) return false;
  // decodeURIComponent LEVE (URIError: URI malformed) sur une sequence
  // pourcent invalide -- `mode=%`, `mode=%zz`, `mode=100%` -- c'est-a-dire sur
  // une valeur que n'importe quel client pose lui-meme. Les deux appelants
  // (server.js : liste des sessions et creation de session) sont SYNCHRONES :
  // la levee partait au filet terminal et rendait 500 pour un cookie
  // simplement abime (audit-technique 2026-09-09, mesure par execution). Un
  // cookie illisible n'est pas 'demo' : on retombe sur le mode par defaut
  // (reel), exactement comme pour un cookie absent -- le defaut SUR, qui ne
  // montre jamais des donnees fictives comme reelles ni l'inverse.
  // Le decodage lui-meme est CONSERVE (`mode=%64emo` vaut bien 'demo') :
  // le supprimer serait un autre bug, pas un correctif.
  try {
    return decodeURIComponent(m[1]) === 'demo';
  } catch {
    return false;
  }
}

module.exports = { estModeDemo };
