const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'admin.html'), 'utf8');
assert.doesNotMatch(adminHtml, /brand-bar|brand-mark|OCTO Technology/i, 'La bannière OCTO ne doit plus apparaître au-dessus de la zone animateur.');
assert.match(adminHtml, /Sélectionner une session|sessionResultats|btnOuvrirResultats/i, 'La page admin doit conserver les sélecteurs de session et d’ouverture des résultats.');
assert.match(adminHtml, /chargerSessionsInfo|chargerSessionsResultats/i, 'Le script admin doit initialiser la population des listes de session.');

const resultsHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'resultats.html'), 'utf8');
assert.match(resultsHtml, /Aucun identifiant de session|barreControles|etatSession/i, 'La page de consultation doit afficher un état explicite si la session manque ou est invalide.');

console.log('Admin/results UI regression tests OK');
