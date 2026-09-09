// Verrou "rejets non catches" sur l'ecran de restitution (item 4, audit
// technique 2026-09-04) : sans .catch()/try-catch sur les fetch/promesses de
// resultats.html, une promesse qui rejette (reseau coupe, JSON invalide)
// laissait le <select> sur la NOUVELLE equipe pendant que les panneaux
// gardaient encore les donnees de l'ANCIENNE -- un melange silencieux de 2
// equipes differentes -- ou bloquait un libelle d'etat ("Enregistrement…")
// indefiniment, sans jamais avertir l'animateur.
//
// Ce test EXECUTE reellement le script inline de resultats.html (via node:vm,
// meme principe que test-xss-resultats.js qui extrait et execute esc()) avec
// un DOM minimal simule et un fetch() qui rejette a volonte, plutot que de se
// contenter de constater la presence d'un mot-cle "catch" dans le source.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PAGE = path.join(__dirname, '..', 'src', 'public', 'resultats.html');

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
  console.error('FAIL : script inline introuvable dans resultats.html');
  process.exit(1);
}
// L'auto-invocation `init();` en toute fin de script demarrerait immediatement
// avec des mocks pas encore configures pour le scenario du test -- on la
// retire pour appeler init()/chargerResultats() nous-memes, au bon moment.
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
    addEventListener(evt, fn) { listeners[evt] = listeners[evt] || []; listeners[evt].push(fn); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    get nextElementSibling() { return fauxElement(`${id}__sibling`); },
  };
}

function creerSandbox({ fetchImpl }) {
  const elements = new Map();
  const alertes = [];
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fauxElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const window = { location: { search: '?session=session-test-abc' } };
  const sandbox = {
    document,
    window,
    URLSearchParams,
    console,
    fetch: (...args) => fetchImpl(...args),
    alert: (msg) => alertes.push(msg),
    esc: (v) => String(v),
    Classement: { aplatirQuestions: () => [], classerPointsAttention: () => ({ dispersion: [], faibles: [] }), classerPointsForts: () => ({ hauts: [], accords: [] }) },
    StatsPartagees: { moyenneDe: () => null },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'resultats.html#inline' });
  // `elements` ne contient que les id deja demandes par le script (creation
  // paresseuse, comme document.getElementById) : passer par `document` (et non
  // `elements.get` directement) garantit qu'un id jamais encore touche par le
  // script est cree a la volee plutot que de renvoyer `undefined`.
  return { sandbox, document, alertes };
}

// --- Rejections non geree : temoin sur toute la duree du test ---
const rejetsNonGeres = [];
function onUnhandled(reason) { rejetsNonGeres.push(reason); }
process.on('unhandledRejection', onUnhandled);

async function attendreMicrotaches() {
  // Laisse le temps a Node de signaler une eventuelle unhandledRejection avant
  // qu'on ne verifie le temoin.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

async function main() {
  console.log("chargerResultats() : un fetch qui rejette n'ecrase plus le select en silence :");
  {
    const { sandbox, document } = creerSandbox({
      fetchImpl: () => Promise.reject(new Error('reseau coupe (simule)')),
    });
    // Equipe B deja selectionnee (comme apres un changement de <select>), et les
    // panneaux affichent encore les donnees STALES de l'equipe A precedente.
    document.getElementById('equipe').value = 'Equipe B';
    document.getElementById('avecManager').checked = true;
    document.getElementById('pointsForts').innerHTML = 'DONNEES-EQUIPE-A';
    document.getElementById('pointsAttention').innerHTML = 'DONNEES-EQUIPE-A';
    document.getElementById('zoneRadar').innerHTML = 'DONNEES-EQUIPE-A';
    document.getElementById('zonePiliers').innerHTML = 'DONNEES-EQUIPE-A';

    let rejette = false;
    try {
      await sandbox.chargerResultats();
    } catch (err) {
      rejette = true;
    }
    check(!rejette, 'chargerResultats() ne rejette pas quand le fetch echoue (catch interne)');
    check(
      !document.getElementById('pointsForts').innerHTML.includes('DONNEES-EQUIPE-A')
      && !document.getElementById('pointsAttention').innerHTML.includes('DONNEES-EQUIPE-A')
      && !document.getElementById('zoneRadar').innerHTML.includes('DONNEES-EQUIPE-A')
      && !document.getElementById('zonePiliers').innerHTML.includes('DONNEES-EQUIPE-A'),
      "les panneaux n'affichent plus les donnees de l'ancienne equipe apres un echec (pas de melange)",
    );
    check(
      /erreur/i.test(document.getElementById('pointsForts').innerHTML),
      'un message d\'erreur clair remplace les panneaux plutot qu\'un plantage silencieux',
    );
  }

  console.log('\ninit() : un echec de chargerEquipes()/chargerParticipation() est signale, pas silencieux :');
  {
    const { sandbox, document } = creerSandbox({
      fetchImpl: () => Promise.reject(new Error('reseau coupe des le chargement (simule)')),
    });
    let rejette = false;
    try {
      await sandbox.init();
    } catch (err) {
      rejette = true;
    }
    check(!rejette, "init() ne rejette pas (pas d'unhandledRejection au chargement de la page)");
    check(document.getElementById('etatSession').hidden === false, "un message d'etat est rendu visible");
    check(/erreur/i.test(document.getElementById('etatSession').innerHTML), "le message d'etat est explicite");
  }

  console.log('\nexporterPPT() : un fetch qui rejette alerte au lieu de se taire :');
  {
    const { sandbox, document, alertes } = creerSandbox({
      fetchImpl: () => Promise.reject(new Error('reseau coupe pendant l\'export (simule)')),
    });
    document.getElementById('equipe').value = 'Equipe B';
    document.getElementById('avecManager').checked = true;
    let rejette = false;
    try {
      await sandbox.exporterPPT();
    } catch (err) {
      rejette = true;
    }
    check(!rejette, "exporterPPT() ne rejette pas quand le fetch echoue");
    check(alertes.length === 1, `un message clair est presente a l'animateur (recu ${alertes.length} alerte(s))`);
    check(document.getElementById('btnExportPPT').disabled === false, 'le bouton est reactive apres l\'echec');
  }

  console.log("\nenregistrerCommentaire() : un fetch qui rejette ne bloque plus sur \"Enregistrement…\" :");
  {
    const { sandbox, document } = creerSandbox({
      fetchImpl: () => Promise.reject(new Error('reseau coupe pendant la sauvegarde (simule)')),
    });
    document.getElementById('equipe').value = 'Equipe B';
    document.getElementById('commentaire').value = 'Un commentaire de test.';
    let rejette = false;
    try {
      await sandbox.enregistrerCommentaire();
    } catch (err) {
      rejette = true;
    }
    check(!rejette, "enregistrerCommentaire() ne rejette pas quand le fetch echoue");
    check(
      document.getElementById('etatCommentaire').textContent !== 'Enregistrement…',
      "le libelle d'etat ne reste pas bloque sur \"Enregistrement…\" apres un echec",
    );
  }

  await attendreMicrotaches();
  process.removeListener('unhandledRejection', onUnhandled);
  check(rejetsNonGeres.length === 0, `aucune promesse rejetee sans handler pendant tout le scenario (recu ${rejetsNonGeres.length})`);

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main();
