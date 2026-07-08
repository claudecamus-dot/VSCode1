const puppeteer = require('puppeteer-core');
const path = require('node:path');

// Respecte CHROME_PATH comme le fait server.js (rasteriserRadars) : évite un chemin
// Windows en dur non portable — même variable d'environnement partagée par tout le pipeline.
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = process.env.CAPTURES_OUT || path.join(__dirname, '..', '..', 'cadrage', 'captures');

const SESSION_RESULTATS = process.argv[2];
const SESSION_REPONDRE = process.argv[3];

async function main() {
  const fs = require('node:fs');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    userDataDir: path.join(require('node:os').tmpdir(), 'puppeteer-capture-profile'),
    args: ['--no-sandbox', '--disable-gpu'],
    protocolTimeout: 30000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Espace animateur (import + session)
  await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, '01-admin.png') });

  // 2. Parcours repondant (questionnaire en cours)
  await page.goto(`http://localhost:3000/repondre.html?session=${SESSION_REPONDRE}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));
  // remplir et soumettre le formulaire d'identification si encore affiche
  const formVisible = await page.$eval('#formIdentification', (el) => !el.classList.contains('hidden')).catch(() => false);
  if (formVisible) {
    await page.type('#email', 'sofia.lambert@bpce-it.fr');
    await page.type('#nom', 'Lambert');
    await page.type('#prenom', 'Sofia');
    await page.type('#departement', 'DSI');
    await page.type('#equipe', 'Equipe Alpha');
    await page.select('#role', 'Tech Lead');
    await page.click('#dansEquipe');
    await page.click('#formIdentification button[type=submit]');
    await new Promise((r) => setTimeout(r, 500));
  }
  // selectionner un choix sur la 1ere question visible pour montrer l'encart de detail
  const premierSegment = await page.$('.echelle .segment:nth-child(3)');
  if (premierSegment) {
    await premierSegment.click();
    await new Promise((r) => setTimeout(r, 200));
  }
  await page.screenshot({ path: path.join(OUT_DIR, '02-repondre.png') });

  // 3. Resultats animateur : radar (haut de page)
  await page.goto(`http://localhost:3000/resultats.html?session=${SESSION_RESULTATS}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT_DIR, '03-resultats-radar.png') });

  // 4. Resultats animateur : accordeon avec drill-down nominatif ouvert
  const lienDetail = await page.$('.lien-detail');
  if (lienDetail) {
    await lienDetail.click();
    await lienDetail.scrollIntoView();
    await new Promise((r) => setTimeout(r, 200));
  }
  await page.screenshot({ path: path.join(OUT_DIR, '04-resultats-detail.png') });

  await browser.close();
  console.log('Captures ecrites dans', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
