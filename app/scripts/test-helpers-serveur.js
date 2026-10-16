// Verrou du helper de demarrage des tests (helpers-serveur.js) : attendreServeur doit
// echouer TOUT DE SUITE avec la sortie du serveur quand l'enfant meurt au demarrage
// (avant, il bouclait jusqu'au delai puis ne disait que « fetch failed »), garder un
// delai plancher meme quand l'appelant passe 15000, et attendreMort doit tuer un enfant
// qui ne sort pas.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, demarrerServeur } = require('./helpers-serveur');

async function main() {
  // 1) L'enfant meurt tout de suite : echec rapide, sortie de l'enfant dans le message.
  const base = `http://127.0.0.1:${await portLibre()}`;
  const mort = spawn(process.execPath, ['-e', "console.error('boom-demarrage'); process.exit(3)"], { stdio: ['ignore', 'pipe', 'pipe'] });
  let vu = '';
  mort.stdout.on('data', (d) => { vu += d; });
  mort.stderr.on('data', (d) => { vu += d; });
  const debut = Date.now();
  await assert.rejects(
    () => attendreServeur(base, 15000, mort, () => vu),
    (e) => /s'est arrete avant d'etre joignable/.test(e.message) && /exitCode=3/.test(e.message) && /boom-demarrage/.test(e.message),
    'enfant mort : message avec exitCode et sortie du serveur',
  );
  assert.ok(Date.now() - debut < 10000, `echec rapide attendu (< 10 s), mesure ${Date.now() - debut} ms`);

  // 2) Delai effectif = max(delai passe, TEST_SERVER_TIMEOUT_MS) : un appelant qui passe
  //    100 ms n'est pas plus court que le plancher (ici 700 ms pour que le test reste vif).
  process.env.TEST_SERVER_TIMEOUT_MS = '700';
  const t0 = Date.now();
  await assert.rejects(() => attendreServeur(base, 100), /Serveur injoignable apres 700 ms/, 'plancher applique');
  const ecoule = Date.now() - t0;
  assert.ok(ecoule >= 600, `le plancher doit etre respecte (>= 600 ms), mesure ${ecoule} ms`);
  delete process.env.TEST_SERVER_TIMEOUT_MS;

  // 2bis) Detection AUTOMATIQUE : un enfant dont un argument se termine par server.js est suivi
  //       sans qu'on le passe (c'est le cas des ~24 tests anciens). Le plancher est reduit a
  //       700 ms : sans le suivi, l'echec serait « Serveur injoignable » et non « s'est arrete ».
  process.env.TEST_SERVER_TIMEOUT_MS = '700';
  const faux = spawn(process.execPath, ['-e', "console.error('boom-auto'); process.exit(4)", 'chemin/server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await assert.rejects(
    () => attendreServeur(base, 100),
    (e) => /s'est arrete avant d'etre joignable/.test(e.message) && /exitCode=4/.test(e.message) && /boom-auto/.test(e.message),
    'enfant server.js non passe en parametre : detecte automatiquement avec sa sortie',
  );
  delete process.env.TEST_SERVER_TIMEOUT_MS;
  await attendreMort(faux);

  // 2ter) Valeur invalide de TEST_SERVER_TIMEOUT_MS : avertissement, plancher par defaut.
  const avertissements = [];
  const warnOrigine = console.warn;
  console.warn = (...m) => { avertissements.push(m.join(' ')); };
  process.env.TEST_SERVER_TIMEOUT_MS = 'abc';
  const fauxCourt = spawn(process.execPath, ['-e', 'process.exit(5)', 'x/server.js'], { stdio: 'ignore' });
  await assert.rejects(() => attendreServeur(base, 100, fauxCourt), /s'est arrete/);
  console.warn = warnOrigine;
  delete process.env.TEST_SERVER_TIMEOUT_MS;
  assert.ok(avertissements.some((m) => /TEST_SERVER_TIMEOUT_MS/.test(m) && /ignore/.test(m)), 'valeur invalide : avertissement emis');

  // 2quater) Serveur VIVANT qui n'ecoute jamais (cas de l'echec observe sur `npm test`) : le message
  //          doit dire qu'il est vivant, le port, la cause reseau (ECONNREFUSED, pas « fetch failed »),
  //          le nombre de tentatives et ce que l'enfant avait ecrit.
  process.env.TEST_SERVER_TIMEOUT_MS = '1200';
  const baseMuette = `http://127.0.0.1:${await portLibre()}`;
  const muet = spawn(process.execPath, ['-e', "console.log('demarrage-lent-sans-ecoute'); setInterval(() => {}, 1000)", 'chemin/server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let vuMuet = '';
  muet.stdout.on('data', (d) => { vuMuet += d; });
  await new Promise((r) => setTimeout(r, 600)); // laisse l'enfant ecrire sa ligne
  const t1 = Date.now();
  await assert.rejects(
    () => attendreServeur(baseMuette, 100, muet, () => vuMuet),
    (e) => /Serveur injoignable apres 1200 ms/.test(e.message)
      && /"vivant":true/.test(e.message)
      && /ECONNREFUSED/.test(e.message)
      && /tentatives=\d+/.test(e.message)
      && new RegExp(`port ${new URL(baseMuette).port}`).test(e.message)
      && /demarrage-lent-sans-ecoute/.test(e.message),
    'enfant vivant sans ecoute : message complet (vivant, port, ECONNREFUSED, tentatives, sortie)',
  );
  assert.ok(Date.now() - t1 < 8000, 'le diagnostic arrive dans le delai (pas de pendaison)');
  delete process.env.TEST_SERVER_TIMEOUT_MS;
  muet.kill('SIGKILL');
  await attendreMort(muet);

  // 3) attendreMort tue un enfant qui ne sort pas apres le delai.
  const tetu = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  await attendreMort(tetu, 500);
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(tetu.exitCode !== null || tetu.signalCode !== null, 'enfant recalcitrant tue par attendreMort');

  // 4) demarrerServeur : serveur factice qui ecoute sur PORT avec l'env passe, puis arreter() le tue ;
  //    un serveur factice qui meurt au demarrage echoue vite avec sa sortie.
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-demarrer-'));
  const faux1 = path.join(dossier, 'server.js');
  fs.writeFileSync(faux1, "require('node:http').createServer((q, r) => r.end(JSON.stringify({ env: process.env.MARQUEUR, arg: process.argv[2] }))).listen(Number(process.env.PORT), '127.0.0.1'); console.log('faux serveur pret');");
  const srv = await demarrerServeur({ chemin: faux1, env: { MARQUEUR: 'valeur-env' }, args: ['un-arg'] });
  assert.ok(srv.port > 0 && srv.base === `http://127.0.0.1:${srv.port}`, 'port et base coherents');
  const corps = await (await fetch(`${srv.base}/api/env`)).json();
  assert.equal(corps.env, 'valeur-env', 'env propage au serveur');
  assert.equal(corps.arg, 'un-arg', 'args propages au serveur');
  assert.match(srv.sortie(), /faux serveur pret/, 'sortie() rend ce que le serveur a ecrit');
  await srv.arreter();
  assert.ok(srv.enfant.exitCode !== null || srv.enfant.signalCode !== null, 'arreter() tue vraiment le serveur');
  const faux2 = path.join(dossier, 'mort.js');
  fs.writeFileSync(faux2, "console.error('boom-demarrer'); process.exit(7);");
  const t2 = Date.now();
  await assert.rejects(
    () => demarrerServeur({ chemin: faux2 }),
    (e) => /s'est arrete avant d'etre joignable/.test(e.message) && /exitCode=7/.test(e.message) && /boom-demarrer/.test(e.message),
    'serveur mort au demarrage : echec rapide avec sa sortie',
  );
  assert.ok(Date.now() - t2 < 10000, 'echec rapide (< 10 s)');
  fs.rmSync(dossier, { recursive: true, force: true });

  console.log('Helpers serveur OK');
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
