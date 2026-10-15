// Filet d'erreur terminal sur le VRAI serveur :
//   1. base verrouillee par un autre processus (BEGIN EXCLUSIVE externe) -> une
//      ecriture echoue en SQLITE_BUSY apres le delai de 5 s : reponse 503 JSON
//      avec en-tete Retry-After (et non un 500 « erreur interne ») ;
//   2. une erreur 500 (violation d'unicite provoquee par un declencheur de test)
//      est journalisee SANS query string, SANS e-mail, SANS message SQL brut,
//      SANS pile ; la reponse ne porte aucune pile.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, corpsRepondant, json, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('erreur-503');
  const dbPath = path.join(dossier, 'e.db');
  creerBaseAvecReferentiel(dbPath);
  const serveur = await lancer({ dbPath, nom: 'erreur-503' });
  const base = serveur.base;
  let externe = null;
  try {
    const sessionId = await creerSessionOuverte(base);

    // --- 1. base verrouillee -> 503 + Retry-After
    externe = new DatabaseSync(dbPath, { timeout: 1000 });
    externe.exec('BEGIN EXCLUSIVE');
    const t0 = Date.now();
    const verrouille = await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'E', texte: 'bloque' });
    const corps = await verrouille.json().catch(() => ({}));
    check(verrouille.status === 503, `ecriture sur base verrouillee -> 503 (recu ${verrouille.status} apres ${Date.now() - t0} ms)`);
    check(Number(verrouille.headers.get('retry-after')) > 0, `en-tete Retry-After present (« ${verrouille.headers.get('retry-after')} »)`);
    check(typeof corps.error === 'string' && !/sqlite|locked|stack|\bat /i.test(corps.error), `message JSON sans detail interne (« ${corps.error} »)`);
    const lecture = await json(base, `/api/sessions/${sessionId}`, 'GET');
    check(lecture.status === 200, 'une lecture reste servie pendant le verrou (WAL)');
    externe.exec('ROLLBACK');
    externe.close();
    externe = null;
    const apres = await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'E', texte: 'libre' });
    check(apres.status === 200, `ecriture de nouveau possible apres liberation (recu ${apres.status})`);
  } finally {
    if (externe) { try { externe.exec('ROLLBACK'); externe.close(); } catch { /* deja ferme */ } }
    await serveur.arreter();
  }

  // --- 2. journal d'une erreur 500 : declencheur de test qui viole une contrainte d'unicite
  const piege = new DatabaseSync(dbPath);
  piege.exec(`
    CREATE TABLE piege (email TEXT UNIQUE);
    INSERT INTO piege VALUES ('jean@example.com');
    CREATE TRIGGER piege_inscription BEFORE INSERT ON repondants BEGIN INSERT INTO piege VALUES (NEW.email); END;
  `);
  const sessionLue = piege.prepare('SELECT id FROM sessions LIMIT 1').get().id;
  piege.close();
  const serveur2 = await lancer({ dbPath, nom: 'erreur-journal' });
  try {
    const r = await json(serveur2.base, `/api/sessions/${sessionLue}/repondants?jeton=QS-SECRET-4242&mail=jean@example.com`, 'POST', corpsRepondant({ email: 'jean@example.com' }));
    const texte = await r.text();
    check(r.status === 500, `violation d'unicite non anticipee -> 500 (recu ${r.status})`);
    check(!/\n\s+at |stack/i.test(texte) && !texte.includes('UNIQUE'), 'reponse sans pile ni message SQL');
    await new Promise((res) => setTimeout(res, 300));
    const journal = serveur2.sortie();
    check(journal.includes('[erreur non geree] POST') && journal.includes(`/api/sessions/${sessionLue}/repondants`), 'le journal garde methode et chemin');
    check(!journal.includes('QS-SECRET-4242'), 'le journal ne contient PAS la query string');
    check(!journal.includes('jean@example.com'), 'le journal ne contient PAS l\'e-mail');
    check(!journal.includes('UNIQUE constraint') && !/\n\s+at /.test(journal), 'le journal ne contient ni message SQL brut ni pile');
  } finally { await serveur2.arreter(); await nettoyer(dossier); }
  terminer();
  console.log('503 base verrouillee et journal sans donnee nominative OK');
})().catch((e) => { console.error(e); process.exit(1); });
