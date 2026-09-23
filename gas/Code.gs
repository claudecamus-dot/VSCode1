/**
 * Squelette de la web app Apps Script (migration de app/, Node/Express + node:sqlite).
 * RIEN N'EST MIGRE : chaque action leve « non migre - lot N ».
 * Inventaire et lots : docs/migration-apps-script/README.md.
 * Une action = une route de app/src/server.js (35 routes, meme ordre).
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Maturite agile')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function nonMigre_(lot) {
  throw new Error('non migre - lot ' + lot);
}

/** Action factice appelee par Index.html pour prouver la chaine google.script.run. */
function ping() {
  return { ok: true, at: new Date().toISOString() };
}

// --- Lot 1 : lecture referentiel, roles, env ------------------------------
function getEnv() { nonMigre_(1); }                                  // GET /api/env
function getReferentielStats() { nonMigre_(1); }                     // GET /api/referentiel/stats
function getReferentiel() { nonMigre_(1); }                          // GET /api/referentiel
function getTexteIntroDefaut() { nonMigre_(1); }                     // GET /api/texte-intro-defaut
function listRoles() { nonMigre_(1); }                               // GET /api/roles
function createRole(nom) { nonMigre_(1); }                           // POST /api/roles
function deleteRole(nom) { nonMigre_(1); }                           // DELETE /api/roles/:nom

// --- Lot 2 : sessions et invites ------------------------------------------
function listSessions() { nonMigre_(2); }                            // GET /api/sessions
function getSessionSummary(id) { nonMigre_(2); }                     // GET /api/sessions/:id/summary
function createSession(payload) { nonMigre_(2); }                    // POST /api/sessions
function getSession(id) { nonMigre_(2); }                            // GET /api/sessions/:id
function getSessionReferentiel(id) { nonMigre_(2); }                 // GET /api/sessions/:id/referentiel
function importInvites(id, fichierBase64) { nonMigre_(2); }          // POST /api/sessions/:id/invites
function listInvites(id) { nonMigre_(2); }                           // GET /api/sessions/:id/invites
function listNonRepondants(id) { nonMigre_(2); }                     // GET /api/sessions/:id/invites/non-repondants

// --- Lot 3 : parcours repondant -------------------------------------------
function getDepartementsSuggestions(id) { nonMigre_(3); }            // GET /api/sessions/:id/departements-suggestions
function getEquipesSuggestions(id) { nonMigre_(3); }                 // GET /api/sessions/:id/equipes-suggestions
function getSessionRoles(id) { nonMigre_(3); }                       // GET /api/sessions/:id/roles
function createRepondant(sessionId, payload) { nonMigre_(3); }       // POST /api/sessions/:id/repondants
function getRepondant(id) { nonMigre_(3); }                          // GET /api/repondants/:id
function saveReponsesPilier(id, pilierId, reponses) { nonMigre_(3); } // PUT /api/repondants/:id/piliers/:pilierId/reponses
function soumettreRepondant(id) { nonMigre_(3); }                    // POST /api/repondants/:id/soumission

// --- Lot 4 : pilotage et restitution --------------------------------------
function getValeursRepondants(champ) { nonMigre_(4); }               // GET /api/repondants/valeurs/:champ
function fusionRepondants(payload) { nonMigre_(4); }                 // POST /api/repondants/fusion
function listEquipes(id) { nonMigre_(4); }                           // GET /api/sessions/:id/equipes
function listDepartements(id) { nonMigre_(4); }                      // GET /api/sessions/:id/departements
function getParticipation(id) { nonMigre_(4); }                      // GET /api/sessions/:id/participation
function getCommentaire(id, equipe) { nonMigre_(4); }                // GET /api/sessions/:id/commentaire
function saveCommentaire(id, equipe, texte) { nonMigre_(4); }        // PUT /api/sessions/:id/commentaire
function getQuestionDetail(id, questionId) { nonMigre_(4); }         // GET /api/sessions/:id/questions/:questionId/detail
function getResultats(id, filtres) { nonMigre_(4); }                 // GET /api/sessions/:id/resultats
function getConsolidation(id, filtres) { nonMigre_(4); }             // GET /api/sessions/:id/consolidation
function getComparaison(id, filtres) { nonMigre_(4); }               // GET /api/sessions/:id/comparaison

// --- Lot 5 : import du referentiel (xlsx + correcteur) --------------------
function importReferentiel(fichierBase64, options) { nonMigre_(5); } // POST /api/referentiel/import

// --- Lot 6 : export PPT via SlidesApp --------------------------------------
function exportPpt(id, filtres) { nonMigre_(6); }                    // GET /api/sessions/:id/export-ppt
