'use strict';

// Barriere d'acces INTERIMAIRE (HTTP Basic Auth) sur la surface animateur / PII.
//
// Contexte : l'API expose des donnees nominatives (nom/prenom/email) et des
// fonctions d'administration (creation/suppression/fusion de repondants, export)
// sans aucune authentification (finding securite de l'audit du 2026-07-24).
// L'Epic 10 (US10.1-10.6) reste le chantier de fond ; cette barriere est une
// mesure provisoire, arbitree par l'utilisateur (cible « securite:VSCode1-api-pii »,
// option A « Basic Auth »), a retirer quand l'Epic 10 est livre.
//
// Deux principes :
//   1. ENV-GATED : la barriere n'est active que si AUTH_USER *et* AUTH_PASS sont
//      poses dans l'environnement. Sans eux, le middleware est un no-op — le
//      comportement (dev, CI, tests) est strictement inchange, et l'exploitant
//      active la protection en production en posant les deux variables.
//   2. FAIL-CLOSED sur la PII, mais parcours REPONDANT ouvert (US10.5) : quand la
//      barriere est active, TOUT est protege PAR DEFAUT (si on oublie une route
//      sensible, elle est fermee, pas ouverte) SAUF une liste blanche explicite
//      des routes et pages du parcours repondant, qui doit rester accessible par
//      simple lien de session, sans compte.

const crypto = require('node:crypto');

// Comparaison a temps constant (evite une fuite par timing sur la longueur ou le
// contenu). On hache les deux cotes en SHA-256 pour comparer des buffers de
// meme longueur.
function egaliteConstante(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Liste blanche du parcours REPONDANT (reste ouvert meme barriere active — US10.5).
// Chaque entree = methode + expression sur req.path (sans query string).
// Le `$` de fin est essentiel : il empeche p.ex. `/api/sessions/:id` d'ouvrir
// aussi `/api/sessions/:id/resultats`.
const ROUTES_REPONDANT = [
  { m: 'GET', re: /^\/api\/env$/ },
  { m: 'GET', re: /^\/api\/texte-intro-defaut$/ },
  { m: 'GET', re: /^\/api\/roles$/ }, // le repondant choisit son role ; POST/DELETE restent proteges
  { m: 'GET', re: /^\/api\/departements$/ },
  { m: 'GET', re: /^\/api\/equipes$/ },
  { m: 'GET', re: /^\/api\/sessions\/[^/]+$/ }, // meta d'UNE session (pas la collection /api/sessions)
  { m: 'GET', re: /^\/api\/sessions\/[^/]+\/referentiel$/ },
  { m: 'POST', re: /^\/api\/sessions\/[^/]+\/repondants$/ }, // le repondant s'auto-enregistre (son nom/email)
  // Le repondant lit/ecrit SON propre enregistrement. On exclut explicitement
  // `valeurs` et `fusion` qui sont des routes d'administration (PII en masse).
  { m: 'GET', re: /^\/api\/repondants\/(?!valeurs$|fusion$)[^/]+$/ },
  { m: 'PUT', re: /^\/api\/repondants\/[^/]+\/piliers\/[^/]+\/reponses$/ },
  { m: 'POST', re: /^\/api\/repondants\/[^/]+\/soumission$/ },
];

// Pages statiques ouvertes (le reste du parcours repondant + l'accueil).
// Les pages animateur (admin/pilotage/resultats) NE sont PAS ici : les proteger
// declenche l'invite Basic du navigateur a l'ouverture de la page, ce qui met
// ensuite les identifiants en cache pour les appels fetch de meme origine.
const PAGES_OUVERTES = new Set([
  '/',
  '/index.html',
  '/repondre.html',
  '/maquette-question.html',
  '/env-banner.js',
  '/favicon.ico',
]);

function estRepondant(method, pathname) {
  if (PAGES_OUVERTES.has(pathname)) return true;
  // Ressources statiques non-.html (css/js/images) : ouvertes — elles ne
  // portent pas de PII, seul l'/api en porte. Les pages .html animateur sont
  // traitees comme protegees ci-dessous (retour false).
  if (!pathname.startsWith('/api/') && !pathname.endsWith('.html')) return true;
  return ROUTES_REPONDANT.some((r) => r.m === method && r.re.test(pathname));
}

function refuser(res) {
  // Valeur d'en-tete HTTP : ASCII strict (pas de tiret cadratin ni d'accent,
  // sinon ERR_INVALID_CHAR). Le realm reste lisible cote navigateur.
  res.set('WWW-Authenticate', 'Basic realm="VSCode1 espace animateur", charset="UTF-8"');
  res.status(401).json({ error: 'Authentification requise (espace animateur).' });
}

// Fabrique le middleware. Lit l'environnement au montage ; l'activation depend
// donc des variables presentes au demarrage du serveur.
function barriereAuth(env = process.env) {
  const user = env.AUTH_USER;
  const pass = env.AUTH_PASS;
  const active = Boolean(user && pass);

  if (!active) {
    // No-op explicite : comportement inchange. Un avertissement unique au
    // demarrage signale que la surface PII n'est pas protegee.
    console.warn(
      '[securite] Barriere Basic Auth INACTIVE (AUTH_USER/AUTH_PASS non poses) : '
        + "l'API PII reste ouverte. Mesure interimaire de l'arbitrage securite:VSCode1-api-pii ; "
        + 'chantier de fond = Epic 10.',
    );
    return (req, res, next) => next();
  }

  return function middlewareAuth(req, res, next) {
    if (estRepondant(req.method, req.path)) return next();

    const header = req.headers.authorization || '';
    if (!header.startsWith('Basic ')) return refuser(res);

    let decoded;
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      return refuser(res);
    }
    const sep = decoded.indexOf(':');
    if (sep < 0) return refuser(res);
    const fUser = decoded.slice(0, sep);
    const fPass = decoded.slice(sep + 1);

    // Les deux comparaisons sont toujours evaluees (pas de court-circuit &&) pour
    // ne pas reveler par timing lequel des deux champs est faux.
    const okUser = egaliteConstante(fUser, user);
    const okPass = egaliteConstante(fPass, pass);
    if (okUser && okPass) return next();
    return refuser(res);
  };
}

module.exports = { barriereAuth, estRepondant };
