'use strict';

// En-tetes de securite HTTP (finding securite de l'audit du 2026-09-04 : la pile
// de middlewares n'en posait AUCUN — ni Content-Security-Policy, ni
// X-Frame-Options, ni nosniff ; `grep -rniE "content-security-policy|
// x-frame-options|helmet|setHeader" src/` sortait vide).
//
// Ce que chaque en-tete ferme, ici, concretement :
//
//   - Content-Security-Policy : deuxieme ligne de defense derriere esc(). Les
//     pages animateur injectent en innerHTML des champs saisis LIBREMENT par le
//     repondant (nom, prenom, equipe, departement) via une route ouverte sans
//     compte : si une seule des ~70 injections oublie esc(), la CSP interdit
//     encore d'exfiltrer vers un domaine tiers (default-src/connect-src 'self')
//     et de charger un script externe.
//   - X-Frame-Options + frame-ancestors : l'ecran de restitution et la console
//     animateur ne doivent pas etre embarquables dans une page tierce
//     (clickjacking sur les actions destructives : import « remplacer », fusion).
//   - X-Content-Type-Options: nosniff : un import xlsx/csv renvoye ou servi ne
//     doit pas etre re-interprete en HTML par le navigateur.
//   - Referrer-Policy: same-origin : l'identifiant de repondant voyage DANS
//     L'URL (lien ?rid=) — sans cette regle il partait dans le Referer de toute
//     navigation sortante. `same-origin` et non `no-referrer` : csrf.js retombe
//     sur le Referer quand Origin est absent (fail-closed), le supprimer
//     entierement affaiblirait ce repli pour les appels legitimes same-origin.
//
// LATITUDE ASSUMEE — `'unsafe-inline'` sur script-src ET style-src. Les 6 pages
// de src/public/ portent leur logique dans un bloc <script> INLINE et leurs
// styles dans un bloc <style> inline ; les fermer casserait toute l'application.
// La sortie propre serait un nonce par requete, impossible tant que les pages
// sont servies telles quelles par express.static (fichiers statiques, aucun
// rendu serveur). C'est donc une CSP qui NE protege PAS de l'execution d'un
// script injecte inline — elle ferme l'exfiltration et le chargement externe,
// pas l'injection elle-meme. esc() reste la defense de premiere ligne.
// scripts/test-entetes-securite.js verrouille cette coherence : si les pages
// perdent leur script inline, il exige de retirer la latitude, et si la CSP est
// durcie sans les avoir sorties, il crie avant que la page ne casse en prod.
const POLITIQUE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // `data:` : aucune image de ce type aujourd'hui (verifie sur src/public/),
  // latitude laissee pour une icone inline, sans ouvrir d'origine externe.
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const ENTETES = {
  'Content-Security-Policy': POLITIQUE_CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

// Pose les en-tetes sur TOUTE reponse, y compris les 401 de la barriere Basic et
// les erreurs : un 401 est une page rendue par le navigateur comme une autre.
// D'ou la place de ce middleware en TETE de chaine dans server.js.
function entetesSecurite(req, res, next) {
  for (const [nom, valeur] of Object.entries(ENTETES)) res.setHeader(nom, valeur);
  next();
}

module.exports = { entetesSecurite, ENTETES, POLITIQUE_CSP };
