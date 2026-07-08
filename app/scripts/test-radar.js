// Test structurel de la generation du radar SVG serveur (src/radar-svg.js).
//
// radar-svg.js "mire" volontairement le radar de l'ecran web (resultats.html)
// pour le reinjecter dans le PPT (US6.4) : les deux visuels doivent evoluer en
// parallele. Ce test ne compare pas des pixels — il verrouille la STRUCTURE du
// SVG produit (nb d'axes, nb de sommets, comparaison, nettoyage des libelles,
// echappement) pour qu'une derive de structure soit detectee autrement qu'a
// l'oeil. Utilise node:assert/strict (assertions natives, aucune dependance).

const assert = require('node:assert/strict');
const { construireRadarSVG, PALETTE } = require('../src/radar-svg');

const count = (s, re) => (s.match(re) || []).length;

const piliers = ['Pilier A', 'Pilier B', 'Pilier C'];
const axes = [
  { label: 'Objectif 1', pilierIndex: 0, courant: 2, precedent: null },
  { label: 'Objectif 2', pilierIndex: 1, courant: 3, precedent: null },
  { label: 'Objectif 3', pilierIndex: 2, courant: 1, precedent: null },
  { label: 'Objectif 4', pilierIndex: 0, courant: 0, precedent: null },
];

// --- Cas 1 : radar sans comparaison -----------------------------------------
const svg = construireRadarSVG(axes, piliers);

// viewBox = (T+LW) x T = 1540 x 1160 : canevas plus large que haut (legende a droite)
assert.match(svg, /viewBox="0 0 1540 1160"/, 'viewBox attendu 1540x1160');
assert.match(svg, /<svg\b/, 'balise <svg> presente');
assert.match(svg, /<\/svg>\s*$/, 'SVG bien ferme');

// un sommet courant (cercle r=5.5) par axe
assert.equal(count(svg, /r="5\.5"/g), axes.length, 'un sommet courant par axe');

// une puce de legende (cercle r=8) par pilier
assert.equal(count(svg, /r="8"/g), piliers.length, 'une puce de legende par pilier');

// 3 polygones de grille (niveaux 1..MAX=3), stroke gris clair
assert.equal(count(svg, /stroke="#dddddd"/g), 3, '3 polygones de grille (niveaux 1-3)');

// exactement un polygone "courant" (remplissage bleu translucide)
assert.equal(count(svg, /#2c5cc544/g), 1, 'un seul polygone courant');

// autant de sommets dans le polygone courant que d'axes
const polyCourant = svg.match(/<polygon points="([^"]*)" fill="#2c5cc544"/);
assert.ok(polyCourant, 'polygone courant present');
assert.equal(
  polyCourant[1].trim().split(/\s+/).length,
  axes.length,
  'n sommets dans le polygone courant',
);

// un rayon d'axe (<line>) par sommet, et rien de plus sans comparaison
assert.equal(count(svg, /<line /g), axes.length, "un rayon d'axe par sommet (sans legende de session)");

// aucune trace de comparaison
assert.equal(count(svg, /stroke-dasharray/g), 0, 'aucun pointille sans comparaison');
assert.doesNotMatch(svg, /Session courante/, 'pas de legende de session sans comparaison');

// --- Cas 2 : radar avec comparaison (au moins un precedent) ------------------
const axesCmp = axes.map((a, i) => ({ ...a, precedent: i === 0 ? null : 2 }));
const svgCmp = construireRadarSVG(axesCmp, piliers);

assert.match(
  svgCmp,
  /<polygon points="[^"]*" fill="none" stroke="#888888"[^>]*stroke-dasharray/,
  'polygone precedent pointille present avec comparaison',
);
assert.match(svgCmp, /Session courante/, 'legende session courante presente');
assert.match(svgCmp, /Session précédente/, 'legende session precedente presente');
// rayons d'axe + 2 lignes de legende de session
assert.equal(
  count(svgCmp, /<line /g),
  axesCmp.length + 2,
  "rayons d'axe + 2 lignes de legende de session",
);

// --- Cas 3 : nettoyage des libelles (mire le radar web) ---------------------
const svgLbl = construireRadarSVG(
  [{ label: 'Leadership (sponsorship, posture manageriale)', pilierIndex: 0, courant: 2, precedent: null }],
  ['Leadership'],
);
assert.doesNotMatch(svgLbl, /sponsorship/, "le contenu entre parentheses est retire du libelle d'axe");
assert.match(svgLbl, /Leadership/, 'le libelle nettoye reste present');

// --- Cas 4 : echappement XML ------------------------------------------------
const svgEsc = construireRadarSVG(
  [{ label: 'A & B < C', pilierIndex: 0, courant: 1, precedent: null }],
  ['P & Q'],
);
assert.match(svgEsc, /A &amp; B &lt; C/, 'caracteres speciaux du libelle echappes');
assert.doesNotMatch(svgEsc, /A & B < C/, 'aucun caractere brut non echappe');

// --- Cas 5 : couleur par pilier cyclique (modulo palette) -------------------
assert.equal(PALETTE.length, 6, 'palette de 6 couleurs');
const svgMod = construireRadarSVG(
  [{ label: 'X', pilierIndex: PALETTE.length, courant: 2, precedent: null }],
  ['X'],
);
// pilierIndex = 6 -> PALETTE[6 % 6] = PALETTE[0]
assert.match(
  svgMod,
  new RegExp(`r="5\\.5" fill="${PALETTE[0]}"`),
  'couleur du sommet cyclique modulo la palette',
);

console.log('Radar SVG structural tests OK');
