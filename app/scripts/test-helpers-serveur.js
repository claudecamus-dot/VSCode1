// Bloc serveur-de-test partage par les scripts test-*.js qui demarrent le VRAI
// serveur (src/server.js) en processus enfant sur un port libre, avec une base
// SQLite temporaire. Extrait le 2026-09-04 (constat revue de code) : au moins
// 12 fichiers dupliquaient ce meme bloc d'environ 50 lignes, avec de petites
// divergences accumulees au fil des correctifs. Choix de fusion retenus :
//
//   - portLibre() et attendreServeur() etaient DEJA identiques mot pour mot
//     dans les 12 fichiers : reprises telles quelles, aucun arbitrage a faire.
//   - attendreMort() : gardee dans sa forme la plus robuste, celle presente
//     dans 10 des 12 fichiers (attend le VRAI evenement 'exit' du processus,
//     avec un delai de repli). Les 2 fichiers restants (test-smoke-http.js,
//     test-auth.js) se contentaient d'un `setTimeout` fixe de 300 ms avant de
//     nettoyer : moins fiable, Windows peut garder le fichier de base
//     verrouille plus longtemps que ca sous charge.
//   - nettoyer() : gardee dans sa forme avec `console.warn` de repli, presente
//     dans 9 des 10 fichiers qui avaient deja une fonction `nettoyer` dediee.
//     test-csrf-import.js avait une version sans ce warn final, qui echouait
//     silencieusement apres les 5 tentatives sans rien dire. Les 2 fichiers
//     restants (test-smoke-http.js, test-auth.js) faisaient un `rmSync` direct
//     en ligne, sans repli ni tentative repetee (juste un commentaire "best
//     effort").
const net = require('node:net');
const fs = require('node:fs');

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function attendreServeur(base, delaiMs) {
  const fin = Date.now() + delaiMs;
  let derniereErreur = null;
  while (Date.now() < fin) {
    try {
      const res = await fetch(`${base}/api/env`);
      if (res.ok) return;
      derniereErreur = new Error(`HTTP ${res.status} sur /api/env`);
    } catch (err) {
      derniereErreur = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Serveur injoignable apres ${delaiMs} ms : ${derniereErreur}`);
}

// Windows garde le fichier de base verrouille tant que le processus enfant n'est
// pas VRAIMENT mort : on attend son `exit` (avec repli sur un delai) puis on
// reessaie la suppression, plutot que de laisser des bases temporaires derriere.
function attendreMort(serveur, delaiMs = 5000) {
  if (serveur.exitCode !== null || serveur.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const minuteur = setTimeout(resolve, delaiMs);
    serveur.once('exit', () => { clearTimeout(minuteur); setTimeout(resolve, 100); });
  });
}

async function nettoyer(dossier) {
  for (let essai = 0; essai < 5; essai += 1) {
    try {
      fs.rmSync(dossier, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  console.warn(`  info dossier temporaire non supprime : ${dossier}`);
}

// Durcissement CSRF du 2026-09-04 (src/csrf.js, memeOrigine) : fail-closed
// quand Origin ET Referer sont absents. Un VRAI navigateur envoie toujours
// Origin sur une requete mutante same-origin -- mais le `fetch()` de Node, lui,
// n'en pose AUCUN par defaut, contrairement a un navigateur. Sans ce wrapper,
// chaque POST/PUT/DELETE/PATCH emis par ces scripts de test se ferait donc
// bloquer en 403 par le serveur reel, alors que le scenario qu'ils verifient
// n'a rien a voir avec le CSRF. `fetchMutant` pose l'Origin de la requete
// elle-meme (calculee depuis son URL, jamais une valeur injectee de
// l'exterieur) : c'est exactement ce qu'un navigateur ferait pour un appel
// same-origin legitime, pas un contournement de la protection.
// A NE PAS utiliser pour les scenarios qui testent volontairement une Origin
// absente/tierce (test-csrf-import.js) : ceux-la doivent garder `fetch()` nu,
// ou poser eux-memes une Origin volontairement fausse.
function fetchMutant(url, options = {}) {
  return fetch(url, { ...options, headers: { ...options.headers, Origin: new URL(url).origin } });
}

// Identifiants Basic Auth de test, partages par les scripts qui demarrent le
// serveur avec AUTH_USER/AUTH_PASS actives (constat revue de code 2026-09-04 :
// dupliques a l'identique dans test-auth.js, test-auth-durcissement.js et
// test-csrf-import.js).
const USER = 'animateur';
const PASS = 'motdepasse-de-test';
function basic(u, p) {
  return 'Basic ' + Buffer.from(`${u}:${p}`, 'utf8').toString('base64');
}

module.exports = { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic };
