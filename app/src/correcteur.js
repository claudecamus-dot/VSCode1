const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const nspell = require('nspell');

// Vocabulaire agile/produit a ne jamais "corriger" (mots anglais ou acronymes
// frequents dans la grille, que le dictionnaire francais ne connait pas).
const TERMES_AUTORISES = new Set([
  'scrum', 'scrumban', 'kanban', 'backlog', 'sprint', 'sprints', 'devops', 'mvp',
  'product', 'owner', 'epic', 'epics', 'feedback', 'feedbacks', 'coaching', 'invest',
  'roadmap', 'timebox', 'daily', 'dailies', 'kpi', 'kpis', 'run', 'build', 'ready',
  'done', 'persona', 'personas', 'standup', 'retex', 'demo', 'demos', 'release',
  'releases', 'as', 'a', 'service', 'story', 'stories', 'challengeable',
]);

// Audit du 2026-09-02 (robustesse) : les evenements 'error' et 'exit' couvrent le
// CRASH du worker, pas son BLOCAGE -- un worker qui ne repond jamais (dictionnaire
// bloque, boucle infinie sur une entree pathologique) laissait POST
// /api/referentiel/import pendu indefiniment. 60 s : tres au-dessus des ~4,6 s de
// chargement mesurees, large marge pour une grille avec beaucoup de mots inconnus.
// Surchargeable (tests) : forcer un delai tres court verifie le mecanisme sans
// attendre 60 s ni fabriquer un blocage artificiel dans le worker de production.
const DELAI_MAX_MS = Number(process.env.CORRECTEUR_DELAI_MAX_MS) || 60000;

let spellPromise = null;

function chargerCorrecteur() {
  if (!spellPromise) {
    spellPromise = import('dictionary-fr').then((module) => nspell(module.default));
  }
  return spellPromise;
}

// Cache memoise par mot : evite de rappeler le suggest() (couteux, ~0.5-1s)
// pour un meme mot qui revient plusieurs fois dans le document.
const cacheCorrections = new Map();

function corrigerMot(spell, mot) {
  if (cacheCorrections.has(mot)) return cacheCorrections.get(mot);

  let resultat = mot;
  if (mot.length > 2 && !mot.includes('-') && !TERMES_AUTORISES.has(mot) && !spell.correct(mot)) {
    const suggestions = spell.suggest(mot);
    if (
      suggestions.length === 1 &&
      spell.correct(suggestions[0]) &&
      Math.abs(suggestions[0].length - mot.length) <= 2
    ) {
      resultat = suggestions[0];
    }
  }

  cacheCorrections.set(mot, resultat);
  return resultat;
}

// N'applique la correction qu'aux mots entierement en minuscules et sans trait
// d'union : les mots avec une majuscule (noms propres, acronymes type
// Scrum/Kanban/MVP, debut de phrase) ou un trait d'union (constructions comme
// "a-t-elle", "sont-elles", jamais reconnues comme un mot simple) sont laisses
// tels quels pour ne pas alterer le vocabulaire metier ni declencher des
// corrections couteuses et hasardeuses.
function corrigerTexteConservateur(spell, texte) {
  if (!texte) return texte;
  return texte.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g, (mot) => {
    if (mot !== mot.toLowerCase()) return mot;
    return corrigerMot(spell, mot);
  });
}

// Parcours du referentiel, en place. Tourne dans le WORKER, jamais dans le thread
// principal (cf. corrigerReferentiel ci-dessous).
async function corrigerEnPlace(piliers) {
  const spell = await chargerCorrecteur();
  for (const pilier of piliers) {
    pilier.nom = corrigerTexteConservateur(spell, pilier.nom);
    for (const sousCategorie of pilier.sousCategories) {
      sousCategorie.nom = corrigerTexteConservateur(spell, sousCategorie.nom);
      for (const question of sousCategorie.questions) {
        question.texte = corrigerTexteConservateur(spell, question.texte);
        for (const niveau of question.niveaux) {
          niveau.texte = corrigerTexteConservateur(spell, niveau.texte);
        }
      }
    }
  }
  return piliers;
}

