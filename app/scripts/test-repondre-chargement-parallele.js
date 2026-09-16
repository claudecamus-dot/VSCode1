// Chargement du formulaire d'identification du REPONDANT : les 3 appels
// (roles, departements, equipes) doivent partir ENSEMBLE, pas l'un apres
// l'autre (constat performance de l'audit-technique du 2026-09-09).
//
// Ils sont strictement independants -- endpoints distincts, aucune donnee de
// l'un ne sert a l'autre -- et ils etaient enchaines en serie : la premiere
// page que voit CHAQUE personne invitee attendait la somme des trois
// allers-retours au lieu du plus long. Le motif Promise.all etait deja applique
// dans le meme depot (resultats.html:256 et 400), sur l'ecran animateur.
//
// Ce test EXECUTE reellement le script inline de repondre.html (node:vm, meme
// principe que test-restitution-rejets-geres.js) avec un DOM minimal simule et
// un fetch() instrumente qui COMPTE les appels simultanement en vol. Une
// version en serie plafonne mecaniquement a 1 appel en vol : c'est cette mesure,
// pas la presence du mot-cle « Promise.all » dans le source, qui distingue les
// deux.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = path.join(__dirname, '..', 'src', 'public', 'repondre.html');
const LATENCE_SIMULEE_MS = 40;

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

// --- Extraction du script inline (pas les <script src=...> externes) ---
const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) {
  console.error('FAIL : script inline introuvable dans repondre.html');
  process.exit(1);
}
// L'auto-invocation `init();` en fin de script partirait immediatement, avant
// que le scenario ne soit arme -- on appelle nous-memes la fonction visee.
const source = m[1].replace(/\n\s*init\(\);\s*$/, '\n');
check(source.length > 0 && !/\binit\(\);\s*$/.test(source), 'script inline extrait, auto-invocation retiree');

