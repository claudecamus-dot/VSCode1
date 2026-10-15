// Garde 409 de l'inscription : un e-mail historique stocke en casse mixte
// (« Jean@X.com ») doit etre vu quand le meme e-mail revient en minuscules.
// Decision utilisateur : AUCUNE migration des donnees existantes -- la comparaison
// se fait donc cote requete (lower(email)).
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, corpsRepondant, json, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('email-casse');
  const dbPath = path.join(dossier, 'e.db');
  creerBaseAvecReferentiel(dbPath);
  const premier = await lancer({ dbPath, nom: 'email-casse' });
  let sessionId;
  try { sessionId = await creerSessionOuverte(premier.base); } finally { await premier.arreter(); }

  const d = new DatabaseSync(dbPath);
  d.prepare("INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at) VALUES ('hist-1', ?, 'Jean@Example.COM', 'N', 'P', 'D', 'E', 'R', 0, 1, '2026-01-01T00:00:00.000Z')").run(sessionId);
  d.close();

  const serveur = await lancer({ dbPath, nom: 'email-casse2' });
  try {
    const r = await json(serveur.base, `/api/sessions/${sessionId}/repondants`, 'POST', corpsRepondant({ email: 'jean@example.com' }));
    check(r.status === 409, `inscription « jean@example.com » face a l'historique « Jean@Example.COM » -> 409 (recu ${r.status})`);
    const r2 = await json(serveur.base, `/api/sessions/${sessionId}/repondants`, 'POST', corpsRepondant({ email: '  JEAN@example.com ' }));
    check(r2.status === 409, `variante avec espaces et majuscules -> 409 (recu ${r2.status})`);
    const r3 = await json(serveur.base, `/api/sessions/${sessionId}/repondants`, 'POST', corpsRepondant({ email: 'autre@example.com' }));
    check(r3.status === 200, `un autre e-mail passe toujours (recu ${r3.status})`);
  } finally { await serveur.arreter(); }
  const v = new DatabaseSync(dbPath);
  const emails = v.prepare('SELECT email FROM repondants WHERE session_id = ? ORDER BY email').all(sessionId).map((x) => x.email);
  v.close();
  check(emails.includes('Jean@Example.COM') && emails.length === 2, `la ligne historique n'est PAS migree (${JSON.stringify(emails)})`);
  await nettoyer(dossier);
  terminer();
  console.log('E-mail en casse mixte OK');
})().catch((e) => { console.error(e); process.exit(1); });
