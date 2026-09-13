// En-tetes de securite HTTP : presence reelle, et COHERENCE avec ce que les
// pages font vraiment (finding securite de l'audit du 2026-09-04 — la pile de
// middlewares n'en posait aucun).
//
// Trois etages, du moins cher au plus probant :
//
//   1. HTTP reel : les 4 en-tetes sont poses sur une page, sur une reponse
//      d'API, et jusque sur le 401 de la barriere Basic Auth.
//   2. Coherence CSP <-> pages : le piege de ce correctif est une CSP qui
//      paraisse propre et casse l'application. Les 5 pages portent leur logique
//      dans un <script> INLINE : le test le CONSTATE sur les fichiers, puis
//      exige que la politique le permette. Si un jour les pages sortent leur
//      script inline, le test demande de retirer la latitude ; si quelqu'un
//      durcit la politique sans les avoir sorties, il crie avant la prod. Meme
//      raisonnement pour toute origine externe referencee par une page.
//   3. Navigateur reel (si Chrome est disponible, meme garde que
//      test-export-ppt-si-dispo.js) : les pages sont chargees sous la VRAIE
//      politique servie et on compte les violations CSP rapportees par le
//      moteur — plus un clic qui prouve que le script inline s'execute bien.
//      Sans Chrome : SKIP explicite, l'etage 2 reste verifie.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, USER, PASS } = require('./test-helpers-serveur');
const { ENTETES, POLITIQUE_CSP } = require('../src/entetes-securite');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const DOSSIER_PAGES = path.join(__dirname, '..', 'src', 'public');
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function directive(nom) {
  const trouvee = POLITIQUE_CSP.split(';')
    .map((d) => d.trim())
    .find((d) => d === nom || d.startsWith(`${nom} `));
  return trouvee || null;
}