// --- DOM minimal simule ---
function fauxElement(id) {
  const listeners = {};
  return {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    checked: false,
    files: [],
    dataset: {},
    classList: {
      _set: new Set(['hidden']),
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
    addEventListener(evt, fn) { listeners[evt] = listeners[evt] || []; listeners[evt].push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

// Valeurs DISTINCTES par endpoint : si les trois reponses etaient recuperees
// dans le mauvais ordre (destructuration decalee), les libelles atterriraient
// dans le mauvais champ et les verifications de contenu ci-dessous crieraient.
// Correctif securite (arbitrage 2026-09-16, US10.5 invalidee, finding
// « exposition d'organigramme ») : repondre.html appelle desormais les
// variantes SESSION-SCOPEES (plus les anciennes routes globales, qui
// agregaient tous les clients). L'id de session simule est celui pose dans
// window.location.search ci-dessous (?session=session-test-abc).
const REPONSES = {
  '/api/sessions/session-test-abc/roles': ['Product Owner', 'Dev <b>senior</b>'],
  '/api/sessions/session-test-abc/departements-suggestions': ['Departement Nord', 'Departement Sud'],
  '/api/sessions/session-test-abc/equipes-suggestions': ['Equipe Alpha', 'Equipe Beta'],
};

function creerSandbox({ stockageLeve = false } = {}) {
  const elements = new Map();
  const enVol = { courant: 0, max: 0 };
  const appels = [];

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fauxElement(id));
      return elements.get(id);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const window = {
    location: { search: '?session=session-test-abc', href: 'http://127.0.0.1/repondre.html?session=session-test-abc' },
    history: { replaceState() {} },
  };
  const sandbox = {
    document,
    window,
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    localStorage: stockageLeve
      ? {
        getItem() { throw new Error('acces au stockage refuse'); },
        setItem() { throw new Error('acces au stockage refuse'); },
        removeItem() { throw new Error('acces au stockage refuse'); },
      }
      : { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    alert() {},
    esc: (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    fetch: (chemin) => {
      appels.push(chemin);
      // init() commence par la session elle-meme (meta, sans sous-chemin) :
      // reponse immediate, elle ne fait pas partie des 3 appels dont on mesure
      // le parallelisme. Le `$` de fin est essentiel depuis le correctif
      // organigramme du 2026-09-16 : les 3 appels mesures sont MAINTENANT
      // eux-memes sous /api/sessions/<id>/..., une regex fourre-tout les
      // confondrait avec la meta de session.
      if (/^\/api\/sessions\/[^/]+$/.test(chemin)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ texte_intro: 'Bonjour', statut: 'ouverte' }) });
      }
      enVol.courant += 1;
      enVol.max = Math.max(enVol.max, enVol.courant);
      return new Promise((resolve) => {
        setTimeout(() => {
          enVol.courant -= 1;
          resolve({ ok: true, json: () => Promise.resolve(REPONSES[chemin] || []) });
        }, LATENCE_SIMULEE_MS);
      });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'repondre.html#inline' });
  return { sandbox, document, enVol, appels };
}

async function main() {
  console.log('afficherFormulaireIdentification() : les 3 appels partent ensemble :');
  const { sandbox, document, enVol, appels } = creerSandbox();
  const debut = Date.now();
  await sandbox.afficherFormulaireIdentification();
  const duree = Date.now() - debut;

  check(appels.length === 3, `les 3 endpoints sont bien appeles une fois chacun (recu ${appels.length} : ${appels.join(', ')})`);
  check(
    enVol.max === 3,
    `3 appels EN VOL simultanement (mesure : ${enVol.max}) — une version en serie plafonne a 1, c'est la mesure discriminante`
  );
  // Marge large : on verifie l'ordre de grandeur (1 latence, pas 3), pas une
  // duree exacte -- le test doit rester stable sur une machine chargee.
  check(
    duree < LATENCE_SIMULEE_MS * 2.5,
    `duree totale ~1 latence et non 3 (${duree} ms mesures, seuil ${Math.round(LATENCE_SIMULEE_MS * 2.5)} ms, serie attendue >= ${LATENCE_SIMULEE_MS * 3} ms)`
  );

  console.log('Le cas nominal est intact : chaque reponse atterrit dans SON champ :');
  const role = document.getElementById('role').innerHTML;
  const dep = document.getElementById('suggestionsDepartement').innerHTML;
  const equipes = document.getElementById('suggestionsEquipe').innerHTML;
  check(role.includes('Product Owner') && !role.includes('Departement Nord') && !role.includes('Equipe Alpha'), '#role recoit les ROLES, et rien d\'autre');
  check(dep.includes('Departement Nord') && !dep.includes('Product Owner'), '#suggestionsDepartement recoit les DEPARTEMENTS');
  check(equipes.includes('Equipe Alpha') && !equipes.includes('Departement Nord'), '#suggestionsEquipe recoit les EQUIPES');
  check(role.includes('<option') && dep.includes('<option') && equipes.includes('<option'), 'les trois listes sont rendues en <option>');
  check(
    role.includes('&lt;b&gt;senior&lt;/b&gt;') && !role.includes('<b>senior</b>'),
    'esc() reste applique aux libelles (un role contenant du HTML ne s\'execute pas)'
  );
  check(
    document.getElementById('formIdentification').classList.contains('hidden') === false,
    'le formulaire d\'identification est affiche a la fin (classe hidden retiree)'
  );

  console.log('\nStockage du navigateur indisponible (getItem/setItem LEVENT) : la page vit quand meme :');
  // Trouve en passe adversariale (2026-09-09) : les 4 acces localStorage de
  // cette page etaient nus, et le premier est en amont de tout, dans init().
  // La levee emportait le questionnaire ENTIER, pour toute personne invitee
  // dont le navigateur refuse le stockage -- alors que l'URL (?rid=) est le
  // canal qui fait foi et suffisait a repartir.
  {
    const s2 = creerSandbox({ stockageLeve: true });
    let rejette = null;
    try {
      await s2.sandbox.init();
    } catch (err) {
      rejette = err;
    }
    check(rejette === null, `init() ne rejette pas quand le stockage leve (recu ${rejette && rejette.message})`);
    check(
      s2.document.getElementById('formIdentification').classList.contains('hidden') === false,
      "le formulaire d'identification est quand meme propose (le stockage n'est qu'un confort)"
    );
    check(
      s2.document.getElementById('role').innerHTML.includes('Product Owner'),
      'les listes du formulaire sont chargees normalement'
    );
    check(
      s2.document.getElementById('zoneStatutSession').innerHTML === '',
      "aucun message d'erreur bloquant n'est affiche a la place du questionnaire"
    );
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
