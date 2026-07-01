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

async function corrigerReferentiel(piliers) {
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

module.exports = { corrigerReferentiel };
