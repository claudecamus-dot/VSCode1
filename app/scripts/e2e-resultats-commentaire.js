// E2E navigateur reel : resultats.html - choix d'equipe, effectif, commentaire de
// restitution (saisie, enregistrement, rechargement) et COURSE de commentaire :
// la reponse tardive de /commentaire?equipe=A ne doit PAS ecraser le champ une fois
// l'equipe B choisie (garde de sequence gardeCommentaire).
// Lancer : `node scripts/e2e-resultats-commentaire.js` (Chrome requis ; SKIP hors CI sinon).
const nav = require('./navigateur-e2e');
const { fetchMutant } = require('./helpers-serveur');

const T = { timeout: 10000 };
const DELAI_RETARD_MS = 2000;
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

/* global document */
const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
const REFERENTIEL = [{
  nom: 'Pilier E2E',
  ordre: 0,
  sousCategories: [{ nom: 'Objectif E2E', ordre: 0, questions: [{ texte: 'Question E2E ?', niveaux: niveaux() }] }],
}];

const valeurChamp = (page) => page.$eval('#commentaire', (el) => el.value);

async function main() {
  const debut = Date.now();
  const chrome = nav.chromeOuSortie();
  const serveur = await nav.demarrerServeur({ nom: 'e2e-resultats', referentiel: REFERENTIEL });
  let navigateur;
  try {
    const sessionId = await nav.creerSession(serveur.base);
    // Deux repondants soumis, dans deux equipes d'un meme departement.
    await nav.soumettre(serveur.base, sessionId, { email: 'a@exemple.fr', departement: 'Dept E2E', equipe: 'Equipe A', niveau: 3 });
    await nav.soumettre(serveur.base, sessionId, { email: 'b@exemple.fr', departement: 'Dept E2E', equipe: 'Equipe B', niveau: 1 });
    // Commentaire de B pose par la vraie route (celui de A sera saisi dans l'interface).
    const put = await fetchMutant(`${serveur.base}/api/sessions/${sessionId}/commentaire`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipe: 'Equipe B', texte: 'Commentaire de B' }),
    });
    check(put.status === 200, `commentaire de B pose par HTTP (recu ${put.status})`);

    navigateur = await nav.lancerNavigateur(chrome);
    const url = `${serveur.base}/resultats.html?session=${sessionId}`;

    console.log('--- (1) Choix de l\'equipe, effectif, jauge ---');
    const page = await navigateur.newPage();
    const surveillance = nav.surveillerPage(page, 'resultats');
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('#equipe option').length === 2, T);
    const libelles = await page.$$eval('#equipe option', (l) => l.map((o) => o.textContent.trim()));
    check(JSON.stringify(libelles) === JSON.stringify(['Equipe A (1)', 'Equipe B (1)']), `le select liste les 2 equipes avec leur effectif (recu ${JSON.stringify(libelles)})`);
    await page.select('#equipe', 'Equipe A');
    await page.waitForFunction(() => document.querySelector('#effectif').textContent.includes('1 réponse(s) prise(s) en compte'), T);
    check(true, 'effectif de l\'equipe A : « 1 réponse(s) prise(s) en compte »');
    await page.waitForFunction(() => document.querySelector('#syntheseChiffree').textContent.includes('Effectif équipe'), T);
    const synthese = await page.$eval('#syntheseChiffree', (el) => el.textContent.replace(/\s+/g, ' '));
    check(/3\.0 \/ 3/.test(synthese), `moyenne globale de A = 3.0 / 3 (recu "${synthese}")`);
    check(synthese.includes('2 soumisTaux de réponse'), `taux de reponse de la session : 2 soumis (recu "${synthese}")`);
    check(/1 \/ 1Effectif équipe/.test(synthese), `jauge d'effectif de l'equipe A : 1 / 1 (recu "${synthese}")`);
    check(await page.$eval('#btnEnregistrerCommentaire', (b) => !b.disabled), 'bouton Enregistrer disponible');

    console.log('--- (2) Saisie, enregistrement, rechargement ---');
    await page.waitForFunction(() => document.querySelector('#etatCommentaire').textContent === '', T);
    await page.type('#commentaire', 'Commentaire de A saisi dans l\'interface');
    await page.click('#btnEnregistrerCommentaire');
    await page.waitForFunction(() => document.querySelector('#etatCommentaire').textContent.includes('Enregistré'), T);
    check(true, 'statut « Enregistré ✓ » affiche');
    await page.goto(`${url}&equipe=${encodeURIComponent('Equipe A')}`);
    await page.waitForFunction(() => document.querySelector('#commentaire').value.length > 0, T);
    check(await valeurChamp(page) === 'Commentaire de A saisi dans l\'interface', `apres rechargement le commentaire de A est retrouve (recu "${await valeurChamp(page)}")`);

    console.log('--- (3) Course : reponse tardive du commentaire de A apres choix de B ---');
    // Depart : B affichee. Puis A est choisie (sa requete /commentaire est RETARDEE de
    // 2 s) et, pendant ce temps, B est re-choisie. Le champ doit rester sur B.
    const pageCourse = await navigateur.newPage();
    const surveillanceCourse = nav.surveillerPage(pageCourse, 'course');
    const retard = await nav.installerRetard(pageCourse, (u) => /\/commentaire\?equipe=Equipe(%20|\+)A\b/.test(u), DELAI_RETARD_MS);
    await pageCourse.goto(`${url}&equipe=${encodeURIComponent('Equipe B')}`);
    await pageCourse.waitForFunction(() => document.querySelector('#commentaire').value === 'Commentaire de B', T);
    check(true, 'depart : le champ affiche le commentaire de B');

    retard.actif = true;
    const reponseTardiveA = pageCourse.waitForResponse((r) => /\/commentaire\?equipe=Equipe(%20|\+)A\b/.test(r.url()), { timeout: 15000 });
    await pageCourse.select('#equipe', 'Equipe A'); // requete A -> retardee
    await pageCourse.waitForFunction(() => document.querySelector('#effectif').textContent.includes('1 réponse'), T);
    await pageCourse.select('#equipe', 'Equipe B'); // dernier choix : B
    await pageCourse.waitForFunction(() => document.querySelector('#equipe').value === 'Equipe B', T);
    await pageCourse.waitForFunction(() => document.querySelector('#commentaire').value === 'Commentaire de B', T);
    check(retard.retardees >= 1, `la requete /commentaire de A a bien ete retardee (${retard.retardees} requete(s))`);

    const reponse = await reponseTardiveA; // la reponse d'A arrive MAINTENANT, apres le choix de B
    await reponse.text();
    await nav.viderFile(pageCourse);
    check(await valeurChamp(pageCourse) === 'Commentaire de B', `apres la reponse tardive d'A, le champ affiche toujours le commentaire de B (recu "${await valeurChamp(pageCourse)}")`);
    check(await pageCourse.$eval('#equipe', (el) => el.value) === 'Equipe B', 'le select reste sur Equipe B');
    // L'enregistrement part bien sous B (et pas sous A) : ecriture + relecture HTTP.
    retard.actif = false;
    await pageCourse.$eval('#commentaire', (el) => { el.value = 'B modifie'; el.dispatchEvent(new Event('input')); });
    await pageCourse.click('#btnEnregistrerCommentaire');
    await pageCourse.waitForFunction(() => document.querySelector('#etatCommentaire').textContent.includes('Enregistré'), T);
    const relu = async (equipe) => (await (await fetch(`${serveur.base}/api/sessions/${sessionId}/commentaire?equipe=${encodeURIComponent(equipe)}`)).json()).texte;
    check(await relu('Equipe B') === 'B modifie', `l'enregistrement est bien range sous B (recu "${await relu('Equipe B')}")`);
    check(await relu('Equipe A') === 'Commentaire de A saisi dans l\'interface', 'le commentaire de A est intact');

    for (const s of [surveillance, surveillanceCourse]) s.verifier(check);
  } catch (err) {
    echecs += 1;
    console.error('  FAIL exception :', err && err.stack ? err.stack : err);
    console.error('Sortie du serveur :\n' + serveur.sortie());
  } finally {
    await nav.fermer(navigateur);
    await serveur.arreter();
  }
  console.log(echecs === 0 ? '\nTOUS LES POINTS PASSENT' : `\n${echecs} POINT(S) EN ECHEC`);
  console.log(`Duree : ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
