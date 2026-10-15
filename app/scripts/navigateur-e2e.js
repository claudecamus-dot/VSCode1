// Helper commun des tests de bout en bout en NAVIGATEUR REEL (puppeteer-core + Chrome).
// Utilise par e2e-*.js, test-entetes-securite.js et verify-lien-repondant.js.
//
// Contrat :
//   - Chrome : CHROME_PATH fait AUTORITE (remplace la liste), sinon emplacements usuels.
//   - Absence de Chrome : SKIP propre (message + exit 0) SAUF si CI ou EXIGER_NAVIGATEUR
//     est pose : echec explicite (un SKIP silencieux en CI fabrique une assurance fausse).
//   - fermer() : browser.close() peut BLOQUER sur Windows (reproduit) -> course contre
//     5 s, puis arret de l'arbre de processus.
//   - Toute erreur de page (pageerror) ou console.error (hors favicon.ico 404 connu)
//     fait ECHOUER le test.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

/* global requestAnimationFrame */

const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const DELAI_FERMETURE_MS = 5000;

const CANDIDATS_CHROME = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function trouverChrome() {
  return CANDIDATS_CHROME.find((c) => fs.existsSync(c)) || null;
}

// Un navigateur est EXIGE des lors qu'on est dans une CI ou que EXIGER_NAVIGATEUR=1.
function navigateurExige() {
  return process.env.EXIGER_NAVIGATEUR === '1' || Boolean(process.env.CI);
}

// Pour un script e2e autonome : rend le chemin de Chrome, ou sort (exit 0 = SKIP
// tolere hors CI, exit 1 = echec explicite si le navigateur est exige).
function chromeOuSortie() {
  const chrome = trouverChrome();
  if (chrome) return chrome;
  const candidats = CANDIDATS_CHROME.join(', ');
  if (navigateurExige()) {
    console.error(`  FAIL navigateur reel EXIGE (CI/EXIGER_NAVIGATEUR) mais introuvable - candidats essayes : ${candidats}. Installez Chrome ou posez CHROME_PATH.`);
    process.exit(1);
  }
  console.log(`  SKIP navigateur reel : Chrome introuvable - poser CHROME_PATH pour l'activer (candidats : ${candidats})`);
  process.exit(0);
  return null;
}

// Lance Chrome headless avec un userDataDir NEUF. Rend { navigateur, userDataDir }.
async function lancerNavigateur(chemin = trouverChrome()) {
  const puppeteer = require('puppeteer-core');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-chrome-'));
  const navigateur = await puppeteer.launch({
    executablePath: chemin,
    headless: true,
    userDataDir,
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 30000,
  });
  navigateur.__userDataDir = userDataDir;
  return navigateur;
}

function balayerParProfil(userDataDir) {
  // Dernier recours (Windows) : achever les chrome.exe qui portent NOTRE userDataDir
  // (unique par lancement) dans leur ligne de commande, meme si la racine est deja morte.
  const motif = path.basename(userDataDir); // e2e-chrome-XXXXXX : aucun caractere special
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${motif}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
  { stdio: 'ignore' });
}

