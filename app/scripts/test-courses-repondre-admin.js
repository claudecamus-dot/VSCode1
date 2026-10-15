// Courses (reponses qui se croisent), double clics et erreurs serveur sur
// repondre.html et admin.html (audit du comite de revue du 2026-10-14).
//
// Meme principe que test-repondre-chargement-parallele.js : le script inline est
// EXECUTE dans node:vm avec un DOM minimal et un fetch() pilote par le test
// (reponses retenues puis liberees a la demande), apres injection de
// /fetch-json.js comme le fait la page par <script src>.
//
// Prouve :
//  (a) PUT retenu, radio change, PUT libere -> le pilier n'est PAS « sauvegarde »
//  (b) init() avec 500 / reseau coupe / roles en 500 -> pas de rejet, message affiche
//  (c) double clic « Continuer » / soumission / identification -> UNE requete,
//      bouton disabled pendant l'envoi puis reactive en cas d'echec
//  (d) admin : import disabled pendant le POST (double clic = 1 POST) ; liste de
//      destinataires en erreur -> message sans TypeError ; mailto trop long signale
//  (e) admin : la session choisie de l'onglet Resultats survit au rechargement
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', 'src', 'public');
const HELPER = fs.readFileSync(path.join(PUBLIC, 'fetch-json.js'), 'utf8');

let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}
const rejetsNonGeres = [];
process.on('unhandledRejection', (err) => { rejetsNonGeres.push(err); });
const tick = () => new Promise((r) => setTimeout(r, 10));

function differe() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
function rep(corps, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(corps) };
}

function fauxElement(id) {
  const ecoutes = {};
  let html = '';
  const el = {
    id, ecoutes, textContent: '', value: '', hidden: false, disabled: false, checked: false,
    files: [], dataset: {}, onInnerHTML: null,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        const next = force === undefined ? !this._set.has(c) : force;
        if (next) this._set.add(c); else this._set.delete(c);
        return next;
      },
      contains(c) { return this._set.has(c); },
    },
    addEventListener(evt, fn) { (ecoutes[evt] = ecoutes[evt] || []).push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) { html = String(v); if (el.onInnerHTML) el.onInnerHTML(html); },
  });
  return el;
}
const dernier = (el, evt) => el.ecoutes[evt][el.ecoutes[evt].length - 1];

