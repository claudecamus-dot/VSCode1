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
//
// CORRECTIF SECURITE (arbitrage utilisateur du 2026-09-16, US10.5 invalidee) :
// les 3 anciennes routes GLOBALES `/api/departements`, `/api/equipes`,
// `/api/roles` etaient ouvertes SANS aucun identifiant de session dans l'URL —
// n'importe qui pouvait donc lire, sans jamais avoir recu de lien de session,
// la liste AGREGEE de tous les departements/equipes de TOUTES les sessions
// jamais creees (donc de tous les clients passes par l'outil) : exposition
// d'organigramme cross-client. Corrige en les remplacant par des routes
// SESSION-SCOPEES (`/api/sessions/:id/...`), gardees par `chargerSession`
// (server.js) : la donnee elle-meme (departements/equipes) est desormais
// filtree sur la session, et meme le catalogue de roles (partage par
// construction, sans colonne session_id — pas de refonte de schema pour ce
// correctif) exige au moins l'existence d'une session valide avant de repondre.
const ROUTES_REPONDANT = [
  { m: 'GET', re: /^\/api\/env$/ },
  { m: 'GET', re: /^\/api\/texte-intro-defaut$/ },
  { m: 'GET', re: /^\/api\/sessions\/[^/]+\/roles$/ }, // le repondant choisit son role ; POST/DELETE restent proteges
  { m: 'GET', re: /^\/api\/sessions\/[^/]+\/departements-suggestions$/ },
  { m: 'GET', re: /^\/api\/sessions\/[^/]+\/equipes-suggestions$/ },
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
  '/esc.js',
  '/favicon.ico',
]);

function estRepondant(method, pathname) {
  // NORMALISATION DE CASSE AVANT TOUTE DECISION. `startsWith`/`endsWith` et les
  // regex ci-dessus sont sensibles a la casse, alors que ce qui route la requete
  // en aval ne l'est PAS : le routeur Express (option « case sensitive routing »
  // desactivee par defaut) et le systeme de fichiers Windows. Sans cette ligne,
  // `/API/sessions/<id>/resultats` n'etait « ni /api/ ni .html », donc traite en
  // ressource statique ouverte — puis route quand meme vers la vraie route par
  // Express. La barriere tombait sans identifiants, en lecture nominative comme
  // en ecriture (reproduit le 2026-09-01 ; cf. tests test-auth.js « casse »).
  const chemin = String(pathname || '').toLowerCase();
  if (PAGES_OUVERTES.has(chemin)) return true;
  // FAIL-CLOSED INTEGRAL : tout ce qui n'est pas explicitement ouvert est
  // protege. La version precedente ouvrait « tout ce qui n'est ni /api/ ni
  // .html » pour laisser passer css/js/images — mais `src/public/` n'en contient
  // aucun hors `env-banner.js`, deja liste ci-dessus, et cette branche ouvrait
  // par defaut tout futur fichier statique (un export .csv, un .json). Un
  // nouvel asset a servir au repondant s'ajoute a PAGES_OUVERTES : le defaut
  // doit etre le refus, c'est ce que « fail-closed » promet.
  // NB : la casse du METHOD n'est volontairement pas normalisee — une methode
  // inattendue ne matche alors aucune entree de la liste blanche, donc la
  // requete est protegee. Echouer vers le refus est le bon sens ici.
  return ROUTES_REPONDANT.some((r) => r.m === method && r.re.test(chemin));
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
    // En PRODUCTION, l'absence d'identifiants n'est pas un choix : c'est un
    // oubli de configuration qui laisse la surface PII ouverte sur le reseau.
    // Un `console.warn` dans un journal que personne ne lit n'a jamais empeche
    // un demarrage (constat du 2026-09-01 : `.env.prod` ne pose pas AUTH_*, et
    // `.env.prod.local` — le canal des secrets — n'existe pas sur le disque).
    // On refuse donc de demarrer, meme idiome que scripts/seed-demo.js qui
    // refuse deja de semer la demo en PROD.
    if ((env.APP_ENV || '') === 'PROD') {
      console.error(
        '[securite] Refus de demarrer : APP_ENV=PROD sans AUTH_USER/AUTH_PASS. '
          + "L'API expose des donnees nominatives ; posez les deux variables dans "
          + '.env.prod.local (hors depot) avant de lancer la production.',
      );
      process.exit(1);
    }
    // Hors PROD : no-op explicite, comportement inchange (dev, CI, tests). Un
    // avertissement unique au demarrage signale que la surface PII est ouverte.
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
