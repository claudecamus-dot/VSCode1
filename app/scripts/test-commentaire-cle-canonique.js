// Cle du commentaire de restitution : GET et PUT resolvent la MEME cle, rapprochee
// (casse, accents, espaces) des equipes connues DE LA SESSION comme le font les
// repondants (valeurCanonique). Equipe inconnue de la session : saisie nettoyee.
// Aucune migration : un commentaire historique stocke sous une graphie qui
// correspond exactement a une equipe reste lisible tel quel.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, corpsRepondant, json, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('commentaire-cle');
  const dbPath = path.join(dossier, 'c.db');
  creerBaseAvecReferentiel(dbPath);
  const serveur = await lancer({ dbPath, nom: 'commentaire-cle' });
  const base = serveur.base;
  const lire = async (sessionId, graphie) => (await json(base, `/api/sessions/${sessionId}/commentaire?equipe=${encodeURIComponent(graphie)}`, 'GET')).json();
  let sessionId;
  try {
    sessionId = await creerSessionOuverte(base);
    const ins = await json(base, `/api/sessions/${sessionId}/repondants`, 'POST', corpsRepondant({ equipe: 'Équipe Alpha' }));
    check(ins.status === 200, `preparation : repondant de l'equipe « Équipe Alpha » (recu ${ins.status})`);

    const put = await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: '  equipe   ALPHA ', texte: 'avis alpha' });
    check(put.status === 200, `PUT sous une graphie differente -> 200 (recu ${put.status})`);
    for (const graphie of ['Équipe Alpha', 'equipe alpha', 'EQUIPE   ALPHA', ' Équipe Alpha ']) {
      const corps = await lire(sessionId, graphie);
      check(corps.texte === 'avis alpha', `GET « ${graphie} » retrouve le commentaire (texte « ${corps.texte} »)`);
    }
    // Une seconde ecriture sous une autre graphie ECRASE (meme cle), elle ne cree pas une 2e ligne.
    await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'EQUIPE ALPHA', texte: 'avis alpha v2' });
    check((await lire(sessionId, 'Équipe Alpha')).texte === 'avis alpha v2', 'la seconde ecriture remplace la premiere (une seule cle)');

    // Equipe inconnue de la session : saisie nettoyee, coherente entre GET et PUT.
    await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: '  Inconnue   Zeta ', texte: 'zeta' });
    check((await lire(sessionId, 'Inconnue Zeta')).texte === 'zeta', 'equipe inconnue : conservee telle quelle (nettoyee)');

    // Effacer par texte vide, sous une autre graphie.
    await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'equipe alpha', texte: '' });
    check((await lire(sessionId, 'Équipe Alpha')).texte === '', 'texte vide : le commentaire est efface');
  } finally { await serveur.arreter(); }

  // Controle direct de la base : la cle stockee est la graphie canonique.
  const lecture = new DatabaseSync(dbPath);
  const cles = lecture.prepare('SELECT equipe FROM commentaires WHERE session_id = ? ORDER BY equipe').all(sessionId).map((r) => r.equipe);
  lecture.close();
  check(JSON.stringify(cles) === JSON.stringify(['Inconnue Zeta']), `cles stockees : seulement l'inconnue nettoyee (${JSON.stringify(cles)})`);

  // Historique : commentaire stocke sous une graphie MINORITAIRE d'une equipe existante.
  const ecriture = new DatabaseSync(dbPath);
  const ajouter = ecriture.prepare("INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at) VALUES (?, ?, ?, 'N', 'P', 'D', ?, 'R', 0, 1, '2026-01-01T00:00:00.000Z')");
  ajouter.run('h1', sessionId, 'h1@x.fr', 'Beta Hist');
  ajouter.run('h2', sessionId, 'h2@x.fr', 'Beta Hist');
  ajouter.run('h3', sessionId, 'h3@x.fr', 'beta hist');
  ecriture.prepare("INSERT INTO commentaires (session_id, equipe, texte, updated_at) VALUES (?, 'beta hist', 'ancien', '2026-01-01T00:00:00.000Z')").run(sessionId);
  ecriture.close();
  const serveur2 = await lancer({ dbPath, nom: 'commentaire-cle2' });
  try {
    // « beta hist » correspond EXACTEMENT a une equipe (graphie minoritaire) : lisible tel quel.
    const g = await (await json(serveur2.base, `/api/sessions/${sessionId}/commentaire?equipe=beta%20hist`, 'GET')).json();
    check(g.texte === 'ancien', 'historique : « beta hist » lit encore le commentaire stocke sous cette graphie');
  } finally { await serveur2.arreter(); }

  // Cle STABLE : l'orthographe majoritaire s'inverse APRES l'ecriture du commentaire (scenario
  // releve par trois voix de revue). Avant : la cle canonique suivait les effectifs, le GET sous
  // une autre graphie ne retrouvait plus le texte, le PUT creait une 2e ligne et le texte vide
  // n'effacait qu'une partie.
  const serveur3 = await lancer({ dbPath, nom: 'commentaire-cle3' });
  try {
    const s2 = await creerSessionOuverte(serveur3.base);
    const insA = await json(serveur3.base, `/api/sessions/${s2}/repondants`, 'POST', corpsRepondant({ equipe: 'Equipe A' }));
    check(insA.status === 200, `stabilite : inscription « Equipe A » (recu ${insA.status})`);
    await json(serveur3.base, `/api/sessions/${s2}/commentaire`, 'PUT', { equipe: 'Equipe A', texte: 'avis initial' });
    // Deux inscrits sous une autre graphie : « equipe a » devient majoritaire.
    const inserer = new DatabaseSync(dbPath);
    const ajout = inserer.prepare("INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at) VALUES (?, ?, ?, 'N', 'P', 'D', ?, 'R', 0, 1, '2026-01-01T00:00:00.000Z')");
    ajout.run('m1', s2, 'm1@x.fr', 'equipe a');
    ajout.run('m2', s2, 'm2@x.fr', 'equipe a');
    inserer.close();
    for (const graphie of ['Equipe A', 'equipe a', 'ÉQUIPE A', 'Equipe   A']) {
      const corps = await (await json(serveur3.base, `/api/sessions/${s2}/commentaire?equipe=${encodeURIComponent(graphie)}`, 'GET')).json();
      check(corps.texte === 'avis initial', `apres inversion des effectifs, GET « ${graphie} » retrouve le commentaire (« ${corps.texte} »)`);
    }
    await json(serveur3.base, `/api/sessions/${s2}/commentaire`, 'PUT', { equipe: 'equipe a', texte: 'avis v2' });
    const apres = new DatabaseSync(dbPath, { readOnly: true });
    const lignes = apres.prepare('SELECT equipe, texte FROM commentaires WHERE session_id = ?').all(s2);
    apres.close();
    check(lignes.length === 1 && lignes[0].texte === 'avis v2', `un PUT sous une graphie equivalente met a jour la MEME ligne, pas de doublon (${JSON.stringify(lignes)})`);
    await json(serveur3.base, `/api/sessions/${s2}/commentaire`, 'PUT', { equipe: 'ÉQUIPE A', texte: '' });
    const vide = new DatabaseSync(dbPath, { readOnly: true });
    const restant = vide.prepare('SELECT COUNT(*) AS n FROM commentaires WHERE session_id = ?').get(s2).n;
    vide.close();
    check(restant === 0, `un texte vide sous une graphie equivalente efface la ligne (reste ${restant})`);
    // Borne : l'equipe du commentaire est plafonnee comme a l'inscription.
    const long = 'x'.repeat(201);
    const g = await json(serveur3.base, `/api/sessions/${s2}/commentaire?equipe=${long}`, 'GET');
    const p = await json(serveur3.base, `/api/sessions/${s2}/commentaire`, 'PUT', { equipe: long, texte: 't' });
    check(g.status === 400 && p.status === 400, `equipe de 201 caracteres refusee en GET et en PUT (${g.status}/${p.status})`);
  } finally { await serveur3.arreter(); }
  await nettoyer(dossier);
  terminer();
  console.log('Cle canonique du commentaire OK');
})().catch((e) => { console.error(e); process.exit(1); });
