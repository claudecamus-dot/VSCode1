// Arret propre (src/arret.js) teste SANS signal reel (sous Windows kill() est un
// arret dur) : faux processus (EventEmitter), faux serveur, faux db.
const { EventEmitter } = require('node:events');
const { installerArret, delaiDepuisEnv } = require('../src/arret');
const { check, terminer } = require('./harnais-robustesse');

function monter({ delaiMs = 10000, serveurFerme = true, checkpointJette = false } = {}) {
  const processus = new EventEmitter();
  const appels = [];
  processus.exit = (code) => appels.push(`exit:${code}`);
  const serveur = {
    close(cb) { appels.push('close'); if (serveurFerme) setImmediate(cb); },
    closeIdleConnections() { appels.push('idle'); },
  };
  const db = {
    exec(sql) { appels.push(`exec:${sql}`); if (checkpointJette) throw new Error('verrou'); },
    close() { appels.push('db.close'); },
  };
  const journal = [];
  installerArret({ serveur, db, delaiMs, journal: (m) => journal.push(m), processus });
  return { processus, appels, journal };
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const s = monter();
    check(s.processus.listenerCount(signal) === 1, `${signal} : un ecouteur installe`);
    s.processus.emit(signal);
    await attendre(30);
    const i = (x) => s.appels.indexOf(x);
    check(i('close') === 0, `${signal} : serveur.close() appele en premier (${s.appels.join(' > ')})`);
    check(i('exec:PRAGMA wal_checkpoint(TRUNCATE)') > i('close') && i('db.close') > i('exec:PRAGMA wal_checkpoint(TRUNCATE)'), `${signal} : checkpoint WAL puis fermeture de la base apres close()`);
    check(s.appels[s.appels.length - 1] === 'exit:0', `${signal} : sortie en code 0 en dernier`);
    s.processus.emit(signal);
    await attendre(30);
    check(s.appels.filter((x) => x === 'close').length === 1, `${signal} : deuxieme signal ignore (arret idempotent)`);
  }

  // Le processus ne sort PAS avant que le serveur ait fini de fermer.
  const attente = monter();
  attente.processus.emit('SIGTERM');
  check(!attente.appels.includes('db.close') && !attente.appels.some((x) => x.startsWith('exit')), 'rien n\'est ferme avant la fin de serveur.close()');
  await attendre(30);

  // Delai maximal : close() ne rappelle jamais -> sortie 1.
  const bloque = monter({ delaiMs: 80, serveurFerme: false });
  bloque.processus.emit('SIGTERM');
  await attendre(30);
  check(!bloque.appels.some((x) => x.startsWith('exit')), 'delai : pas de sortie avant l\'echeance');
  await attendre(120);
  check(bloque.appels[bloque.appels.length - 1] === 'exit:1', `delai : sortie forcee en code 1 (${bloque.appels.join(' > ')})`);

  // Checkpoint en echec : la base est quand meme fermee, sortie normale.
  const ko = monter({ checkpointJette: true });
  ko.processus.emit('SIGTERM');
  await attendre(30);
  check(ko.appels.includes('db.close') && ko.appels[ko.appels.length - 1] === 'exit:0', 'checkpoint en echec : base fermee et sortie 0');

  // Filets : journal sans donnee nominative, meme arret, code 1.
  const u = monter();
  const err = Object.assign(new Error('echec pour jean@example.com'), { code: 'X1' });
  u.processus.emit('uncaughtException', err);
  await attendre(30);
  check(u.appels[0] === 'close' && u.appels[u.appels.length - 1] === 'exit:1', `uncaughtException : meme arret, code 1 (${u.appels.join(' > ')})`);
  check(!u.journal.join('\n').includes('jean@example.com'), "uncaughtException : le message (nominatif) n'est pas journalise");
  check(u.journal.some((m) => m.includes('uncaughtException') && m.includes('Error') && m.includes('X1')), 'uncaughtException : nom et code journalises');
  const r = monter();
  r.processus.emit('unhandledRejection', err);
  await attendre(30);
  check(r.appels[0] === 'close' && r.appels[r.appels.length - 1] === 'exit:1', 'unhandledRejection : meme arret, code 1');

  // Second signal PENDANT un arret qui ne finit pas : sortie forcee en code 1 (Ctrl+C insistant,
  // ou delai de grace de Docker avant SIGKILL). Apres la fin de l'arret, un signal tardif est ignore.
  const coince = monter({ serveurFerme: false });
  coince.processus.emit('SIGTERM');
  await attendre(20);
  check(!coince.appels.some((x) => x.startsWith('exit')), 'second signal : premier signal, pas encore de sortie (close() ne rappelle pas)');
  coince.processus.emit('SIGINT');
  check(coince.appels[coince.appels.length - 1] === 'exit:1', `second signal pendant l'arret : sortie forcee en code 1 (${coince.appels.join(' > ')})`);
  check(coince.appels.filter((x) => x === 'close').length === 1, 'second signal : serveur.close() appele une seule fois');

  // Un filet (uncaughtException) qui se declenche PENDANT un arret commence par un signal : code final 1.
  const mixte = monter();
  mixte.processus.emit('SIGTERM');
  mixte.processus.emit('uncaughtException', Object.assign(new Error('x'), { code: 'X9' }));
  await attendre(30);
  check(mixte.appels[mixte.appels.length - 1] === 'exit:1', `uncaughtException pendant un arret : code final 1, pas 0 (${mixte.appels.join(' > ')})`);

  check(delaiDepuisEnv({ ARRET_DELAI_MS: '2500' }) === 2500 && delaiDepuisEnv({}) === 10000 && delaiDepuisEnv({ ARRET_DELAI_MS: 'x' }) === 10000, 'ARRET_DELAI_MS : valeur valide, sinon defaut 10000');

  terminer();
  console.log('Arret propre OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