// --- Cote worker -------------------------------------------------------------
// Ce meme fichier est charge comme script de worker (`new Worker(__filename)`).
// `isMainThread` distingue les deux roles : hors thread principal, le module ne
// fait qu'ecouter les demandes de correction.
if (!isMainThread && parentPort) {
  parentPort.on('message', async (piliers) => {
    try {
      parentPort.postMessage({ piliers: await corrigerEnPlace(piliers) });
    } catch (err) {
      parentPort.postMessage({ erreur: String(err && err.message ? err.message : err) });
    }
  });
}

// --- Cote thread principal ---------------------------------------------------
// `spell.suggest()` est un calcul CPU SYNCHRONE : mesure sur ce poste, 4 614 ms
// pour charger le dictionnaire puis ~515 ms par mot inconnu. Une grille metier en
// contient facilement trente a soixante (jargon, anglicismes, noms propres), soit
// une demi-minute a une minute pendant laquelle la boucle d'evenements ne rendait
// plus la main : aucun repondant ne pouvait charger sa page, enregistrer un pilier
// ni soumettre pendant l'import. Le rendre `async` n'y changeait rien — `await`
// ne deplace pas un calcul, il ordonne des reprises.
//
// Le travail part donc dans un worker, cree pour la duree d'un import puis
// termine. Garder un worker en vie entre deux imports aurait economise le
// chargement du dictionnaire, mais un worker inactif RETIENT le processus :
// `worker.unref()` ne suffit pas (verifie sur Node 26 — `node
// scripts/test-correcteur.js` ne rendait jamais la main). Un import est une
// action d'animateur, rare : payer 4,6 s de chargement a chaque fois, hors du
// thread principal, coute moins cher qu'un serveur qui ne s'arrete plus.
//
// Renvoie le referentiel corrige. ATTENTION : contrairement a la version d'avant
// le passage en worker, les piliers passes en argument ne sont PAS modifies —
// ils traversent un clone structure. Utiliser la valeur de retour.
function corrigerReferentiel(piliers) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename);
    let fini = false;
    const terminer = (action, valeur) => {
      if (fini) return;
      fini = true;
      clearTimeout(horsDelai);
      // `.catch` AVANT `.finally` : un `terminate()` qui rejette laissait sinon
      // une rejection non geree (arret du processus sous le mode par defaut de
      // Node) et la promesse d'import pendante a jamais.
      worker.terminate().catch(() => {}).finally(() => action(valeur));
    };
    const horsDelai = setTimeout(() => {
      terminer(reject, new Error(`Correcteur orthographique sans reponse apres ${DELAI_MAX_MS}ms — worker arrete.`));
    }, DELAI_MAX_MS);
    worker.on('message', ({ piliers: corriges, erreur }) => {
      if (erreur) terminer(reject, new Error(erreur));
      else terminer(resolve, corriges);
    });
    // Chargement du dictionnaire impossible, memoire epuisee, worker tue : on
    // rejette au lieu de laisser l'import pendu indefiniment.
    worker.on('error', (err) => terminer(reject, err));
    worker.on('exit', (code) => {
      if (!fini) {
        fini = true;
        clearTimeout(horsDelai);
        reject(new Error(`Correcteur orthographique arrete avant de repondre (code ${code}).`));
      }
    });
    // `postMessage` hors garde laissait le worker VIVANT pour toujours quand il
    // levait (valeur non clonable) : la promesse rejetait, mais rien n'appelait
    // `terminate()` — or ce fichier documente lui-meme qu'un worker inactif
    // RETIENT le processus. Reproduit : le processus ne s'arretait plus.
    try {
      worker.postMessage(piliers);
    } catch (err) {
      terminer(reject, err);
    }
  });
}

module.exports = { corrigerReferentiel };
