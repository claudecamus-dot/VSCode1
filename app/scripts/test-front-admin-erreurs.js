// admin.html : les appels POST/DELETE passent par fetchJson (erreurs gerees,
// jamais de rejet non gere) et aucun message « HTTP 500 » brut n'atteint l'UI.
// FRONT_PAGE_OVERRIDE permet de rejouer le test sur une copie (mutants, etat initial).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = process.env.FRONT_PAGE_OVERRIDE || path.join(__dirname, '..', 'src', 'public', 'admin.html');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL : script inline introuvable'); process.exit(1); }

function creerSandbox(reponseServeur) {
  const elements = new Map();
  const faux = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, checked: false, files: [], dataset: {}, hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, focus() {},
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, faux(id)); return elements.get(id); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  };
  const sandbox = {
    document, URL, URLSearchParams, console, setTimeout, clearTimeout, FormData,
    window: { location: { search: '', origin: 'http://x', href: 'http://x/admin.html' }, confirm: () => true },
    confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, alert() {},
    esc: (v) => String(v),
    fetch: (chemin, options) => reponseServeur(chemin, options || {}),
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'fetch-json.js'), 'utf8'), sandbox);
  // Chargements initiaux (GET) : reponses vides valides, hors du scenario mesure.
  vm.runInContext(m[1], sandbox, { filename: 'admin.html#inline' });
  return { sandbox, document };
}

const ok = (corps) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) });
const ko = (status, corps) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(corps) });
const mutation = (opts) => /POST|DELETE/.test(opts.method || '');
const serveur = (surMutation) => (chemin, opts) => (mutation(opts) ? surMutation(chemin, opts) : ok([]));
const brut = (t) => /HTTP\s*\d{3}/.test(t);

async function scenario(nom, surMutation, action, lire, attendre) {
  console.log(nom);
  const { sandbox, document } = creerSandbox(serveur(surMutation));
  await new Promise((r) => setTimeout(r, 20)); // laisse finir les chargements initiaux
  let rejet = null;
  try { await vm.runInContext(action, sandbox); } catch (e) { rejet = e; }
  check(rejet === null, `aucun rejet non gere (${rejet && rejet.message})`);
  const texte = lire(document);
  attendre(texte);
}
const pasBrut = (t) => {
  check(t !== '' && !brut(t), `message affiche, sans « HTTP 500 » brut (recu « ${t} »)`);
  check(/serveur/i.test(t), 'message francais explicite pour une erreur serveur');
};

async function main() {
  await scenario('Ajout de role, serveur 500 :', () => ko(500, {}),
    "document.getElementById('nouveauRole').value = 'PO'; ajouterRole()",
    (d) => d.getElementById('erreurRole').textContent, pasBrut);
  await scenario('Ajout de role, reseau coupe :', () => Promise.reject(new TypeError('failed')),
    "document.getElementById('nouveauRole').value = 'PO'; ajouterRole()",
    (d) => d.getElementById('erreurRole').textContent, (t) => check(t !== '', 'un message est affiche'));
  await scenario('Suppression de role, serveur 500 :', () => ko(500, {}),
    "supprimerRole('PO')", (d) => d.getElementById('erreurRole').textContent, pasBrut);
  await scenario('Suppression de role, erreur metier conservee :', () => ko(409, { error: 'Role utilise.' }),
    "supprimerRole('PO')", (d) => d.getElementById('erreurRole').textContent,
    (t) => check(t === 'Role utilise.', `message du serveur conserve (recu « ${t} »)`));
  await scenario('Fusion, serveur 500 :', () => ko(500, {}),
    "document.getElementById('fusionSource').value = 'a'; document.getElementById('fusionCible').value = 'b'; fusionner()",
    (d) => d.getElementById('resultatFusion').innerHTML, pasBrut);
  await scenario('Fusion, reseau coupe :', () => Promise.reject(new TypeError('failed')),
    "document.getElementById('fusionSource').value = 'a'; document.getElementById('fusionCible').value = 'b'; fusionner()",
    (d) => d.getElementById('resultatFusion').innerHTML, (t) => check(t !== '', 'un message est affiche'));

  const lignes = html.split('\n').filter((l) => /\bfetch\(/.test(l) && /POST|DELETE|PUT/.test(l));
  check(lignes.length === 0, `plus d'appel fetch( brut en POST/DELETE sur une seule ligne (${lignes.length})`);

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
