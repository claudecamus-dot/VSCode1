// Console animateur : un localStorage illisible ne doit plus emporter TOUTE la
// page (constat robustesse de l'audit-technique du 2026-09-09).
//
// `chargerTemplates()` faisait deux `JSON.parse` NUS sur localStorage, et c'est
// la premiere des dix initialisations du script inline d'admin.html. La levee
// (JSON tronque par un quota atteint, ecriture concurrente d'un autre onglet,
// valeur posee a la main, stockage desactive ou `getItem` lui-meme leve)
// arretait le script AVANT tout le reste : import du referentiel, creation de
// session, roles, perimetre, invites, fusion, onglets. Une valeur cosmetique
// (le modele d'email) cassait donc l'outil entier.
//
// Ce test EXECUTE reellement le script inline (node:vm, meme principe que
// test-restitution-rejets-geres.js) et verifie DEUX choses distinctes : les
// modeles retombent sur les valeurs par defaut, ET le reste du script a bien
// tourne jusqu'au bout (dernier branchement d'evenement de la page attache).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = path.join(__dirname, '..', 'src', 'public', 'admin.html');

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) {
  console.error('FAIL : script inline introuvable dans admin.html');
  process.exit(1);
}
const source = m[1];

function fauxElement(id) {
  const ecoutes = {};
  return {
    id,
    ecoutes,
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    checked: false,
    files: [],
    dataset: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        const present = this._set.has(c);
        const next = force === undefined ? !present : force;
        if (next) this._set.add(c); else this._set.delete(c);
        return next;
      },
      contains(c) { return this._set.has(c); },
    },
    addEventListener(evt, fn) { (ecoutes[evt] = ecoutes[evt] || []).push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

// `localStorageImpl` : soit un objet de valeurs brutes (chaines telles que
// stockees), soit la chaine 'leve' pour simuler un stockage desactive, ou
// `getItem` lui-meme jette (navigation privee de certains navigateurs).
function executerPage(localStorageImpl) {
  const elements = new Map();
  const boutonOnglet = fauxElement('faux-onglet');
  boutonOnglet.dataset.tab = 'import';

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fauxElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll(selecteur) {
      return selecteur === '.tab-button' ? [boutonOnglet] : [];
    },
  };
  const window = {
    location: { origin: 'http://127.0.0.1', search: '', href: 'http://127.0.0.1/admin.html' },
    confirm: () => false,
    open() {},
  };
  const localStorage = localStorageImpl === 'leve'
    ? {
      getItem() { throw new DOMExceptionSimulee('acces au stockage refuse'); },
      setItem() { throw new DOMExceptionSimulee('acces au stockage refuse'); },
    }
    : {
      getItem: (cle) => (Object.prototype.hasOwnProperty.call(localStorageImpl, cle) ? localStorageImpl[cle] : null),
      setItem() {},
    };

  const avertissements = [];
  const sandbox = {
    document,
    window,
    localStorage,
    URL,
    URLSearchParams,
    FormData: class { append() {} },
    console: { ...console, warn: (...args) => { avertissements.push(args.join(' ')); } },
    setTimeout,
    clearTimeout,
    esc: (v) => String(v),
    alert() {},
    // Aucun appel reseau ne doit etre necessaire pour que la page finisse de
    // s'initialiser : les chargements asynchrones repondent une liste vide.
    fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') }),
  };
  vm.createContext(sandbox);

  let leve = null;
  try {
    vm.runInContext(source, sandbox, { filename: 'admin.html#inline' });
  } catch (err) {
    leve = err;
  }
  return { sandbox, document, elements, boutonOnglet, leve, avertissements };
}

class DOMExceptionSimulee extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}

const DEFAUT_SUJET_INVITATION = 'Invitation : évaluation de maturité agile/produit de votre équipe';
const DEFAUT_SUJET_RAPPEL = 'Rappel : évaluation de maturité agile/produit';

// Dernier branchement d'evenement du script (section « fusion », tout en bas) :
// s'il est attache, c'est que l'execution a traverse chargerTemplates() ET les
// neuf initialisations qui suivent.
function pageInitialiseeJusquAuBout(document) {
  const bouton = document.getElementById('btnFusionner');
  return Array.isArray(bouton.ecoutes.click) && bouton.ecoutes.click.length > 0;
}

