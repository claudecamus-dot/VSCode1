// Verification au RENDU REEL (Puppeteer, pas seulement teste en HTTP) du lien
// bookmarkable ?rid= de repondre.html (decision de conception arbitree le
// 2026-09-04, docs/wiki/todo.md "Durcissement de l'app"). Complementaire de
// app/scripts/test-fenetre-import.js (qui couvre le verrou d'import cote
// serveur) : ce script prouve le comportement cote NAVIGATEUR, en particulier
// le point que node:sqlite/fetch seuls ne peuvent pas verifier -- qu'un
// contexte SANS AUCUN localStorage prealable (nouvel appareil, cache vide)
// recupere bien l'acces via ?rid= seul, sans repasser par le formulaire.
//
// Hors de la chaine `npm test` (necessite un vrai Chrome, comme
// capture-screenshots.js) : `node scripts/verify-lien-repondant.js`.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant } = require('./helpers-serveur');

// Recherche du navigateur parmi les emplacements usuels des trois OS, meme
// idiome que scripts/test-entetes-securite.js : un chemin Windows en dur rendait
// ce script inexecutable ailleurs que sur le poste de son auteur. CHROME_PATH,
// quand elle est posee, fait AUTORITE et remplace la liste.
const CANDIDATS_CHROME = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME_PATH = CANDIDATS_CHROME.find((c) => fs.existsSync(c)) || CANDIDATS_CHROME[0];
const OUT_DIR = process.env.CAPTURES_OUT || path.join(__dirname, '..', '..', 'cadrage', 'captures', 'lien-repondant');

let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verif-lien-'));
  const dbPath = path.join(dossierTmp, 'verif.db');

  process.env.DB_PATH = dbPath;
  const { reconcileReferentiel } = require(path.join(__dirname, '..', 'src', 'referentiel'));
  reconcileReferentiel([
    { nom: 'Pilier Verif', ordre: 0, sousCategories: [
      { nom: 'Objectif', ordre: 0, questions: [{ texte: 'Question unique ?', niveaux: niveaux() }] },
    ] },
  ]);

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const serveur = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'verif-lien-repondant', AUTH_USER: '', AUTH_PASS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  // userDataDir NEUF par execution (audit 2026-09-02, meme lecon que
  // capture-screenshots.js) : jamais de profil Chrome persistant.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer-verif-lien-'));
  let browser;
  try {
    await attendreServeur(base, 15000);

    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 3600000).toISOString(),
        fermeture_at: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    check(creation.status === 200, `session creee (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();
    const urlDepart = `${base}/repondre.html?session=${sessionId}`;

    browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, userDataDir, args: ['--no-sandbox'] });

    console.log('--- (1) Formulaire d\'identification puis identification ---');
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 900 });
    await page.goto(urlDepart, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#formIdentification:not(.hidden)', { timeout: 10000 });
    await page.screenshot({ path: path.join(OUT_DIR, '1-formulaire.png') });

    await page.type('#email', 'verif-rid@exemple.fr');
    await page.type('#nom', 'Nom');
    await page.type('#prenom', 'Prenom');
    await page.type('#departement', 'Dept Verif');
    await page.type('#equipe', 'Equipe Verif');
    await page.select('#role', await page.$eval('#role option', (o) => o.value));
    await page.click('#formIdentification button[type="submit"]');

    await page.waitForSelector('#zoneQuestionnaire:not(.hidden)', { timeout: 10000 });
    const urlApresIdentification = page.url();
    check(/[?&]rid=/.test(urlApresIdentification), 'URL affichee porte bien ?rid= apres identification (history.replaceState)');

    const bandeauVisible = await page.$eval('#noticeLienPersonnel', (el) => !!el.offsetParent);
    check(bandeauVisible, 'le bandeau "Ce lien est personnel..." est visible au-dessus de la progression');
    await page.screenshot({ path: path.join(OUT_DIR, '2-questionnaire-bandeau.png') });

    console.log('--- (2) Bouton "Copier mon lien" ---');
    await page.click('#boutonCopierLien');
    await new Promise((r) => setTimeout(r, 400));
    const statutCopie = await page.$eval('#statutCopieLien', (el) => el.textContent.trim());
    check(statutCopie.length > 0, `un message de statut s'affiche apres clic sur "Copier mon lien" (recu "${statutCopie}")`);
    await page.screenshot({ path: path.join(OUT_DIR, '3-copie-lien.png') });

    console.log('--- (3) Recuperation via ?rid= SEUL, sans aucun localStorage prealable (contexte incognito) ---');
    const contexteFrais = await browser.createBrowserContext();
    const pageFraiche = await contexteFrais.newPage();
    await pageFraiche.setViewport({ width: 1000, height: 900 });
    await pageFraiche.goto(urlApresIdentification, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));

    const formulaireVisible = await pageFraiche.$eval('#formIdentification', (el) => !el.classList.contains('hidden'));
    const questionnaireVisible = await pageFraiche.$eval('#zoneQuestionnaire', (el) => !el.classList.contains('hidden'));
    check(!formulaireVisible, 'contexte SANS localStorage : le formulaire d\'identification ne reapparait PAS');
    check(questionnaireVisible, 'contexte SANS localStorage : le questionnaire se recharge directement via ?rid= seul');
    await pageFraiche.screenshot({ path: path.join(OUT_DIR, '4-recuperation-sans-localstorage.png') });

    console.log('--- (4) ?rid= d\'un AUTRE repondant colle sur cette session : doit retomber sur le formulaire, pas afficher les reponses d\'un tiers ---');
    const urlMalFormee = `${base}/repondre.html?session=${sessionId}&rid=00000000-0000-0000-0000-000000000000`;
    const pageMalFormee = await contexteFrais.newPage();
    await pageMalFormee.setViewport({ width: 1000, height: 900 });
    await pageMalFormee.goto(urlMalFormee, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));
    const formulaireVisibleMalForme = await pageMalFormee.$eval('#formIdentification', (el) => !el.classList.contains('hidden'));
    check(formulaireVisibleMalForme, 'rid inconnu/etranger : retombe sur le formulaire d\'identification, pas d\'affichage silencieux');

    await contexteFrais.close();
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    if (browser) await browser.close();
    await nettoyer(userDataDir);
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }

  console.log(echecs === 0 ? '\nTOUS LES POINTS PASSENT' : `\n${echecs} POINT(S) EN ECHEC`);
  console.log(`Captures dans : ${OUT_DIR}`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
