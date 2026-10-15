/* exported fetchJson, gardeSequence */
// Helpers partages par les pages (resultats, pilotage, repondre, admin) : audit du
// comite de revue du 2026-10-14, ces 4 pages appelaient fetch(...).json() sans tester
// res.ok (une erreur 4xx/5xx renvoie { error } et la suite plantait sur .map/.filter)
// et sans protection contre les reponses qui arrivent dans le desordre.
//
// Global navigateur simple, charge en <script src> SANS defer avant le bloc inline,
// comme /esc.js.

// Renvoie le JSON de la reponse ; leve une Error si la reponse n'est pas ok (message =
// champ `error` du serveur si present, sinon « HTTP <statut> »), ou si le corps n'est
// pas du JSON. `err.status` porte le statut HTTP (0 si le reseau a echoue).
async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (cause) {
    const err = new Error('Connexion interrompue.');
    err.status = 0;
    err.cause = cause;
    throw err;
  }
  let corps;
  try {
    corps = await res.json();
  } catch {
    corps = null;
  }
  if (!res.ok) {
    const err = new Error((corps && typeof corps.error === 'string' && corps.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (corps === null) {
    const err = new Error('Reponse du serveur illisible.');
    err.status = res.status;
    throw err;
  }
  return corps;
}

// Garde de sequence : chaque chargement prend un jeton avec prochain() ; quand sa
// reponse arrive, il ne doit rien ecrire si estCourant(jeton) est faux (un chargement
// plus recent a demarre entre-temps).
//   const garde = gardeSequence();
//   const jeton = garde.prochain();
//   const data = await fetchJson(url);
//   if (!garde.estCourant(jeton)) return;
function gardeSequence() {
  let courant = 0;
  return {
    prochain() { courant += 1; return courant; },
    estCourant(jeton) { return jeton === courant; },
  };
}
