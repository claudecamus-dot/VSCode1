// Verrou "courses de reponses" sur resultats.html et pilotage.html (audit du comite
// de revue du 2026-10-14) : les chargeurs sans garde de sequence laissaient la
// reponse TARDIVE de l'equipe A ecraser le textarea et les panneaux de l'equipe B,
// et « Enregistrer » envoyait alors le texte de A sous l'equipe B.
//
// Le script inline de chaque page est EXECUTE dans node:vm (DOM minimal) avec un
// fetch() dont les reponses sont des promesses liberees A LA MAIN, dans le desordre.
// Variable d'environnement : PAGE_RESULTATS / PAGE_PILOTAGE = chemin alternatif
// (copies mutantes, clause MUTATION).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUB = path.join(__dirname, '..', 'src', 'public');
const PAGE_RESULTATS = process.env.PAGE_RESULTATS || path.join(PUB, 'resultats.html');
const PAGE_PILOTAGE = process.env.PAGE_PILOTAGE || path.join(PUB, 'pilotage.html');

let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

const rejetsNonGeres = [];
process.on('unhandledRejection', (r) => rejetsNonGeres.push(r));
const tick = () => new Promise((r) => setImmediate(r));
async function laisserPasser(n = 6) { for (let i = 0; i < n; i += 1) await tick(); }

function extraire(fichier) {
  const html = fs.readFileSync(fichier, 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
  if (!m) { console.error(`FAIL : script inline introuvable dans ${fichier}`); process.exit(1); }
  // Retire l'auto-invocation init(); finale.
  return { html, source: m[1].replace(/\n\s*init\(\);\s*$/, '\n') };
}

function fauxElement(id) {
  const listeners = {};
  return {
    id, textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, checked: false, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    _listeners: listeners,
    // attacherRepli() de resultats.html lit headerEl.nextElementSibling.classList : sans lui, init() rejette
    // avant de brancher les ecouteurs de la page.
    get nextElementSibling() { return fauxElement(id + '-suivant'); },
    querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, remove() {}, click() {},
  };
}

// fetch controle : chaque appel est consigne ; `repondre` decide de la reponse
// (objet => promesse deja resolue, 'attendre' => promesse liberee a la main).
function creerSandbox(source, { search, repondre }) {
  const elements = new Map();
  const appels = [];
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, fauxElement(id)); return elements.get(id); },
    querySelectorAll() { return []; },
    createElement() { return fauxElement('a'); },
    body: { appendChild() {} },
  };
  const sandbox = {
    document, window: { location: { search } }, URLSearchParams, console,
    esc: (v) => String(v), encodeURIComponent,
    confirm: () => true,
    alert: () => {},
    Classement: { aplatirQuestions: () => [], classerPointsAttention: () => ({ dispersion: [], faibles: [] }), classerPointsForts: () => ({ hauts: [], accords: [] }) },
    StatsPartagees: { moyenneDe: () => null },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    fetch(url, options) {
      const appel = { url: String(url), options, liberer: null };
      appels.push(appel);
      const rep = repondre(appel);
      if (rep && rep.attendre) {
        return new Promise((resolve, reject) => {
          appel.liberer = (corps, ok = true, statut = 200) => resolve({ ok, status: statut, json: async () => corps });
          appel.echouer = (err) => reject(err);
        });
      }
      return Promise.resolve({ ok: rep.ok !== false, status: rep.status || 200, json: async () => rep.corps, blob: async () => ({}) });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'fetch-json.js'), 'utf8'), sandbox, { filename: 'fetch-json.js' });
  vm.runInContext(source, sandbox, { filename: 'page#inline' });
  return { sandbox, document, appels, elements };
}

const trouver = (appels, fragment, equipe) =>
  appels.find((a) => a.url.includes(fragment) && (equipe === undefined || a.url.includes(`equipe=${encodeURIComponent(equipe)}`)));

const PILIERS_VIDES = [];
const resultatsDe = (nom) => ({ effectif: 1, effectifTotal: 1, repondants: { soumis: [{ prenom: nom, nom: 'X' }], nonSoumis: [] }, piliers: PILIERS_VIDES });

async function main() {
  const { html: htmlRes, source: srcRes } = extraire(PAGE_RESULTATS);
  const { html: htmlPil, source: srcPil } = extraire(PAGE_PILOTAGE);

  console.log('(c) Option vide : value="" (assertion statique) et garde declenchee :');
  check(/<option value="">Aucune équipe avec réponses soumises<\/option>/.test(htmlRes), 'l\'option « Aucune équipe… » porte value=""');
  check(!/<option>Aucune/.test(htmlRes), 'plus aucune <option> sans attribut value');
  check(/<script src="\/fetch-json\.js"><\/script>/.test(htmlRes) && /<script src="\/fetch-json\.js"><\/script>/.test(htmlPil), 'les deux pages chargent /fetch-json.js (sans defer)');
  {
    // Le serveur ne renvoie aucune equipe : on rejoue l'option dans un faux <select>
    // qui, comme le navigateur, renvoie la value de l'option ('' si value="").
    const { sandbox, document, appels } = creerSandbox(srcRes, {
      search: '?session=S1',
      repondre: () => ({ corps: [] }),
    });
    const select = document.getElementById('equipe');
    Object.defineProperty(select, 'innerHTML', {
      get() { return this._h || ''; },
      set(h) {
        this._h = h;
        const m = /<option(?: value="([^"]*)")?>([^<]*)<\/option>/.exec(h);
        this.value = m ? (m[1] !== undefined ? m[1] : m[2]) : '';
      },
    });
    document.getElementById('avecManager').checked = true;
    await sandbox.chargerEquipes();
    check(select.value === '', `select.value vaut '' pour la liste vide (recu ${JSON.stringify(select.value)})`);
    document.getElementById('pointsForts').innerHTML = 'ANCIEN';
    const avant = appels.length;
    await sandbox.chargerResultats();
    check(appels.length === avant, 'la garde « pas d\'equipe » se declenche : aucun fetch /resultats');
    check(document.getElementById('pointsForts').innerHTML === '', 'les panneaux sont vides');
  }

  console.log('\n(a) resultats : la reponse tardive de A n\'ecrase ni le textarea ni les panneaux de B :');
  {
    const { sandbox, document, appels } = creerSandbox(srcRes, {
      search: '?session=S1',
      repondre: () => ({ attendre: true }),
    });
    document.getElementById('avecManager').checked = true;
    document.getElementById('equipe').value = 'A';
    const pA = sandbox.chargerResultats();
    await laisserPasser();
    document.getElementById('equipe').value = 'B';
    const pB = sandbox.chargerResultats();
    await laisserPasser();
    const resB = trouver(appels, '/resultats?', 'B'), comB = trouver(appels, '/commentaire?', 'B');
    const resA = trouver(appels, '/resultats?', 'A'), comA = trouver(appels, '/commentaire?', 'A');
    const cmpA = trouver(appels, '/comparaison?', 'A'), cmpB = trouver(appels, '/comparaison?', 'B');
    check(resA && resB && comA && comB, 'les 4 requetes A et B sont parties');
    // B repond d'abord, puis A (tardive).
    resB.liberer(resultatsDe('Bob')); comB.liberer({ texte: 'COMMENTAIRE-B' }); cmpB.liberer({ disponible: false });
    await pB;
    check(document.getElementById('commentaire').value === 'COMMENTAIRE-B', 'textarea = commentaire de B apres sa reponse');
    check(document.getElementById('listeSoumis').innerHTML.includes('Bob'), 'panneau participants = B');
    resA.liberer(resultatsDe('Alice')); comA.liberer({ texte: 'COMMENTAIRE-A' }); cmpA.liberer({ disponible: false });
    await pA;
    await laisserPasser();
    check(document.getElementById('commentaire').value === 'COMMENTAIRE-B', 'la reponse tardive de A n\'ecrase pas le textarea de B');
    check(document.getElementById('listeSoumis').innerHTML.includes('Bob') && !document.getElementById('listeSoumis').innerHTML.includes('Alice'),
      'la reponse tardive de A n\'ecrase pas les panneaux de B');

    console.log('\n(b) resultats : l\'enregistrement n\'envoie pas le texte de A sous l\'equipe B :');
    appels.length = 0;
    // Nouveau scenario : A charge, l'utilisateur bascule sur B dont le commentaire
    // n'est pas encore arrive, et clique Enregistrer avec le texte de A.
  }
  {
    const { sandbox, document, appels } = creerSandbox(srcRes, {
      search: '?session=S1',
      repondre: (a) => (a.options && a.options.method === 'PUT' ? { corps: {} } : { attendre: true }),
    });
    document.getElementById('avecManager').checked = true;
    document.getElementById('equipe').value = 'A';
    const pA = sandbox.chargerResultats();
    await laisserPasser();
    trouver(appels, '/resultats?', 'A').liberer(resultatsDe('Alice'));
    trouver(appels, '/commentaire?', 'A').liberer({ texte: 'TEXTE-A' });
    trouver(appels, '/comparaison?', 'A').liberer({ disponible: false });
    await pA;
    check(document.getElementById('commentaire').value === 'TEXTE-A', 'A charge : textarea = TEXTE-A');
    document.getElementById('commentaire').value = 'TEXTE-A modifie';
    document.getElementById('equipe').value = 'B';
    const pB = sandbox.chargerResultats(); // commentaire de B pas encore arrive
    await laisserPasser();
    await sandbox.enregistrerCommentaire();
    check(!appels.some((a) => a.options && a.options.method === 'PUT'), 'aucun PUT envoye tant que le commentaire de B n\'est pas charge');
    check(/refus/i.test(document.getElementById('etatCommentaire').textContent), 'un message explicite refuse l\'enregistrement');
    // B arrive : l'enregistrement part maintenant, avec le texte de B et l'equipe B.
    trouver(appels, '/resultats?', 'B').liberer(resultatsDe('Bob'));
    trouver(appels, '/commentaire?', 'B').liberer({ texte: 'TEXTE-B' });
    trouver(appels, '/comparaison?', 'B').liberer({ disponible: false });
    await pB;
    await sandbox.enregistrerCommentaire();
    const put = appels.find((a) => a.options && a.options.method === 'PUT');
    const corps = put ? JSON.parse(put.options.body) : null;
    check(corps && corps.equipe === 'B' && corps.texte === 'TEXTE-B', `PUT = {equipe:B, texte:TEXTE-B} (recu ${put ? put.options.body : 'aucun PUT'})`);
  }

  console.log('\n(f) resultats : un commentaire en erreur ne vide pas des resultats valides :');
  {
    const { sandbox, document } = creerSandbox(srcRes, {
      search: '?session=S1',
      repondre: (a) => {
        if (a.url.includes('/commentaire?')) return { ok: false, status: 500, corps: { error: 'boom commentaire' } };
        if (a.url.includes('/comparaison?')) return { corps: { disponible: false } };
        return { corps: resultatsDe('Bob') };
      },
    });
    document.getElementById('avecManager').checked = true;
    document.getElementById('equipe').value = 'B';
    await sandbox.chargerResultats();
    await laisserPasser();
    check(document.getElementById('listeSoumis').innerHTML.includes('Bob'), "les resultats valides restent affiches malgre l'echec du commentaire");
    check(!/Erreur de chargement des résultats/.test(document.getElementById('zonePiliers').innerHTML), 'aucun message « Erreur de chargement des resultats »');
    check(/non chargé/.test(document.getElementById('etatCommentaire').textContent) && /boom commentaire/.test(document.getElementById('etatCommentaire').textContent),
      'le commentaire en echec est signale avec la cause');
    await sandbox.enregistrerCommentaire();
    check(/refus/i.test(document.getElementById('etatCommentaire').textContent), "l'enregistrement reste refuse (commentaire non charge)");
  }

  console.log('\n(g) resultats : la bascule « avec manager » demande confirmation si le commentaire est modifie :');
  {
    let confirmations = 0;
    let reponse = true;
    const { sandbox, document, appels } = creerSandbox(srcRes, {
      search: '?session=S1',
      repondre: (a) => {
        if (a.url.includes('/commentaire?')) return { corps: { texte: 'TEXTE-A' } };
        if (a.url.includes('/comparaison?')) return { corps: { disponible: false } };
        if (a.url.includes('/equipes')) return { corps: [{ equipe: 'A', n: 1 }] };
        return { corps: resultatsDe('Alice') };
      },
    });
    sandbox.confirm = () => { confirmations += 1; return reponse; };
    await sandbox.init(); // le harnais retire l'auto-invocation finale : on lance init() (il branche les ecouteurs)
    await laisserPasser();
    const caseManager = document.getElementById('avecManager');
    const ecouteurs = (caseManager._listeners.change || []);
    check(ecouteurs.length > 0, 'la page a branche un ecouteur change sur « avec manager »');
    caseManager.checked = false;
    document.getElementById('equipe').value = 'A';
    await sandbox.chargerResultats();
    check(document.getElementById('commentaire').value === 'TEXTE-A', 'commentaire de A charge (precondition)');
    document.getElementById('commentaire').value = 'TEXTE-A modifie';
    appels.length = 0;
    // Refus : la case revient, rien n'est recharge, le texte saisi est conserve.
    reponse = false;
    caseManager.checked = true; // l'utilisateur coche
    for (const fn of ecouteurs) await fn();
    check(confirmations === 1, `une confirmation demandee (recu ${confirmations})`);
    check(caseManager.checked === false, 'refus : la case revient a son etat precedent');
    check(appels.length === 0, 'refus : aucun rechargement');
    check(document.getElementById('commentaire').value === 'TEXTE-A modifie', 'refus : le texte saisi est conserve');
    // Acceptation : le rechargement part.
    reponse = true;
    caseManager.checked = true;
    for (const fn of ecouteurs) await fn();
    check(confirmations === 2, 'acceptation : confirmation demandee');
    check(appels.length > 0, 'acceptation : le rechargement part');
  }

  console.log('\n(d) pilotage : reponse inversee ignoree, erreur serveur sans exception non geree :');
  {
    const { sandbox, document, appels } = creerSandbox(srcPil, {
      search: '?session=S1',
      repondre: () => ({ attendre: true }),
    });
    document.getElementById('avecManager').checked = true;
    document.getElementById('departement').value = 'DEP-A';
    const pA = sandbox.chargerConsolidation();
    await laisserPasser();
    document.getElementById('departement').value = 'DEP-B';
    const pB = sandbox.chargerConsolidation();
    await laisserPasser();
    const cons = (dep) => ({ effectif: dep === 'DEP-A' ? 11 : 22, piliers: [], equipes: [{ equipe: `eq-${dep}`, effectif: 1 }] });
    trouver(appels, '/consolidation?', undefined);
    const aA = appels.find((a) => a.url.includes('DEP-A')), aB = appels.find((a) => a.url.includes('DEP-B'));
    aB.liberer(cons('DEP-B')); await pB;
    aA.liberer(cons('DEP-A')); await pA;
    await laisserPasser();
    check(document.getElementById('effectif').textContent.includes('22'), 'le departement B reste affiche (effectif 22)');
    check(!document.getElementById('effectif').textContent.includes('11') && document.getElementById('zoneEquipes').innerHTML.includes('eq-DEP-B') && !document.getElementById('zoneEquipes').innerHTML.includes('eq-DEP-A'),
      'la reponse inversee de A est ignoree (effectif et equipes)');
  }
  {
    const { sandbox, document } = creerSandbox(srcPil, {
      search: '?session=S1',
      repondre: () => ({ ok: false, status: 500, corps: { error: 'Boom <b>serveur</b>' } }),
    });
    document.getElementById('departement').value = 'DEP-A';
    let rejette = false;
    try { await sandbox.chargerConsolidation(); } catch { rejette = true; }
    check(!rejette, 'chargerConsolidation() ne rejette pas sur une erreur serveur 500');
    check(/Boom/.test(document.getElementById('zoneStatut').innerHTML), 'le message d\'erreur serveur est affiche dans la zone d\'etat');
    let rejetInit = false;
    try { await sandbox.init(); } catch { rejetInit = true; }
    check(!rejetInit, 'init() ne rejette pas sur une erreur serveur');
  }

  console.log('\n(e) pilotage : exporterPPT() sur erreur reseau => message, pas de rejet :');
  {
    const { sandbox, document } = creerSandbox(srcPil, { search: '?session=S1', repondre: () => ({ attendre: true }) });
    sandbox.fetch = () => Promise.reject(new Error('reseau coupe (simule)'));
    document.getElementById('departement').value = 'DEP-A';
    document.getElementById('avecManager').checked = true;
    let rejette = false;
    try { await sandbox.exporterPPT(); } catch { rejette = true; }
    check(!rejette, 'exporterPPT() ne rejette pas quand le fetch echoue');
    check(/Échec/.test(document.getElementById('zoneStatut').innerHTML), 'un message d\'echec est affiche');
    check(document.getElementById('btnExportPPT').disabled === false, 'le bouton est reactive');
  }

  console.log('\nEchappement : pilotage n\'injecte plus e.error brut :');
  check(!/\$\{e\.error\}/.test(htmlPil), 'pas de ${e.error} dans pilotage.html');

  await laisserPasser();
  check(rejetsNonGeres.length === 0, `aucune promesse rejetee sans handler (recu ${rejetsNonGeres.length})`);
  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main();