function creerSandbox(fichier, { routes, search = '', origin = 'http://127.0.0.1' }) {
  const html = fs.readFileSync(path.join(PUBLIC, fichier), 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  // L'auto-invocation init(); de repondre.html partirait avant le scenario.
  const source = fichier === 'repondre.html' ? m[1].replace(/\n\s*init\(\);\s*$/, '\n') : m[1];
  const elements = new Map();
  const appels = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fauxElement(id));
      return elements.get(id);
    },
    querySelector(sel) { return sel.includes('modeImport') ? { value: 'ajouter' } : null; },
    querySelectorAll() { return []; },
  };
  const window = {
    location: { origin, search, href: `${origin}/${fichier}${search}` },
    history: { replaceState() {} },
    confirm: () => true,
    open() {},
  };
  const sandbox = {
    document, window, URL, URLSearchParams, setTimeout, clearTimeout,
    console: { ...console, warn() {} },
    FormData: class { append() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    alert() {},
    esc: (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    fetch: (chemin, options = {}) => {
      const methode = options.method || 'GET';
      appels.push({ chemin, methode });
      for (const [motif, handler] of routes) {
        if (motif.test(`${methode} ${chemin}`)) return Promise.resolve(handler(chemin, options));
      }
      return Promise.resolve(rep([]));
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(HELPER, sandbox, { filename: 'fetch-json.js' });
  vm.runInContext(source, sandbox, { filename: `${fichier}#inline` });
  return { sandbox, document, elements, appels, window };
}
const compte = (appels, methode, re) => appels.filter((a) => a.methode === methode && re.test(a.chemin)).length;

// ---------------------------------------------------------------- repondre
const SESSION = 'session-test-abc';
const REFERENTIEL = [{
  id: 1, nom: 'Pilier 1',
  sousCategories: [{ nom: 'Objectif', questions: [{ id: 10, texte: 'Q?', niveaux: [{ niveau: 1, texte: 'un' }, { niveau: 2, texte: 'deux' }] }] }],
}];

function creerRepondre(extraRoutes = []) {
  const ctx = creerSandbox('repondre.html', {
    search: `?session=${SESSION}`,
    routes: [
      ...extraRoutes,
      [/^GET \/api\/repondants\/r1$/, () => rep({ id: 'r1', session_id: SESSION, reponses: [], soumis_at: null })],
      [/^GET \/api\/sessions\/[^/]+\/referentiel$/, () => rep(REFERENTIEL)],
      [/^GET \/api\/sessions\/[^/]+$/, () => rep({ texte_intro: 'Bonjour', statut: 'ouverte' })],
    ],
  });
  // Radios « vivants » : chaque rendu du pilier en recree (comme le innerHTML reel).
  const zone = ctx.document.getElementById('zonePilierCourant');
  ctx.radios = [];
  zone.querySelectorAll = (sel) => {
    if (!sel.includes('radio')) return [];
    ctx.radios = [1, 2].map((n) => Object.assign(fauxElement(`r${n}`), { name: 'q10', value: String(n) }));
    return ctx.radios;
  };
  ctx.choisir = (n) => dernier(ctx.radios[n - 1], 'change')();
  ctx.sauvegarde = () => vm.runInContext('piliersSauvegardes.has(1)', ctx.sandbox);
  return ctx;
}

async function main() {
  console.log('(a) PUT retenu, radio change pendant l\'envoi, PUT libere -> pilier NON sauvegarde :');
  {
    const put = differe();
    const ctx = creerRepondre([[/^PUT /, () => put.promise]]);
    await ctx.sandbox.chargerRepondant('r1');
    ctx.choisir(1);
    const bouton = ctx.document.getElementById('btnValiderPilier');
    dernier(bouton, 'click')();
    await tick();
    ctx.choisir(2); // changement PENDANT le PUT
    put.resolve(rep({ ok: true }));
    await tick();
    check(compte(ctx.appels, 'PUT', /reponses$/) === 1, 'un seul PUT part');
    check(ctx.sauvegarde() === false, 'le pilier n\'est PAS marque sauvegarde (la valeur envoyee est obsolete)');
    check(/modifié une réponse/.test(ctx.document.getElementById('erreurAction').textContent), "l'utilisateur est invite a re-valider");

    // Temoin positif : sans changement pendant l'envoi, le pilier est bien sauvegarde.
    const put2 = differe();
    const ctx2 = creerRepondre([[/^PUT /, () => put2.promise]]);
    await ctx2.sandbox.chargerRepondant('r1');
    ctx2.choisir(1);
    dernier(ctx2.document.getElementById('btnValiderPilier'), 'click')();
    await tick();
    put2.resolve(rep({ ok: true }));
    await tick();
    check(ctx2.sauvegarde() === true, 'temoin : sans changement pendant l\'envoi, le pilier est sauvegarde');
  }

  console.log('\n(b) init() : 500, reseau coupe, roles en 500 -> pas de rejet, message visible :');
  for (const [libelle, routes] of [
    ['session en 500', [[/^GET \/api\/sessions\/[^/]+$/, () => rep({ error: 'boom' }, 500)]]],
    ['reseau coupe', [[/./, () => { throw new Error('reseau'); }]]],
    ['roles en 500', [
      [/^GET \/api\/sessions\/[^/]+\/roles$/, () => rep({ error: 'roles KO' }, 500)],
      [/^GET \/api\/sessions\/[^/]+$/, () => rep({ texte_intro: 'Bonjour', statut: 'ouverte' })],
    ]],
  ]) {
    const avant = rejetsNonGeres.length;
    const ctx = creerSandbox('repondre.html', { search: `?session=${SESSION}`, routes });
    let leve = null;
    try { await ctx.sandbox.init(); } catch (e) { leve = e; }
    await tick();
    check(leve === null && rejetsNonGeres.length === avant, `${libelle} : init() ne rejette pas (${leve && leve.message})`);
    check(/Impossible de charger/.test(ctx.document.getElementById('zoneStatutSession').innerHTML), `${libelle} : message visible affiche`);
  }

  console.log('\n(c) double clic -> UNE requete, bouton disabled pendant l\'envoi :');
  {
    const put = differe();
    const ctx = creerRepondre([[/^PUT /, () => put.promise]]);
    await ctx.sandbox.chargerRepondant('r1');
    ctx.choisir(1);
    const bouton = ctx.document.getElementById('btnValiderPilier');
    dernier(bouton, 'click')();
    dernier(bouton, 'click')();
    await tick();
    check(compte(ctx.appels, 'PUT', /reponses$/) === 1, '« Continuer » double-clique : 1 seul PUT');
    check(bouton.disabled === true, '« Continuer » est disabled pendant l\'envoi');
    put.resolve(rep({ ok: true }));
    await tick();

    // Soumission (le pilier unique est maintenant sauvegarde et complet).
    const post = differe();
    const ctx3 = creerRepondre([[/^PUT /, () => rep({ ok: true })], [/\/soumission$/, () => post.promise]]);
    await ctx3.sandbox.chargerRepondant('r1');
    ctx3.choisir(1);
    dernier(ctx3.document.getElementById('btnValiderPilier'), 'click')();
    await tick();
    const btnS = ctx3.document.getElementById('btnSoumettre');
    dernier(btnS, 'click')();
    dernier(btnS, 'click')();
    await tick();
    check(compte(ctx3.appels, 'POST', /soumission$/) === 1, 'soumission double-cliquee : 1 seul POST');
    check(btnS.disabled === true, 'le bouton de soumission est disabled pendant l\'envoi');
    post.resolve(rep({ error: 'refus' }, 409));
    await tick();
    check(btnS.disabled === false, 'bouton de soumission reactive apres un echec');
    check(ctx3.document.getElementById('erreurAction').textContent === 'refus', 'message d\'erreur du serveur affiche');

    // Identification
    const ident = differe();
    const ctx4 = creerSandbox('repondre.html', {
      search: `?session=${SESSION}`,
      routes: [[/\/repondants$/, () => ident.promise]],
    });
    const btnI = fauxElement('btnIdent');
    ctx4.document.getElementById('formIdentification').querySelector = () => btnI;
    const soumettreForm = dernier(ctx4.document.getElementById('formIdentification'), 'submit');
    soumettreForm({ preventDefault() {} });
    soumettreForm({ preventDefault() {} });
    await tick();
    check(compte(ctx4.appels, 'POST', /repondants$/) === 1, 'identification double-soumise : 1 seul POST');
    check(btnI.disabled === true, 'le bouton d\'identification est disabled pendant l\'envoi');
    ident.resolve(rep({ error: 'email invalide' }, 400));
    await tick();
    check(btnI.disabled === false, 'bouton d\'identification reactive apres un echec');
    check(ctx4.document.getElementById('erreurIdentification').textContent === 'email invalide', 'erreur d\'identification affichee');
  }

  console.log("\n(h) repondre : si le chargement du referentiel echoue apres l'identification, le formulaire revient avec un message :");
  {
    const ctxH = creerSandbox('repondre.html', {
      search: `?session=${SESSION}`,
      routes: [
        [/^POST \/api\/sessions\/[^/]+\/repondants$/, () => rep({ id: 'r1' })],
        [/^GET \/api\/repondants\/r1$/, () => rep({ id: 'r1', session_id: SESSION, reponses: [], soumis_at: null })],
        [/^GET \/api\/sessions\/[^/]+\/referentiel$/, () => rep({ error: 'referentiel indisponible' }, 500)],
      ],
    });
    const formH = ctxH.document.getElementById('formIdentification');
    formH.querySelector = () => fauxElement('btnIdentH');
    dernier(formH, 'submit')({ preventDefault() {} });
    await tick();
    await tick();
    const messageH = ctxH.document.getElementById('erreurIdentification').textContent;
    check(formH.classList.contains('hidden') === false, "le formulaire d'identification est re-affiche (l'erreur est visible)");
    check(/referentiel indisponible/.test(messageH), `la cause est affichee (recu « ${messageH} »)`);
    check(/Rechargez la page/.test(messageH), "le message dit comment reprendre (le repondant existe deja)");
  }

  console.log('\n(i) admin : un message d\'erreur serveur est echappe avant innerHTML :');
  {
    const charge = '<img src=x onerror=alert(1)>';
    const ctxI = creerSandbox('admin.html', {
      routes: [[/^POST \/api\/referentiel\/import$/, () => rep({ error: charge }, 400)]],
    });
    ctxI.document.getElementById('fichierExcel').files = [{ name: 'a.xlsx' }];
    dernier(ctxI.document.getElementById('btnImporter'), 'click')();
    await tick();
    const sortie = ctxI.document.getElementById('resultatImport').innerHTML;
    check(!sortie.includes('<img'), `aucune balise <img> brute dans resultatImport (recu « ${sortie} »)`);
    check(sortie.includes('&lt;img'), 'le message est affiche echappe');
  }

  // ------------------------------------------------------------------ admin
  console.log('\n(d) admin : import disabled pendant le POST ; destinataires en erreur ; mailto trop long :');
  {
    const post = differe();
    const ctx = creerSandbox('admin.html', {
      routes: [[/^POST \/api\/referentiel\/import$/, () => post.promise], [/^POST \/api\/sessions\/[^/]+\/invites$/, () => post.promise]],
    });
    ctx.document.getElementById('fichierExcel').files = [{ name: 'a.xlsx' }];
    const btn = ctx.document.getElementById('btnImporter');
    dernier(btn, 'click')();
    dernier(btn, 'click')();
    await tick();
    check(compte(ctx.appels, 'POST', /referentiel\/import$/) === 1, 'import double-clique : 1 seul POST');
    check(btn.disabled === true, 'le bouton d\'import est disabled pendant l\'envoi');
    post.resolve(rep({ error: 'fichier invalide' }, 400));
    await tick();
    check(btn.disabled === false, 'bouton d\'import reactive (finally)');
    check(/fichier invalide/.test(ctx.document.getElementById('resultatImport').innerHTML), 'erreur d\'import affichee');

    const post2 = differe();
    const ctxP = creerSandbox('admin.html', { routes: [[/^POST \/api\/sessions\/[^/]+\/invites$/, () => post2.promise]] });
    ctxP.document.getElementById('idSession').value = 'sess1';
    ctxP.document.getElementById('fichierParticipants').files = [{ name: 'p.csv' }];
    const btnP = ctxP.document.getElementById('btnImporterParticipants');
    dernier(btnP, 'click')();
    dernier(btnP, 'click')();
    await tick();
    check(compte(ctxP.appels, 'POST', /invites$/) === 1, 'import des invites double-clique : 1 seul POST');
    check(btnP.disabled === true, 'le bouton d\'import des invites est disabled pendant l\'envoi');
    post2.resolve(rep({ invites: 2 }));
    await tick();
    check(btnP.disabled === false, 'bouton d\'import des invites reactive');

    // Liste de destinataires en erreur
    const session = rep({ fermeture_at: '2026-12-01T10:00:00.000Z' });
    const avant = rejetsNonGeres.length;
    const ctxE = creerSandbox('admin.html', {
      routes: [
        [/^GET \/api\/sessions\/sess1\/invites$/, () => rep({ error: 'liste indisponible' }, 500)],
        [/^GET \/api\/sessions\/sess1$/, () => session],
      ],
    });
    ctxE.document.getElementById('idSession').value = 'sess1';
    let leve = null;
    try { await ctxE.sandbox.construireMailto('invitation'); } catch (e) { leve = e; }
    check(leve === null && rejetsNonGeres.length === avant, `liste en erreur : pas de TypeError (${leve && leve.message})`);
    check(ctxE.document.getElementById('erreurEmail').textContent === 'liste indisponible', 'liste en erreur : message visible');

    // mailto trop long / court
    for (const [libelle, n, attendu] of [['trop long', 120, false], ['court', 3, true]]) {
      const invites = Array.from({ length: n }, (_, i) => ({ email: `personne.numero${i}@exemple-entreprise.com` }));
      const c = creerSandbox('admin.html', {
        routes: [
          [/^GET \/api\/sessions\/sess1\/invites$/, () => rep(invites)],
          [/^GET \/api\/sessions\/sess1$/, () => session],
        ],
      });
      c.document.getElementById('idSession').value = 'sess1';
      await c.sandbox.construireMailto('invitation');
      const ouvert = String(c.window.location.href).startsWith('mailto:');
      check(ouvert === attendu, `mailto ${libelle} (${n} destinataires) : ${attendu ? 'ouvert' : 'NON ouvert'}`);
      if (!attendu) check(/trop longue/.test(c.document.getElementById('erreurEmail').textContent), 'mailto trop long : message affiche');
    }
  }

  console.log('\n(e) admin : la session choisie de l\'onglet Resultats est conservee :');
  {
    const sessions = [
      { id: 'aaaaaaaa-1', ouverture_at: '2026-01-01T00:00:00Z', fermeture_at: '2026-02-01T00:00:00Z' },
      { id: 'bbbbbbbb-2', ouverture_at: '2026-03-01T00:00:00Z', fermeture_at: '2026-04-01T00:00:00Z' },
    ];
    const ctx = creerSandbox('admin.html', { routes: [[/^GET \/api\/sessions$/, () => rep(sessions)]] });
    const select = ctx.document.getElementById('sessionResultats');
    // <select> realiste : reconstruire les options remet la valeur a la 1re option.
    let valeur = '';
    select.onInnerHTML = (h) => { const ids = [...h.matchAll(/value="([^"]*)"/g)].map((x) => x[1]); if (!ids.includes(valeur)) valeur = ids[0] || ''; };
    Object.defineProperty(select, 'value', {
      get: () => valeur,
      set: (v) => { const ids = [...select.innerHTML.matchAll(/value="([^"]*)"/g)].map((x) => x[1]); if (ids.includes(v)) valeur = v; },
    });
    await ctx.sandbox.chargerSessionsResultats();
    check(select.value === 'aaaaaaaa-1', 'premier chargement : 1re session selectionnee');
    select.value = 'bbbbbbbb-2';
    // Le navigateur remet la valeur a la 1re option lors de la reconstruction : on le simule.
    select.onInnerHTML = (h) => { valeur = ([...h.matchAll(/value="([^"]*)"/g)][0] || [])[1] || ''; };
    await ctx.sandbox.chargerSessionsResultats();
    check(select.value === 'bbbbbbbb-2', 'apres retour sur l\'onglet : la session choisie est conservee');
    check(ctx.document.getElementById('statutSessionResultats').textContent.includes('bbbbbbbb'), 'le statut reflete la session conservee');
  }

  check(rejetsNonGeres.length === 0, `aucun rejet de promesse non gere sur toute la suite (${rejetsNonGeres.length})`);
  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
