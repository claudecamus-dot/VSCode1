// Unicode : les bornes de longueur se mesurent apres NFC, et la valeur STOCKEE est la forme NFC.
// « é » decompose (e + U+0301) = 2 points de code ; 200 « é » decomposes doivent passer comme 200 « é » composes.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, corpsRepondant, json, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('back-unicode');
  const dbPath = path.join(dossier, 'u.db');
  creerBaseAvecReferentiel(dbPath);
  const serveur = await lancer({ dbPath, nom: 'back-unicode' });
  const decompose = 'é';
  try {
    const base = serveur.base;
    const sessionId = await creerSessionOuverte(base);
    const route = `/api/sessions/${sessionId}/repondants`;
    for (const champ of ['nom', 'prenom', 'role', 'departement', 'equipe']) {
      const ok = await json(base, route, 'POST', corpsRepondant({ email: `${champ}-d200@example.com`, [champ]: decompose.repeat(200) }));
      check(ok.status === 200, `${champ} : 200 « é » decomposes (400 points de code) -> accepte (recu ${ok.status})`);
      const trop = await json(base, route, 'POST', corpsRepondant({ email: `${champ}-d201@example.com`, [champ]: decompose.repeat(201) }));
      check(trop.status === 400, `${champ} : 201 « é » decomposes -> 400 (recu ${trop.status})`);
    }
    // Stockage : forme NFC.
    const r = await json(base, route, 'POST', corpsRepondant({ email: 'nfc@example.com', nom: 'René', equipe: 'Equipé Z' }));
    check(r.status === 200, `inscription NFC (recu ${r.status})`);
    const lecture = new DatabaseSync(dbPath, { readOnly: true });
    const ligne = lecture.prepare("SELECT nom, equipe FROM repondants WHERE email = 'nfc@example.com'").get();
    lecture.close();
    check(ligne.nom === 'René' && ligne.equipe === 'Equipé Z', `valeurs stockees en NFC (${JSON.stringify(ligne)})`);
    // Commentaire : cle d'equipe bornee et stockee apres NFC.
    const put = await json(base, `/api/sessions/${sessionId}/commentaire`, 'PUT', { equipe: decompose.repeat(200), texte: 't' });
    check(put.status === 200, `commentaire : equipe de 200 « é » decomposes -> accepte (recu ${put.status})`);
    const get = await json(base, `/api/sessions/${sessionId}/commentaire?equipe=${encodeURIComponent('é'.repeat(200))}`, 'GET');
    check((await get.json()).texte === 't', 'commentaire : relu sous la graphie composee');
  } finally { await serveur.arreter(); await nettoyer(dossier); }
  terminer();
  console.log('Unicode NFC OK');
})().catch((e) => { console.error(e); process.exit(1); });
