// Bornes de longueur de l'inscription (POST /api/sessions/:id/repondants) :
// nom, prenom, role, departement, equipe <= 200 caracteres, e-mail <= 254 ; au-dela,
// 400 JSON qui nomme le champ en cause. Les valeurs a la limite passent.
const path = require('node:path');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, corpsRepondant, json, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('bornes-identite');
  const dbPath = path.join(dossier, 'b.db');
  creerBaseAvecReferentiel(dbPath);
  const serveur = await lancer({ dbPath, nom: 'bornes' });
  try {
    const base = serveur.base;
    const sessionId = await creerSessionOuverte(base);
    const route = `/api/sessions/${sessionId}/repondants`;
    for (const champ of ['nom', 'prenom', 'role', 'departement', 'equipe']) {
      const trop = await json(base, route, 'POST', corpsRepondant({ email: `${champ}-trop@example.com`, [champ]: 'x'.repeat(201) }));
      const corps = await trop.json().catch(() => ({}));
      check(trop.status === 400 && corps.champ === champ, `${champ} de 201 caracteres -> 400 qui nomme le champ (recu ${trop.status} ${JSON.stringify(corps)})`);
      const limite = await json(base, route, 'POST', corpsRepondant({ email: `${champ}-ok@example.com`, [champ]: 'y'.repeat(200) }));
      check(limite.status === 200, `${champ} de 200 caracteres -> accepte (recu ${limite.status})`);
    }
    // La borne compte des POINTS DE CODE : 200 emojis = 200 caracteres visibles (400 unites UTF-16).
    const emoji = String.fromCodePoint(0x1F600);
    const okEmoji = await json(base, route, 'POST', corpsRepondant({ email: 'emoji-ok@example.com', nom: emoji.repeat(200) }));
    check(okEmoji.status === 200, `nom de 200 emojis (400 unites UTF-16) -> accepte (recu ${okEmoji.status})`);
    const tropEmoji = await json(base, route, 'POST', corpsRepondant({ email: 'emoji-trop@example.com', nom: emoji.repeat(201) }));
    check(tropEmoji.status === 400, `nom de 201 emojis -> 400 (recu ${tropEmoji.status})`);
    const emailLimite = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.fr`;
    check(emailLimite.length === 254, `preparation : e-mail de 254 caracteres (${emailLimite.length})`);
    const ok = await json(base, route, 'POST', corpsRepondant({ email: emailLimite }));
    check(ok.status === 200, `e-mail de 254 caracteres -> accepte (recu ${ok.status})`);
    const long = await json(base, route, 'POST', corpsRepondant({ email: `z${emailLimite}` }));
    const corpsEmail = await long.json().catch(() => ({}));
    check(long.status === 400 && corpsEmail.champ === 'email', `e-mail de 255 caracteres -> 400 qui nomme « email » (recu ${long.status} ${JSON.stringify(corpsEmail)})`);
  } finally { await serveur.arreter(); await nettoyer(dossier); }
  terminer();
  console.log('Bornes d identite OK');
})().catch((e) => { console.error(e); process.exit(1); });
