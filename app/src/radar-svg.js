// Radar "par objectif" identique a l'ecran web (forme, police, couleurs par
// pilier) — produit un SVG autonome, ensuite rasterise en PNG et insere dans le
// PPT (US6.4). Mire le rendu de resultats.html (rendreRadar / comparaison).

const PALETTE = ['#2c5cc5', '#1e6b34', '#b3261e', '#b8860b', '#6a3d9a', '#138086'];

function escapeXml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// Libelle d'axe sans son contenu entre parentheses (ex. "Leadership et Culture
// agile (sponsorship, posture managériale, ...)" -> "Leadership et Culture
// agile") : mire le traitement du radar web (resultats.html/libelleAxeRadar) —
// ce detail alourdit le radar sans aider a la lecture rapide.
function nettoyerLabel(texte) {
  return String(texte).replace(/\s*\([^)]*\)/g, '').trim();
}

function decouperLabel(texte, maxCaracteres) {
  const mots = String(texte).split(/\s+/);
  const lignes = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (essai.length > maxCaracteres && courante) {
      lignes.push(courante);
      courante = mot;
    } else {
      courante = essai;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

// axes : [{ label, pilierIndex, courant, precedent? }] ; piliers : [nom, ...] (pour la legende).
// Taille et police agrandies, legende deportee A COTE (pas en dessous) : le
// radar occupe maintenant 2/3 (large mais peu haut) du slide PPT
// (export-restitution-ppt.py) — un visuel carre + legende empilee en dessous
// serait plus HAUT que LARGE et resterait borne par la hauteur du slide sans
// jamais utiliser la largeur allouee. La legende a droite rend le canevas
// nettement plus large que haut, ce qui laisse la largeur devenir la
// contrainte dimensionnante et agrandit vraiment le radar une fois insere.
function construireRadarSVG(axes, piliers) {
  const T = 1160;      // cote du carre radar
  const LW = 380;       // largeur du panneau de legende, a droite du radar
  const C = T / 2;
  const R = T / 2 - 220;
  const MAX = 3;
  const n = axes.length;
  const hasPrev = axes.some((a) => a.precedent !== null && a.precedent !== undefined);
  const couleur = (i) => PALETTE[i % PALETTE.length];
  const pt = (i, v) => {
    const ang = -Math.PI / 2 + i * ((2 * Math.PI) / n);
    const r = (R * (v ?? 0)) / MAX;
    return [C + r * Math.cos(ang), C + r * Math.sin(ang)];
  };

  const W = T + LW;
  const H = T;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, 'Segoe UI', sans-serif">`;
  s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;

  // grille + axes
  for (let lv = 1; lv <= MAX; lv++) {
    s += `<polygon points="${axes.map((_, i) => pt(i, lv).join(',')).join(' ')}" fill="none" stroke="#dddddd" stroke-width="1"/>`;
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, MAX);
    s += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="#cccccc" stroke-width="1"/>`;
  });

  // polygone precedent (pointille gris) puis courant (plein bleu). Un axe sans
  // valeur precedente (objectif absent du referentiel de l'ancienne session)
  // reprend la valeur courante pour ce sommet : cela evite de faire plonger le
  // polygone a 0, ce qui laisserait croire a une regression totale la ou on n'a
  // simplement aucune comparaison possible.
  if (hasPrev) {
    s += `<polygon points="${axes.map((a, i) => pt(i, a.precedent ?? a.courant).join(',')).join(' ')}" fill="none" stroke="#888888" stroke-width="2" stroke-dasharray="6 4"/>`;
  }
  s += `<polygon points="${axes.map((a, i) => pt(i, a.courant).join(',')).join(' ')}" fill="#2c5cc544" stroke="#2c5cc5" stroke-width="2.5"/>`;
  axes.forEach((a, i) => {
    const [x, y] = pt(i, a.courant);
    s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${couleur(a.pilierIndex)}"/>`;
  });

  // labels d'axe (couleur du pilier), replies sur plusieurs lignes
  axes.forEach((a, i) => {
    const ang = -Math.PI / 2 + i * ((2 * Math.PI) / n);
    const lx = C + (R + 28) * Math.cos(ang);
    const ly = C + (R + 28) * Math.sin(ang);
    const anc = Math.cos(ang) > 0.2 ? 'start' : Math.cos(ang) < -0.2 ? 'end' : 'middle';
    const lignes = decouperLabel(nettoyerLabel(a.label), 20);
    const dy0 = -((lignes.length - 1) * 0.6);
    const tspans = lignes
      .map((l, li) => `<tspan x="${lx}" dy="${li === 0 ? dy0 : 1.2}em">${escapeXml(l)}</tspan>`)
      .join('');
    s += `<text x="${lx}" y="${ly}" font-size="17" fill="${couleur(a.pilierIndex)}" text-anchor="${anc}">${tspans}</text>`;
  });

  // legende : panneau vertical a droite du radar (un pilier par ligne, replie
  // sur plusieurs lignes si le nom est long), puis courante/precedente.
  const lx0 = T + 30;
  const ligW = 26; // decalage texte apres la puce
  const lignesPilier = piliers.map((nom) => decouperLabel(nom, 30));
  const ROW_H = 34, LH = 22;
  const hauteurPiliers = lignesPilier.reduce((s2, l) => s2 + Math.max(ROW_H, l.length * LH + 6), 0);
  const hauteurTotale = hauteurPiliers + (hasPrev ? 76 : 0);
  let ly = (H - hauteurTotale) / 2;
  piliers.forEach((nom, i) => {
    const lignes = lignesPilier[i];
    const rowH = Math.max(ROW_H, lignes.length * LH + 6);
    s += `<circle cx="${lx0 + 8}" cy="${ly + 13}" r="8" fill="${couleur(i)}"/>`;
    const tspans = lignes
      .map((l, li) => `<tspan x="${lx0 + ligW}" dy="${li === 0 ? 0 : LH}">${escapeXml(l)}</tspan>`)
      .join('');
    s += `<text x="${lx0 + ligW}" y="${ly + 18}" font-size="17" fill="#333333">${tspans}</text>`;
    ly += rowH;
  });
  if (hasPrev) {
    ly += 20;
    s += `<line x1="${lx0}" y1="${ly}" x2="${lx0 + 36}" y2="${ly}" stroke="#2c5cc5" stroke-width="3"/>`;
    s += `<text x="${lx0 + 46}" y="${ly + 6}" font-size="17" fill="#333333">Session courante</text>`;
    ly += 34;
    s += `<line x1="${lx0}" y1="${ly}" x2="${lx0 + 36}" y2="${ly}" stroke="#888888" stroke-width="3" stroke-dasharray="6 4"/>`;
    s += `<text x="${lx0 + 46}" y="${ly + 6}" font-size="17" fill="#333333">Session précédente</text>`;
  }

  s += '</svg>';
  return s;
}

module.exports = { construireRadarSVG, PALETTE };
