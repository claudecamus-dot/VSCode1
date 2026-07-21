// Garde-fou de contraste WCAG du radar de maturité (constat superviseur
// verification-manquante, 2026-07-21) — vérifie que les couleurs du radar tiennent
// les seuils WCAG sur les DEUX surfaces (web resultats.html/pilotage.html + PPT
// pptx_deck.py), à partir de la MÊME palette pilier (source unique testée).
//
// Décision codifiée ici : la couleur du pilier ne colore plus le TEXTE des libellés
// (le gold #b8860b échouait à 3.25:1 < AA 4.5:1) mais une PASTILLE — objet graphique,
// seuil WCAG 1.4.11 = 3:1, que le gold passe. Les libellés sont en foncé neutre
// (texte, seuil 1.4.3 = 4.5:1). Ce test échoue si quelqu'un recolore les libellés
// avec la palette, éclaircit un pilier sous 3:1, ou désynchronise les 3 palettes.
const fs = require('fs');
const path = require('path');

let echecs = 0;
function check(condition, message) {
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) echecs += 1;
}

const lire = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

// --- WCAG 2.x : luminance relative + ratio de contraste ---
function luminance(hex) {
  const c = hex.replace('#', '');
  const canaux = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = canaux.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contraste(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --- Extraction depuis les sources réelles (pas de palette recopiée dans le test) ---
const extrairePalette = (txt) => {
  const m = txt.match(/PALETTE\s*=\s*\[([^\]]*)\]/);
  return m ? (m[1].match(/#[0-9a-fA-F]{6}/g) || []).map((s) => s.toLowerCase()) : null;
};
const extraire1 = (txt, re) => {
  const m = txt.match(re);
  return m ? m[1].toLowerCase() : null;
};

const resultats = lire('../src/public/resultats.html');
const pilotage = lire('../src/public/pilotage.html');
const deck = lire('./pptx_deck.py');

const palResultats = extrairePalette(resultats);
const palPilotage = extrairePalette(pilotage);
const palDeck = extrairePalette(deck);

const BRAND_BG = extraire1(resultats, /--brand-bg:\s*(#[0-9a-fA-F]{6})/);
const LABEL_WEB = extraire1(resultats, /--brand-secondary:\s*(#[0-9a-fA-F]{6})/); // libellés web
const LABEL_PPT = extraire1(deck, /^INK\s*=\s*["'](#[0-9a-fA-F]{6})/m);           // libellés PPT (D.INK)
const BG_PPT = '#ffffff'; // slides OCTO sur fond blanc

const SEUIL_TEXTE = 4.5;    // WCAG 1.4.3 (texte normal, AA)
const SEUIL_GRAPHIQUE = 3.0; // WCAG 1.4.11 (objets graphiques / composants d'UI)

console.log('Palette pilier — source unique (3 surfaces identiques) :');
check(palResultats && palResultats.length === 6, 'resultats.html : 6 couleurs pilier trouvées');
check(palPilotage && JSON.stringify(palPilotage) === JSON.stringify(palResultats),
  'pilotage.html : palette identique à resultats.html');
check(palDeck && JSON.stringify(palDeck) === JSON.stringify(palResultats),
  'pptx_deck.py : palette identique à resultats.html (web ↔ PPT synchronisés)');

console.log('\nLibellés d\'axe = texte foncé neutre (seuil 4.5:1) :');
check(LABEL_WEB && contraste(LABEL_WEB, BRAND_BG) >= SEUIL_TEXTE,
  `web ${LABEL_WEB} / ${BRAND_BG} = ${contraste(LABEL_WEB, BRAND_BG).toFixed(2)}:1 ≥ ${SEUIL_TEXTE}`);
check(LABEL_PPT && contraste(LABEL_PPT, BG_PPT) >= SEUIL_TEXTE,
  `PPT ${LABEL_PPT} / ${BG_PPT} = ${contraste(LABEL_PPT, BG_PPT).toFixed(2)}:1 ≥ ${SEUIL_TEXTE}`);
// Les libellés du radar utilisent bien la couleur foncée (pas la palette pilier).
check(resultats.includes(`fill="${LABEL_WEB}"`), 'resultats.html : libellés radar en couleur foncée (pas palette)');
check(pilotage.includes(`fill="${LABEL_WEB}"`), 'pilotage.html : libellés radar en couleur foncée (pas palette)');

console.log('\nPastilles pilier = objet graphique (seuil 3:1) :');
(palResultats || []).forEach((coul, i) => {
  const r = contraste(coul, BG_PPT);
  check(r >= SEUIL_GRAPHIQUE, `pilier ${i} ${coul} sur blanc = ${r.toFixed(2)}:1 ≥ ${SEUIL_GRAPHIQUE}`);
});

console.log('\nRationale codifiée (le gold : KO en texte, OK en pastille) :');
const GOLD = '#b8860b';
check(contraste(GOLD, BG_PPT) < SEUIL_TEXTE,
  `gold ${GOLD} en TEXTE = ${contraste(GOLD, BG_PPT).toFixed(2)}:1 < ${SEUIL_TEXTE} → d'où le passage en pastille`);
check(contraste(GOLD, BG_PPT) >= SEUIL_GRAPHIQUE,
  `gold ${GOLD} en PASTILLE = ${contraste(GOLD, BG_PPT).toFixed(2)}:1 ≥ ${SEUIL_GRAPHIQUE} → acceptable comme objet graphique`);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
process.exit(echecs === 0 ? 0 : 1);
