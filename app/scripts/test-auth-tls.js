// Compromis D (securite) : Basic Auth ne doit pas etre accepte en clair quand
// on sait que la requete l'est (X-Forwarded-Proto: http) ou quand le deploiement
// l'exige (AUTH_EXIGE_TLS=1). Sans cela le http://localhost du dev reste intact.
const assert = require('node:assert/strict');
const { barriereAuth } = require('../src/auth');

const env = (extra = {}) => ({ AUTH_USER: 'u', AUTH_PASS: 'p', APP_ENV: 'PROD', ...extra });
const credsOk = 'Basic ' + Buffer.from('u:p').toString('base64');

function appeler(mw, { headers = {}, secure = false, path = '/api/sessions' } = {}) {
  let statut = null; let suite = false;
  const res = { set() { return res; }, status(c) { statut = c; return res; }, json() { return res; } };
  mw({ method: 'GET', path, headers, secure }, res, () => { suite = true; });
  return { statut, suite };
}

const defaut = barriereAuth(env());
const exige = barriereAuth(env({ AUTH_EXIGE_TLS: '1' }));

let r = appeler(defaut, { headers: { authorization: credsOk } });
assert.equal(r.suite, true, 'dev http direct : identifiants valides acceptes (inchange)');

r = appeler(defaut, { headers: { authorization: credsOk, 'x-forwarded-proto': 'http' } });
assert.equal(r.suite, false, 'proxy annonce http : refuse malgre identifiants valides');
assert.equal(r.statut, 403);

r = appeler(defaut, { headers: { authorization: credsOk, 'x-forwarded-proto': 'https' } });
assert.equal(r.suite, true, 'proxy annonce https : accepte');

r = appeler(exige, { headers: { authorization: credsOk } });
assert.equal(r.suite, false, 'AUTH_EXIGE_TLS=1 sans preuve https : refuse');
assert.equal(r.statut, 403);

r = appeler(exige, { headers: { authorization: credsOk, 'x-forwarded-proto': 'https' } });
assert.equal(r.suite, true, 'AUTH_EXIGE_TLS=1 + https : accepte');
r = appeler(exige, { headers: { authorization: credsOk }, secure: true });
assert.equal(r.suite, true, 'AUTH_EXIGE_TLS=1 + req.secure : accepte');

r = appeler(exige, { path: '/api/sessions/11111111-2222-3333-4444-555555555555/roles', headers: { 'x-forwarded-proto': 'http' } });
assert.equal(r.statut === 403 || r.suite === true, true, 'chemin repondant : decision inchangee ou refus TLS, jamais 401');

for (const xfp of ['https, http', 'HTTP', 'https,HTTP']) {
  for (const mw of [defaut, exige]) {
    r = appeler(mw, { headers: { authorization: credsOk, 'x-forwarded-proto': xfp } });
    assert.equal(r.suite, false, `X-Forwarded-Proto "${xfp}" : refuse`);
    assert.equal(r.statut, 403);
  }
}
r = appeler(exige, { headers: { authorization: credsOk, 'x-forwarded-proto': 'https, https' } });
assert.equal(r.suite, true, 'toutes valeurs https : accepte');

console.log('Auth TLS OK');