function tuerArbre(pid) {
  try {
    if (process.platform === 'win32') {
      if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else if (pid) {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* deja mort */ }
}

// Windows relache les verrous du profil Chrome avec retard apres le kill : on reessaie
// la suppression (jusqu'a ~4 s), puis un balayage par profil, puis encore ~4 s. Un echec
// final reste un simple avertissement.
async function supprimerDossier(dossier) {
  for (let phase = 0; phase < 2; phase += 1) {
    for (let essai = 0; essai < 14; essai += 1) {
      try {
        fs.rmSync(dossier, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    if (phase === 0 && process.platform === 'win32') balayerParProfil(dossier);
  }
  console.warn(`  info dossier temporaire non supprime : ${dossier}`);
}

// browser.close() avec garde-fou : course contre 5 s, puis kill de l'arbre si la
// fermeture n'a pas abouti. Nettoie ensuite le userDataDir.
async function fermer(navigateur) {
  if (!navigateur) return;
  const proc = navigateur.process();
  const pid = proc && proc.pid;
  let minuteur;
  let delaiDepasse = false;
  try {
    await Promise.race([
      navigateur.close().catch(() => {}),
      new Promise((resolve) => { minuteur = setTimeout(() => { delaiDepasse = true; resolve(); }, DELAI_FERMETURE_MS); }),
    ]);
  } finally {
    clearTimeout(minuteur);
  }
  if (delaiDepasse || (proc && proc.exitCode === null && proc.signalCode === null)) tuerArbre(pid);
  if (navigateur.__userDataDir) await supprimerDossier(navigateur.__userDataDir);
}

// Surveille une page : pageerror et console.error (hors favicon.ico et hors `tolerer`,
// liste de RegExp pour les erreurs ATTENDUES du scenario) sont collectes.
// `verifier()` rend la liste (vide = ok) ; `echouerSiErreurs(check)` l'ecrit via check().
function surveillerPage(page, nom = 'page', tolerer = []) {
  const erreurs = [];
  page.on('pageerror', (err) => erreurs.push(`[${nom}] pageerror : ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = (msg.location() && msg.location().url) || '';
    if (/favicon\.ico(\?|$)/.test(url)) return;
    if (tolerer.some((re) => re.test(`${msg.text()} ${url}`))) return; // erreur ATTENDUE par le scenario
    erreurs.push(`[${nom}] console.error : ${msg.text()} ${url}`);
  });
  return {
    erreurs,
    verifier(check) {
      check(erreurs.length === 0, `${nom} : aucune erreur JS/console (recu ${JSON.stringify(erreurs)})`);
    },
  };
}

// Attend que la file d'evenements du navigateur soit vidangee (rendu + microtaches +
// un tour de macrotache) : sans sleep fixe. A utiliser apres avoir vu une reponse
// reseau arriver, pour laisser le code de la page la traiter AVANT d'asserter.
async function viderFile(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }));
}

// Retarde les requetes dont l'URL satisfait `correspond(url)` tant que `armee.actif`
// est vrai. Rend { armee, retarder(ms) } : `armee.actif = true` avant le geste de test.
// Active setRequestInterception sur la page (toute requete est donc continuee ici).
async function installerRetard(page, correspond, delaiMs = 2000) {
  const armee = { actif: false, retardees: 0 };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (armee.actif && correspond(req.url())) {
      armee.retardees += 1;
      setTimeout(() => { req.continue().catch(() => {}); }, delaiMs);
    } else {
      req.continue().catch(() => {});
    }
  });
  return armee;
}

// Serveur de test reel : DB temporaire amorcee par reconcileReferentiel (si `referentiel`
// est fourni) AVANT le demarrage, port libre, APP_ENV=test, AUTH_NON_REQUISE=1.
async function demarrerServeur({ nom = 'e2e', referentiel = null } = {}) {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), `${nom}-`));
  const dbPath = path.join(dossierTmp, 'e2e.db');
  if (referentiel) {
    process.env.DB_PATH = dbPath;
    const { reconcileReferentiel } = require('../src/referentiel');
    reconcileReferentiel(referentiel);
    require('../src/db').close();
  }
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test', AUTH_NON_REQUISE: '1', AUTH_USER: '', AUTH_PASS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, 15000, serveur, () => sortie);
  } catch (err) {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
    throw err;
  }
  return {
    base,
    dbPath,
    sortie: () => sortie,
    async arreter() {
      serveur.kill();
      await attendreMort(serveur);
      await nettoyer(dossierTmp);
    },
  };
}

// --- Donnees de depart, creees par les VRAIES routes HTTP ------------------------
async function creerSession(base) {
  const r = await fetchMutant(`${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ouverture_at: new Date(Date.now() - 3600000).toISOString(),
      fermeture_at: new Date(Date.now() + 3600000).toISOString(),
    }),
  });
  const corps = await r.json();
  if (!corps.id) throw new Error(`creation de session refusee : ${r.status} ${JSON.stringify(corps)}`);
  return corps.id;
}

// Identifie un repondant, repond a TOUTES les questions de `referentiel` (niveau fixe)
// puis soumet. `referentiel` = GET /api/sessions/:id/referentiel.
async function soumettre(base, sessionId, { email, departement, equipe, niveau = 2 }) {
  const json = { 'Content-Type': 'application/json' };
  const ident = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, nom: 'Nom', prenom: 'Prenom', departement, equipe, role: 'Testeur', est_manager: false, dans_equipe: true }),
  });
  const { id } = await ident.json();
  if (!id) throw new Error(`identification refusee : ${ident.status}`);
  const referentiel = await (await fetch(`${base}/api/sessions/${sessionId}/referentiel`)).json();
  for (const pilier of referentiel) {
    const reponses = pilier.sousCategories.flatMap((sc) => sc.questions).map((q) => ({ question_id: q.id, niveau }));
    const ecr = await fetchMutant(`${base}/api/repondants/${id}/piliers/${pilier.id}/reponses`, {
      method: 'PUT', headers: json, body: JSON.stringify({ reponses }),
    });
    if (ecr.status !== 200) throw new Error(`ecriture refusee : ${ecr.status} ${await ecr.text()}`);
  }
  const soum = await fetchMutant(`${base}/api/repondants/${id}/soumission`, { method: 'POST' });
  if (soum.status !== 200) throw new Error(`soumission refusee : ${soum.status} ${await soum.text()}`);
  return id;
}

module.exports = {
  CANDIDATS_CHROME,
  trouverChrome,
  navigateurExige,
  chromeOuSortie,
  lancerNavigateur,
  fermer,
  surveillerPage,
  viderFile,
  installerRetard,
  demarrerServeur,
  creerSession,
  soumettre,
};
