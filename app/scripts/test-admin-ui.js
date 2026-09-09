const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'admin.html'), 'utf8');
assert.doesNotMatch(adminHtml, /brand-bar|brand-mark|OCTO Technology/i, 'La bannière OCTO ne doit plus apparaître au-dessus de la zone animateur.');
assert.match(adminHtml, /Sélectionner une session|sessionResultats|btnOuvrirResultats/i, 'La page admin doit conserver les sélecteurs de session et d’ouverture des résultats.');
assert.match(adminHtml, /chargerSessionsInfo|chargerSessionsResultats/i, 'Le script admin doit initialiser la population des listes de session.');

const resultsHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'resultats.html'), 'utf8');
assert.match(resultsHtml, /Aucun identifiant de session|barreControles|etatSession/i, 'La page de consultation doit afficher un état explicite si la session manque ou est invalide.');

// Tout lien `target="_blank"` doit porter rel="noopener noreferrer" (constat
// securite de l'audit-technique du 2026-09-09 : les 3 liens de la fiche session
// d'admin.html n'en avaient aucun). Sans `noopener`, la page ouverte recoit un
// `window.opener` qui lui laisse reecrire l'onglet d'origine (tabnabbing) ;
// sans `noreferrer`, l'URL de session part dans l'en-tete Referer.
//
// Balaye TOUTES les pages de src/public, pas seulement celles connues au
// moment ou ce test a ete ecrit : un lien ajoute demain est couvert d'office.
const dossierPages = path.join(__dirname, '..', 'src', 'public');
const liensBlank = [];
for (const fichier of fs.readdirSync(dossierPages).filter((f) => f.endsWith('.html'))) {
  const page = fs.readFileSync(path.join(dossierPages, fichier), 'utf8');
  for (const balise of page.match(/<a\b[^>]*>/gi) || []) {
    if (/\btarget\s*=\s*["']_blank["']/i.test(balise)) liensBlank.push({ fichier, balise });
  }
}
// Garde-fou de la garde : une liste vide rendrait la boucle ci-dessous verte
// par construction (lecon « test de garde-fou a assertion vide »).
assert.ok(liensBlank.length >= 3, `Au moins les 3 liens de la fiche session doivent etre inspectes (trouves : ${liensBlank.length}).`);
for (const { fichier, balise } of liensBlank) {
  const rel = (balise.match(/\brel\s*=\s*["']([^"']*)["']/i) || ['', ''])[1].toLowerCase().split(/\s+/);
  assert.ok(rel.includes('noopener'), `${fichier} : lien target="_blank" sans rel="noopener" -> ${balise}`);
  assert.ok(rel.includes('noreferrer'), `${fichier} : lien target="_blank" sans rel="noreferrer" -> ${balise}`);
}
console.log(`Liens target="_blank" verifies : ${liensBlank.length} (rel="noopener noreferrer" present sur chacun)`);

// Meme exigence sur les ouvertures d'onglet faites EN JAVASCRIPT. Trouve en
// passe adversariale du correctif ci-dessus (2026-09-09) : admin.html ouvrait
// l'ecran de resultats par `window.open(url, '_blank')` SANS `noopener`, sur la
// meme page et le meme genre d'URL que les 3 liens qu'on venait de proteger --
// une garde qui ne regarde que le HTML est une garde de facade.
const ouverturesJs = [];
for (const fichier of fs.readdirSync(dossierPages).filter((f) => f.endsWith('.html') || f.endsWith('.js'))) {
  const page = fs.readFileSync(path.join(dossierPages, fichier), 'utf8');
  for (const appel of page.match(/window\.open\s*\([^;]*\);/g) || []) {
    if (/['"`]_blank['"`]/.test(appel)) ouverturesJs.push({ fichier, appel });
  }
}
assert.ok(ouverturesJs.length >= 1, `Au moins l'ouverture des resultats doit etre inspectee (trouvees : ${ouverturesJs.length}).`);
for (const { fichier, appel } of ouverturesJs) {
  assert.ok(/noopener/.test(appel), `${fichier} : window.open(..., '_blank') sans 'noopener' -> ${appel}`);
  assert.ok(/noreferrer/.test(appel), `${fichier} : window.open(..., '_blank') sans 'noreferrer' -> ${appel}`);
}
console.log(`Ouvertures window.open('_blank') verifiees : ${ouverturesJs.length} (noopener,noreferrer present sur chacune)`);

console.log('Admin/results UI regression tests OK');
