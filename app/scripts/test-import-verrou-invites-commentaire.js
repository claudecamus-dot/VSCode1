// Garde « import du referentiel en cours » (503) sur les deux ecritures qui
// l'oubliaient : POST /api/sessions/:id/invites et PUT /api/sessions/:id/commentaire.
// Le verrou interne (compteur arme quelques ms) n'est pas armable de facon
// deterministe de l'exterieur : on lance le VRAI serveur avec le prechargement de
// test preload-test-serveur.js (PRELOAD_FORCER_IMPORT=1), qui force
// estImportRemplacerEnCours() a true. Zero crochet de test dans src/.
// Controle : sans le prechargement, les memes appels reussissent (200).
const path = require('node:path');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, json, fetchMutant, nettoyer } = require('./harnais-robustesse');

function multipartInvites(base, sessionId) {
  const f = new FormData();
  f.append('fichier', new Blob(['email\nanna@example.com\n'], { type: 'text/csv' }), 'invites.csv');
  return fetchMutant(`${base}/api/sessions/${sessionId}/invites`, { method: 'POST', body: f });
}

(async () => {
  const dossier = dossierTemporaire('verrou-import');
  const dbPath = path.join(dossier, 'v.db');
  creerBaseAvecReferentiel(dbPath);
  try {
    const libre = await lancer({ dbPath, nom: 'verrou-libre' });
    let sessionId;
    try {
      sessionId = await creerSessionOuverte(libre.base);
      const i = await multipartInvites(libre.base, sessionId);
      check(i.status === 200, `controle : invites sans verrou -> 200 (recu ${i.status})`);
      const c = await json(libre.base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'E', texte: 'x' });
      check(c.status === 200, `controle : commentaire sans verrou -> 200 (recu ${c.status})`);
    } finally { await libre.arreter(); }

    const verrou = await lancer({ dbPath, nom: 'verrou-arme', avecPreload: true, env: { PRELOAD_FORCER_IMPORT: '1' } });
    try {
      const ref = await json(verrou.base, `/api/sessions/${sessionId}/repondants`, 'POST', { email: 'a@b.fr' });
      check(ref.status === 503, `preuve que le verrou est arme : inscription -> 503 (recu ${ref.status})`);
      const i = await multipartInvites(verrou.base, sessionId);
      check(i.status === 503, `invites pendant l'import -> 503 (recu ${i.status})`);
      const c = await json(verrou.base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: 'E', texte: 'y' });
      check(c.status === 503, `commentaire pendant l'import -> 503 (recu ${c.status})`);
      const lecture = await fetchMutant(`${verrou.base}/api/sessions/${sessionId}/commentaire?equipe=E`);
      check(lecture.status === 200 && (await lecture.json()).texte === 'x', 'la lecture du commentaire reste permise, ancienne valeur intacte');
      const liste = await fetchMutant(`${verrou.base}/api/sessions/${sessionId}/invites`);
      check(liste.status === 200 && (await liste.json()).length === 1, 'les invites ne sont pas modifiees par la requete refusee');
    } finally { await verrou.arreter(); }
  } finally { await nettoyer(dossier); }
  terminer();
  console.log('Verrou d\'import (invites, commentaire) OK');
})().catch((e) => { console.error(e); process.exit(1); });
