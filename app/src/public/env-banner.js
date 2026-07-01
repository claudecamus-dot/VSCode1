// Bandeau d'environnement (US9.5). Fine bande en haut pour les environnements
// hors PROD (DEV, PRE-PROD) ; rien en PROD ni si APP_ENV absent. L'environnement
// est lu via GET /api/env (alimente par la variable APP_ENV cote serveur).
(function () {
  fetch('/api/env')
    .then((r) => r.json())
    .then(({ env }) => {
      if (!env) return;
      const e = String(env).toUpperCase();
      if (e === 'PROD') return; // pas de bandeau en production
      const couleurs = { DEV: '#2c5cc5', 'PRE-PROD': '#b8860b' };
      const bar = document.createElement('div');
      bar.textContent = 'ENVIRONNEMENT : ' + e;
      bar.style.cssText =
        'background:' + (couleurs[e] || '#6b7280') + ';color:#fff;text-align:center;' +
        'font:600 12px/1.7 system-ui,Arial,sans-serif;letter-spacing:.05em;' +
        'padding:2px 8px;position:sticky;top:0;z-index:99999';
      document.body.insertBefore(bar, document.body.firstChild);
    })
    .catch(() => {});
})();
