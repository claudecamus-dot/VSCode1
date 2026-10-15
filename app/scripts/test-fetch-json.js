// Verrou de src/public/fetch-json.js (global navigateur, evalue ici dans un contexte
// isole avec un faux fetch) : une reponse non ok DOIT lever (avant, les pages
// continuaient avec { error } et plantaient sur .map/.filter), le message vient du
// serveur, et la garde de sequence ne laisse passer que le dernier chargement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'public', 'fetch-json.js'), 'utf8');
function charger(fauxFetch) {
  const ctx = { fetch: fauxFetch, Error, JSON };
  vm.createContext(ctx);
  vm.runInContext(`${source}\nthis.fetchJson = fetchJson; this.gardeSequence = gardeSequence;`, ctx);
  return ctx;
}
const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (corps === undefined) throw new SyntaxError('x'); return corps; } });

async function main() {
  let c = charger(async () => reponse(200, { a: 1 }));
  assert.deepEqual(await c.fetchJson('/x'), { a: 1 }, '200 : renvoie le JSON');

  c = charger(async () => reponse(404, { error: 'Session introuvable.' }));
  await assert.rejects(() => c.fetchJson('/x'), (e) => e.message === 'Session introuvable.' && e.status === 404, '404 : leve avec le message du serveur');

  c = charger(async () => reponse(500, undefined));
  await assert.rejects(() => c.fetchJson('/x'), (e) => e.message === 'HTTP 500' && e.status === 500, '500 sans corps JSON : message HTTP 500');

  c = charger(async () => reponse(200, undefined));
  await assert.rejects(() => c.fetchJson('/x'), (e) => /illisible/.test(e.message), '200 avec corps non JSON : leve');

  c = charger(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(() => c.fetchJson('/x'), (e) => e.status === 0 && /Connexion interrompue/.test(e.message), 'reseau coupe : status 0');

  const g = charger(async () => reponse(200, {})).gardeSequence();
  const j1 = g.prochain();
  const j2 = g.prochain();
  assert.equal(g.estCourant(j1), false, 'le chargement le plus ancien est perime');
  assert.equal(g.estCourant(j2), true, 'le plus recent est courant');

  console.log('fetch-json OK');
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
