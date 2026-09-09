// Bandeaux en haut de page : (1) mode "demo" (donnees fictives) lu depuis le cookie
// `mode` pose par la page d'accueil ; (2) environnement hors PROD (US9.5), lu via
// GET /api/env (variable APP_ENV cote serveur). Rien de tout ca en PROD + mode reel.
(function () {
  function bandeau(texte, fond, couleurTexte, html) {
    const bar = document.createElement('div');
    if (html) bar.innerHTML = texte; else bar.textContent = texte;
    bar.style.cssText =
      'background:' + fond + ';color:' + couleurTexte + ';text-align:center;' +
      'font:600 12px/1.7 system-ui,Arial,sans-serif;letter-spacing:.05em;' +
      'padding:2px 8px;position:sticky;top:0;z-index:99999';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  // (1) Mode demo : rappelle qu'on manipule des donnees fictives, avec un lien pour
  // changer de mode (retour a la page d'accueil). Texte fonce sur cyan (contraste AA).
  // Meme garde que src/mode.js cote serveur, pour la meme raison : un cookie
  // `mode` malforme (`mode=%`) fait lever decodeURIComponent. Ici la levee est
  // dans une IIFE qui s'execute sur TOUTES les pages : elle emportait aussi le
  // bandeau d'environnement (2) plus bas, jamais atteint. Trouve en passe
  // adversariale du correctif serveur (audit-technique 2026-09-09) : la garde
  // posee dans mode.js ne valait rien tant que le meme decodage restait nu sur
  // l'autre chemin de lecture du meme cookie.
  const m = /(?:^|;\s*)mode=([^;]+)/.exec(document.cookie || '');
  let modeCourant = null;
  if (m) {
    try {
      modeCourant = decodeURIComponent(m[1]);
    } catch {
      modeCourant = null; // cookie illisible = mode par defaut (reel), pas de bandeau
    }
  }
  if (modeCourant === 'demo') {
    bandeau(
      'MODE DÉMO — données fictives · <a href="/" style="color:inherit;text-decoration:underline">changer de mode</a>',
      '#00a3e0', '#14233b', true
    );
  }

  // (2) Environnement (DEV / PRE-PROD) : fine bande, rien en PROD ni si APP_ENV absent.
  fetch('/api/env')
    .then((r) => r.json())
    .then(({ env }) => {
      if (!env) return;
      const e = String(env).toUpperCase();
      if (e === 'PROD') return; // pas de bandeau en production
      const couleurs = { DEV: '#2c5cc5', 'PRE-PROD': '#b8860b' };
      bandeau('ENVIRONNEMENT : ' + e, couleurs[e] || '#6b7280', '#fff', false);
    })
    .catch(() => {});
})();
