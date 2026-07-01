// Saisie tolerante des departements/equipes (US3.3). Deux valeurs qui ne
// different que par la casse, les accents ou les espaces designent la meme
// entite : on les rapproche d'une orthographe canonique deja connue pour ne pas
// fragmenter les resultats, sans jamais fusionner des libelles reellement
// distincts (les vraies fautes de frappe relevent de la fusion animateur, US3.4bis).

// Cle de comparaison : minuscules, sans accents, espaces internes reduits.
// NFD separe chaque lettre accentuee en (lettre + diacritique combinatoire) ;
// \p{M} (marques Unicode) retire ensuite ces diacritiques.
function cleNormalisee(valeur) {
  return (valeur || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// `existantes` : [{ valeur, n }] (orthographes deja stockees + leur frequence).
// Renvoie l'orthographe a stocker : la valeur connue la plus frequente partageant
// la meme cle (tie-break alphabetique pour rester deterministe), ou, a defaut de
// correspondance, la saisie simplement nettoyee (= nouvelle valeur).
function valeurCanonique(existantes, saisie) {
  const propre = (saisie || '').replace(/\s+/g, ' ').trim();
  const cle = cleNormalisee(propre);
  const candidates = existantes.filter((e) => cleNormalisee(e.valeur) === cle);
  if (candidates.length === 0) return propre;
  candidates.sort((a, b) => b.n - a.n || a.valeur.localeCompare(b.valeur));
  return candidates[0].valeur;
}

module.exports = { cleNormalisee, valeurCanonique };