// --- Etage 2 : la politique correspond-elle a ce que les pages FONT ? ---------
// Origines externes (http/https) referencees en src=/href= par une page. Extrait
// en fonction pour etre EPROUVE sur un temoin : cf. verifierCoherenceAvecLesPages.
function originesExternesDe(html) {
  const origines = new Set();
  for (const url of html.match(/\b(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || []) {
    origines.add(new URL(url.replace(/^[^"']*["']/, '')).origin);
  }
  return origines;
}

function verifierCoherenceAvecLesPages() {
  const pages = fs.readdirSync(DOSSIER_PAGES).filter((f) => f.endsWith('.html'));
  check(pages.length > 0, `des pages sont inspectees (${pages.length} trouvee(s) dans src/public/)`);

  let pagesAvecScriptInline = 0;
  let pagesAvecStyleInline = 0;
  const originesExternes = new Set();

  for (const page of pages) {
    const html = fs.readFileSync(path.join(DOSSIER_PAGES, page), 'utf8');
    // <script> sans attribut src = bloc inline, celui que 'unsafe-inline' autorise.
    if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) pagesAvecScriptInline += 1;
    if (/<style[^>]*>[\s\S]*?<\/style>/i.test(html) || /\sstyle="/i.test(html)) pagesAvecStyleInline += 1;
    for (const origine of originesExternesDe(html)) originesExternes.add(origine);
  }

  const scriptSrc = directive('script-src');
  const styleSrc = directive('style-src');
  check(scriptSrc !== null, `la politique declare une directive script-src (${scriptSrc})`);
  check(styleSrc !== null, `la politique declare une directive style-src (${styleSrc})`);

  // Le coeur du garde-fou : latitude EXIGEE tant que les pages en ont besoin,
  // latitude INTERDITE des qu'elles n'en ont plus (une CSP ne garde pas une
  // permission dont plus personne ne se sert).
  check(
    pagesAvecScriptInline > 0 ? scriptSrc.includes("'unsafe-inline'") : !scriptSrc.includes("'unsafe-inline'"),
    pagesAvecScriptInline > 0
      ? `script-src autorise l'inline, comme l'exigent les ${pagesAvecScriptInline} page(s) a <script> inline`
      : "plus aucune page n'a de <script> inline : retirer 'unsafe-inline' de script-src"
  );
  check(
    pagesAvecStyleInline > 0 ? styleSrc.includes("'unsafe-inline'") : !styleSrc.includes("'unsafe-inline'"),
    pagesAvecStyleInline > 0
      ? `style-src autorise l'inline, comme l'exigent les ${pagesAvecStyleInline} page(s) a style inline`
      : "plus aucune page n'a de style inline : retirer 'unsafe-inline' de style-src"
  );

  // Aucune origine externe aujourd'hui (tout est servi same-origin) : si une
  // page en ajoute une, `default-src 'self'` la bloquerait en silence.
  for (const origine of originesExternes) {
    check(
      POLITIQUE_CSP.includes(origine),
      `l'origine externe ${origine} referencee par une page est declaree dans la CSP`
    );
  }
  // Garde-fou de la garde (meme motif que test-admin-ui.js:29-31) : la boucle
  // ci-dessus itere aujourd'hui sur un ensemble VIDE, donc elle n'execute AUCUNE
  // assertion — et la ligne qui suivait etait un `check(true, ...)` litteral, vert
  // inconditionnellement, qui gonflait le compteur sans rien prouver
  // (audit du 2026-09-13). Un ensemble vide doit signifier « aucune origine
  // externe », jamais « l'extracteur ne detecte plus rien » : on l'eprouve donc
  // sur un temoin qui, lui, EN CONTIENT.
  const temoin = originesExternesDe(
    '<script src="https://cdn.exemple.invalid/a.js"></script>'
    + '<link rel="stylesheet" href=\'https://polices.exemple.invalid/b.css\'>'
    + '<img src="/local.png">'
  );
  check(
    temoin.has('https://cdn.exemple.invalid') && temoin.has('https://polices.exemple.invalid') && temoin.size === 2,
    `l'extracteur d'origines externes en trouve bien quand il y en a, et ignore le same-origin (temoin : ${[...temoin].join(', ') || 'AUCUNE'})`
  );
  console.log(`  info origines externes reellement referencees par les ${pages.length} pages : ${originesExternes.size}`);
}

// --- Etage 3 : sous un VRAI navigateur ---------------------------------------
// Les fonctions passees a page.evaluate / evaluateOnNewDocument ci-dessous sont
// serialisees et executees DANS le navigateur, pas dans ce processus Node :
// `window` et `document` y existent. Declares ici pour ESLint, qui lint ce
// fichier avec les globals Node (eslint.config.js, bloc scripts/**).
/* global window, document */
async function verifierSousChrome(base) {
  if (!fs.existsSync(CHROME_PATH)) {
    console.log(`  SKIP navigateur reel : Chrome introuvable (${CHROME_PATH}) — poser CHROME_PATH pour l'activer`);
    return;
  }
  const puppeteer = require('puppeteer-core');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-verif-'));
  const navigateur = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 30000,
  });
  try {
    for (const chemin of ['/index.html', '/repondre.html', '/admin.html', '/resultats.html', '/pilotage.html']) {
      const page = await navigateur.newPage();
      // Collecte des violations rapportees par le moteur lui-meme, avant tout
      // script de la page (evaluateOnNewDocument) : c'est le navigateur qui
      // dit si la politique casse quelque chose, pas une heuristique a nous.
      await page.evaluateOnNewDocument(() => {
        window.__violationsCsp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__violationsCsp.push(`${e.violatedDirective} <- ${e.blockedURI}`);
        });
      });
      await page.goto(`${base}${chemin}`, { waitUntil: 'networkidle0' });
      const violations = await page.evaluate(() => window.__violationsCsp);
      check(violations.length === 0, `${chemin} : aucune violation CSP (recu ${JSON.stringify(violations)})`);

      // Preuve que le script INLINE s'execute vraiment sous cette politique :
      // le bouton de l'accueil n'a d'effet que par son <script> inline.
      if (chemin === '/index.html') {
        await page.click('button[data-mode="demo"]');
        const cookie = await page.evaluate(() => document.cookie);
        check(cookie.includes('mode=demo'), `le script inline de l'accueil s'execute (cookie recu : "${cookie}")`);
      }
      await page.close();
    }
  } finally {
    await navigateur.close();
    await nettoyer(userDataDir);
  }
}

async function main() {
  console.log('Coherence de la politique avec ce que les pages font reellement :');
  verifierCoherenceAvecLesPages();

  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entetes-securite-'));
  const dbPath = path.join(dossierTmp, 'entetes.db');
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  // Barriere INACTIVE : les pages animateur doivent etre chargeables par le
  // navigateur de l'etage 3 sans invite Basic.
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-entetes', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('En-tetes reellement poses sur une page servie :');
    const page = await fetch(`${base}/index.html`);
    check(page.status === 200, `GET /index.html -> 200 (recu ${page.status})`);
    for (const [nom, valeur] of Object.entries(ENTETES)) {
      check(page.headers.get(nom) === valeur, `${nom}: ${valeur} (recu ${JSON.stringify(page.headers.get(nom))})`);
    }
    const csp = page.headers.get('content-security-policy') || '';
    check(csp.includes("frame-ancestors 'none'"), 'la CSP interdit l embarquement en iframe (frame-ancestors)');
    check(csp.includes("default-src 'self'"), 'la CSP ferme les origines externes par defaut (default-src)');

    console.log("En-tetes poses aussi sur l'API :");
    const api = await fetch(`${base}/api/env`);
    check(api.status === 200, `GET /api/env -> 200 (recu ${api.status})`);
    for (const nom of Object.keys(ENTETES)) {
      check(api.headers.get(nom) !== null, `${nom} present sur la reponse d API`);
    }
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
  }

  // Barriere ACTIVE : un 401 est une reponse rendue par le navigateur comme une
  // autre — elle doit porter les memes en-tetes.
  const portAuth = await portLibre();
  const baseAuth = `http://127.0.0.1:${portAuth}`;
  const serveurAuth = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(portAuth), DB_PATH: dbPath, APP_ENV: 'test-entetes-auth', AUTH_USER: USER, AUTH_PASS: PASS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await attendreServeur(baseAuth, DELAI_DEMARRAGE_MS);
    console.log('En-tetes poses jusque sur le 401 de la barriere Basic Auth :');
    const refus = await fetch(`${baseAuth}/admin.html`);
    check(refus.status === 401, `GET /admin.html sans identifiants -> 401 (recu ${refus.status})`);
    for (const nom of Object.keys(ENTETES)) {
      check(refus.headers.get(nom) !== null, `${nom} present sur le 401`);
    }
  } finally {
    serveurAuth.kill();
    await attendreMort(serveurAuth);
  }

  // Etage 3 : navigateur reel, sur un serveur sans barriere.
  const portNav = await portLibre();
  const baseNav = `http://127.0.0.1:${portNav}`;
  const serveurNav = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(portNav), DB_PATH: dbPath, APP_ENV: 'test-entetes-nav', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await attendreServeur(baseNav, DELAI_DEMARRAGE_MS);
    console.log('Pages chargees dans un VRAI navigateur, sous la politique servie :');
    await verifierSousChrome(baseNav);
  } finally {
    serveurNav.kill();
    await attendreMort(serveurNav);
    await nettoyer(dossierTmp);
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
