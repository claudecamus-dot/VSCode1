// repondre.html : envoi d'un pilier / soumission (node:vm, meme principe que
// test-repondre-chargement-parallele.js).
//  1. envoiEnCours est remis a false sur CHAQUE chemin (succes, echec) ;
//  2. le pilier suivant se calcule depuis le pilier VALIDE a l'envoi, pas depuis
//     le pilier affiche a la fin (la navigation reste possible pendant le PUT) ;
//  3. une erreur serveur n'affiche jamais « HTTP 500 » brut.
// FRONT_PAGE_OVERRIDE permet de rejouer le test sur une copie (mutants, etat initial).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = process.env.FRONT_PAGE_OVERRIDE || path.join(__dirname, '..', 'src', 'public', 'repondre.html');
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL : script inline introuvable'); process.exit(1); }
const source = m[1].replace(/\n\s*init\(\);\s*$/, '\n');

function creerSandbox(reponseServeur) {
  const elements = new Map();
  const faux = (id) => ({
    id, textContent: '', innerHTML: '', value: '', disabled: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, faux(id)); return elements.get(id); },
    querySelector: () => null, querySelectorAll: () => [],
  };
  const sandbox = {
    document, URL, URLSearchParams, console, setTimeout, clearTimeout,
    window: { location: { search: '?session=s1', href: 'http://x/repondre.html?session=s1' }, history: { replaceState() {} } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, alert() {},
    esc: (v) => String(v),
    fetch: (chemin, options) => reponseServeur(chemin, options),
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'fetch-json.js'), 'utf8'), sandbox);
  vm.runInContext(source, sandbox, { filename: 'repondre.html#inline' });
  // Ecrans neutralises : on mesure l'etat, pas le rendu.
  vm.runInContext('rendreNavigation = () => {}; rendrePilierCourant = () => {};', sandbox);
  return { sandbox, document };
}

const ok = (corps) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corps) });
const ko = (status, corps) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(corps) });
const pilier = (id, qid) => ({ id, nom: `P${id}`, sousCategories: [{ questions: [{ id: qid }] }] });

function armer(sandbox, { actif }) {
  vm.runInContext(`
    referentiel = [${JSON.stringify(pilier(1, 11))}, ${JSON.stringify(pilier(2, 22))}, ${JSON.stringify(pilier(3, 33))}];
    repondant = { id: 'r1' };
    reponsesEnCours = { 11: 2 };
    pilierActifIndex = ${actif};
    piliersSauvegardes = new Set();
    envoiEnCours = false;
  `, sandbox);
}

async function main() {
  console.log('Succes du PUT : flag remis a false, pilier suivant calcule depuis le pilier valide :');
  {
    let liberer;
    const attente = new Promise((r) => { liberer = r; });
    const { sandbox } = creerSandbox(async () => { await attente; return ok({}); });
    armer(sandbox, { actif: 0 });
    const p = vm.runInContext('validerPilierCourant(referentiel[0])', sandbox);
    check(vm.runInContext('envoiEnCours', sandbox) === true, 'pendant le PUT, envoiEnCours est a true');
    vm.runInContext('pilierActifIndex = 2', sandbox); // l'utilisateur navigue vers P3 pendant l'envoi
    liberer();
    await p;
    check(vm.runInContext('envoiEnCours', sandbox) === false, 'apres succes, envoiEnCours est a false');
    check(vm.runInContext('pilierActifIndex', sandbox) === 1, `le suivant est P2 (index 1) malgre la navigation pendant l'envoi (recu ${vm.runInContext('pilierActifIndex', sandbox)})`);
  }

  console.log('Echec 500 : flag remis a false, bouton reactive, message lisible :');
  {
    const { sandbox, document } = creerSandbox(() => ko(500, {}));
    armer(sandbox, { actif: 0 });
    await vm.runInContext('validerPilierCourant(referentiel[0])', sandbox);
    check(vm.runInContext('envoiEnCours', sandbox) === false, 'apres echec, envoiEnCours est a false');
    const msg = document.getElementById('erreurAction').textContent;
    check(msg !== '' && !/HTTP\s*\d{3}/.test(msg), `message sans « HTTP 500 » brut (recu « ${msg} »)`);
    check(/serveur/i.test(msg), 'message francais explicite pour une erreur serveur');
  }

  console.log('Soumission finale en echec 500 :');
  {
    const { sandbox, document } = creerSandbox(() => ko(500, {}));
    armer(sandbox, { actif: 0 });
    await vm.runInContext('soumettre()', sandbox);
    check(vm.runInContext('envoiEnCours', sandbox) === false, 'apres echec de soumission, envoiEnCours est a false');
    const msg = document.getElementById('erreurAction').textContent;
    check(msg !== '' && !/HTTP\s*\d{3}/.test(msg), `message sans « HTTP 500 » brut (recu « ${msg} »)`);
  }

  console.log('Erreur metier (message serveur) : conservee telle quelle :');
  {
    const { sandbox, document } = creerSandbox(() => ko(409, { error: 'Session fermee.' }));
    armer(sandbox, { actif: 0 });
    await vm.runInContext('validerPilierCourant(referentiel[0])', sandbox);
    check(document.getElementById('erreurAction').textContent === 'Session fermee.', "le message du serveur reste affiche");
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
