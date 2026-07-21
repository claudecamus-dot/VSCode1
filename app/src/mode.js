// Mode courant de l'outil (page d'accueil demo / reel), lu depuis le cookie `mode`
// pose par index.html. 'demo' => on ne voit et ne cree que des sessions fictives
// (est_demo=1) ; toute autre valeur, dont l'absence de cookie => mode reel (est_demo=0).
// Extrait ici (plutot qu'inline dans server.js) pour etre testable unitairement, comme
// normalisation.js / session-utils.js.
function estModeDemo(cookieHeader) {
  const m = /(?:^|;\s*)mode=([^;]+)/.exec(cookieHeader || '');
  return m ? decodeURIComponent(m[1]) === 'demo' : false;
}

module.exports = { estModeDemo };
