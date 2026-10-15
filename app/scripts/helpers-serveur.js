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
const cp = require('node:child_process');

// Suivi AUTOMATIQUE du dernier serveur (…/server.js) lance par ce processus de test :
// ~24 tests appelaient attendreServeur(base, delai) sans passer l'enfant et perdaient donc
// la detection « le serveur est mort » (ils attendaient le delai entier puis ne disaient que
// « fetch failed »). On s'accroche a ChildProcess.prototype.spawn (et non a cp.spawn) parce
// que les tests recuperent `spawn` par destructuration AVANT ou APRES ce require : le
// prototype est commun a tous. Seul un processus dont un argument se termine par server.js
// est suivi ; sa sortie est collectee en plus de celle que le test collecte lui-meme.
let dernierServeur = null;
const spawnOrigine = cp.ChildProcess.prototype.spawn;
cp.ChildProcess.prototype.spawn = function spawnSuivi(options) {
  const resultat = spawnOrigine.call(this, options);
  const args = (options && options.args) || [];
  if (args.some((a) => /(^|[\\/])server\.js$/.test(String(a)))) {
    const suivi = { enfant: this, texte: '' };
    for (const flux of [this.stdout, this.stderr]) {
      if (flux) flux.on('data', (d) => { suivi.texte += d; });
    }
    dernierServeur = suivi;
  }
  return resultat;
};

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

// Delai plancher de demarrage : sur ce poste le serveur met 2 a 5 s a froid (chargement
// d'express et des modules, analyse antivirus) et plus de 15 s des qu'un autre test ou
// un build tourne en parallele (4 echecs sur 6 mesures le 2026-10-14, test-fusion-champs).
// Les ~25 appelants passent encore 15000 en dur : le delai effectif est donc le plus
// grand de leur valeur et de ce plancher. TEST_SERVER_TIMEOUT_MS remplace le plancher (60000 par
// defaut) ; il ne peut qu'allonger l'attente, jamais la raccourcir sous la valeur de l'appelant.
const DELAI_DEMARRAGE_MIN_MS = 60000;

// `enfant` (optionnel) : le processus serveur lance par le test. S'il meurt avant
// d'etre joignable, on echoue tout de suite avec sa sortie, au lieu de boucler jusqu'au
// delai puis de ne dire que « fetch failed ». `sortie` (optionnel) : fonction qui rend
// ce que l'enfant a ecrit jusque-la.
async function attendreServeur(base, delaiMs, enfant, sortie) {
  if (!enfant && dernierServeur) {
    enfant = dernierServeur.enfant;
    const suivi = dernierServeur;
    sortie = () => suivi.texte;
  }
  const brut = process.env.TEST_SERVER_TIMEOUT_MS;
  if (brut !== undefined && !(Number(brut) > 0)) {
    console.warn(`  info TEST_SERVER_TIMEOUT_MS=${JSON.stringify(brut)} ignore (entier > 0 attendu) : plancher de ${DELAI_DEMARRAGE_MIN_MS} ms`);
  }
  const plancher = Number(brut) > 0 ? Number(brut) : DELAI_DEMARRAGE_MIN_MS;
  const delai = Math.max(delaiMs, plancher);
  const debut = Date.now();
  const fin = debut + delai;
  const port = (() => { try { return new URL(base).port; } catch { return '?'; } })();
  const vivant = () => !enfant || (enfant.exitCode === null && enfant.signalCode === null);
  const sortieVue = () => (typeof sortie === 'function' ? String(sortie() || '') : '');
  let tentatives = 0;
  const codes = {};
  let derniereErreur = null;
  while (Date.now() < fin) {
    if (!vivant()) {
      const vu = sortieVue();
      throw new Error(
        `Le serveur s'est arrete avant d'etre joignable (exitCode=${enfant.exitCode}, signal=${enfant.signalCode}, `
        + `apres ${Date.now() - debut} ms, ${tentatives} tentative(s), port ${port})`
        + (vu ? ` :\n${vu}` : '')
      );
    }
    tentatives += 1;
    try {
      // Delai propre a chaque tentative : un accept sans reponse ne doit pas faire pendre l'attente.
      const res = await fetch(`${base}/api/env`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
      derniereErreur = new Error(`HTTP ${res.status} sur /api/env`);
      codes[`HTTP ${res.status}`] = (codes[`HTTP ${res.status}`] || 0) + 1;
    } catch (err) {
      derniereErreur = err;
      // « fetch failed » cache la vraie cause (ECONNREFUSED, ECONNRESET, ETIMEDOUT...) dans err.cause.
      const code = (err && err.cause && err.cause.code) || (err && err.name) || 'inconnu';
      codes[code] = (codes[code] || 0) + 1;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  // Diagnostic COMPLET : enfant vivant ou mort, port, heure, nombre et nature des echecs reseau, et la
  // fin de la sortie du serveur. Interpretation : enfant vivant + ECONNREFUSED + sortie vide = le
  // serveur n'a jamais ecoute ; ETIMEDOUT/AbortError ou HTTP 5xx = il ecoute mais ne repond pas.
  const vuFinale = sortieVue();
  throw new Error(
    `Serveur injoignable apres ${delai} ms (${new Date().toISOString()}, port ${port}) : ${derniereErreur}\n`
    + `  enfant=${enfant ? JSON.stringify({ pid: enfant.pid, vivant: vivant() }) : 'inconnu'} tentatives=${tentatives} codes=${JSON.stringify(codes)}\n`
    + `  sortie du serveur (2000 derniers caracteres) : ${vuFinale.slice(-2000) || '(vide)'}`
  );
}

// Windows garde le fichier de base verrouille tant que le processus enfant n'est
// pas VRAIMENT mort : on attend son `exit` (avec repli sur un delai) puis on
// reessaie la suppression, plutot que de laisser des bases temporaires derriere.
function attendreMort(serveur, delaiMs = 5000) {
  if (serveur.exitCode !== null || serveur.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    // Sans exit apres le delai, on tue l'enfant plutot que de le laisser tenir son port
    // et le verrou de la base (orphelin qui fausserait les tests suivants).
    const minuteur = setTimeout(() => {
      try { serveur.kill('SIGKILL'); } catch { /* deja mort */ }
      resolve();
    }, delaiMs);
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