console.log('Cas nominal : un modele valide en localStorage est bien repris :');
{
  const { document, leve } = executerPage({
    templateInvitation: JSON.stringify({ sujet: 'Sujet maison', corps: 'Corps maison' }),
    templateRappel: JSON.stringify({ sujet: 'Rappel maison', corps: 'Corps rappel maison' }),
  });
  check(leve === null, `le script s'execute sans lever (${leve && leve.message})`);
  check(document.getElementById('sujetInvitation').value === 'Sujet maison', 'le sujet d\'invitation stocke est applique');
  check(document.getElementById('contenuRappel').value === 'Corps rappel maison', 'le corps de rappel stocke est applique');
  check(pageInitialiseeJusquAuBout(document), 'la page s\'initialise jusqu\'au bout');
}

console.log('\nlocalStorage ILLISIBLE : modeles par defaut, et la page vit :');
for (const [libelle, valeurs] of [
  ['JSON tronque', { templateInvitation: '{"sujet":"Invit', templateRappel: '{"sujet":"Rap' }],
  ['valeur non-JSON posee a la main', { templateInvitation: 'ceci nest pas du json', templateRappel: 'non plus' }],
  ['une seule des deux cles abimee', { templateInvitation: '{{{', templateRappel: JSON.stringify({ sujet: 'Rappel maison', corps: 'Corps rappel maison' }) }],
]) {
  const { document, leve, avertissements } = executerPage(valeurs);
  console.log(`  — ${libelle} :`);
  check(leve === null, `le script inline s'execute jusqu'au bout, sans levee (${leve && leve.message})`);
  check(
    document.getElementById('sujetInvitation').value === DEFAUT_SUJET_INVITATION,
    'le modele d\'invitation retombe sur le modele par defaut'
  );
  check(document.getElementById('contenuInvitation').value.length > 0, 'le corps d\'invitation par defaut est rempli (pas de champ vide)');
  check(pageInitialiseeJusquAuBout(document), 'la console animateur est initialisee jusqu\'au bout (import, sessions, roles, perimetre, fusion, onglets)');
  check(avertissements.some((a) => /illisible/i.test(a)), 'l\'incident est signale en console (console.warn), pas avale en silence');
}

console.log('\n  — une seule cle abimee : l\'AUTRE modele, lui, reste celui de l\'utilisateur :');
{
  const { document } = executerPage({ templateInvitation: '{{{', templateRappel: JSON.stringify({ sujet: 'Rappel maison', corps: 'Corps rappel maison' }) });
  check(document.getElementById('sujetRappel').value === 'Rappel maison', 'le modele de rappel VALIDE est conserve (le repli est par cle, pas global)');
  check(document.getElementById('sujetInvitation').value === DEFAUT_SUJET_INVITATION, 'seul le modele abime retombe sur le defaut');
}

console.log('\nStockage inaccessible (getItem leve : navigation privee, stockage desactive) :');
{
  const { document, leve } = executerPage('leve');
  check(leve === null, `le script s'execute quand meme (${leve && leve.message})`);
  check(document.getElementById('sujetRappel').value === DEFAUT_SUJET_RAPPEL, 'les deux modeles retombent sur les valeurs par defaut');
  check(pageInitialiseeJusquAuBout(document), 'la console animateur est initialisee jusqu\'au bout');
}


console.log('\nEcriture impossible (quota atteint, stockage desactive) : sauvegarderTemplates() le DIT :');
{
  const { sandbox, document, leve } = executerPage('leve');
  check(leve === null, 'la page s\'est initialisee malgre le stockage inaccessible');
  let leveALaSauvegarde = null;
  try {
    sandbox.sauvegarderTemplates();
  } catch (err) {
    leveALaSauvegarde = err;
  }
  check(leveALaSauvegarde === null, `sauvegarderTemplates() ne laisse pas fuir la levee (recu ${leveALaSauvegarde && leveALaSauvegarde.message})`);
  const message = document.getElementById('resultatTemplates').innerHTML;
  check(message.length > 0, 'un message est affiche a l\'animateur (pas un silence)');
  check(/result err/.test(message), 'le message est un ECHEC, pas le « Modèles sauvegardés » d\'un succes qui n\'a pas eu lieu');
}

console.log('\n  — non-regression : quand l\'ecriture PASSE, le message de succes revient :');
{
  const { sandbox, document } = executerPage({});
  sandbox.sauvegarderTemplates();
  const message = document.getElementById('resultatTemplates').innerHTML;
  check(/result ok/.test(message) && /sauvegard/i.test(message), 'message de succes affiche');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
