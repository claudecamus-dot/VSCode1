// Export PPT : une exception DANS le rappel d'execFile (hors handler Express) ne doit pas
// faire tomber le processus -> 500 JSON propre, sans donnee nominative dans les journaux.
// Faute injectee : un shim --require fait lever le PREMIER console.error('[export-ppt] ...')
// du serveur ; Python est remplace par node (script .py -> echec) pour entrer dans la branche erreur.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('back-ppt-callback');
  const dbPath = path.join(dossier, 'p.db');
  creerBaseAvecReferentiel(dbPath);
  const shim = path.join(dossier, 'shim.js');
  fs.writeFileSync(shim, [
    "const path = require('node:path');",
    "if (path.basename(process.argv[1] || '') === 'server.js') {",
    '  const orig = console.error; let leve = false;',
    "  console.error = (...a) => { if (!leve && String(a[0]).startsWith('[export-ppt]')) { leve = true; throw new Error('jean.dupont@example.com'); } return orig(...a); };",
    '}', '',
  ].join('\n'));
  const serveur = await lancer({ dbPath, nom: 'back-ppt-callback', env: { PYTHON: process.execPath, NODE_OPTIONS: `--require ${shim}` } });
  try {
    const sessionId = await creerSessionOuverte(serveur.base);
    const w = new DatabaseSync(dbPath);
    w.prepare("INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at) VALUES ('r1', ?, 'r1@x.fr', 'N', 'P', 'D', 'Alpha', 'R', 0, 1, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')").run(sessionId);
    w.close();
    const res = await fetch(`${serveur.base}/api/sessions/${sessionId}/export-ppt?scope=equipe&equipe=Alpha`, { signal: AbortSignal.timeout(30000) }).catch((e) => ({ status: `echec reseau ${e.cause && e.cause.code}`, text: async () => '' }));
    const corps = await res.text();
    check(res.status === 500, `exception dans le rappel execFile -> 500 (recu ${res.status})`);
    check(!corps.includes('jean.dupont'), 'le corps 500 ne contient pas le message de l exception');
    check(serveur.serveur.exitCode === null, 'le processus serveur est toujours vivant');
    check(!serveur.sortie().includes('jean.dupont'), 'aucune donnee nominative dans les journaux du serveur');
    const suite = await fetch(`${serveur.base}/api/env`).then((r) => r.status).catch(() => 'mort');
    check(suite === 200, `le serveur repond encore apres l exception (${suite})`);
  } finally { await serveur.arreter(); await nettoyer(dossier); }
  terminer();
  console.log('Rappel execFile PPT OK');
})().catch((e) => { console.error(e); process.exit(1); });
