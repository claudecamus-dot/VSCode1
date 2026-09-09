/* exported esc */
// Echappement HTML partage entre les 4 pages qui le dupliquaient a l'identique
// (constat audit-technique 2026-09-04 : resultats.html, admin.html,
// repondre.html, pilotage.html). Global navigateur simple (pas de require()
// cote serveur : aucun besoin, le serveur ne construit pas de HTML).
//
// Charge en <script src> SANS defer, place AVANT le bloc <script> inline de
// chaque page qui appelle esc() — un <script defer> s'executerait apres
// l'inline non-defere et laisserait esc() indefini au moment ou il est
// invoque (ReferenceError).
function esc(valeur) {
  return String(valeur).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
