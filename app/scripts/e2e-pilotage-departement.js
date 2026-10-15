// E2E navigateur reel : pilotage.html - consolidation par departement avec une equipe
// HOMONYME dans deux departements, et course de chargement : la reponse tardive d'un
// departement abandonne ne doit pas ecraser l'affichage du dernier choix (garde de
// sequence de chargerConsolidation).
// Lancer : `node scripts/e2e-pilotage-departement.js` (Chrome requis ; SKIP hors CI sinon).
const nav = require('./navigateur-e2e');

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

// D1 : « Commune » (2) + « Seule1 » (1) = 3 reponses, 2 equipes.
// D2 : « Commune » (1) + « Seule2 » (1) = 2 reponses, 2 equipes.
const REPONDANTS = [
  ['d1c1', 'Dept 1', 'Commune'], ['d1c2', 'Dept 1', 'Commune'], ['d1s', 'Dept 1', 'Seule1'],
  ['d2c1', 'Dept 2', 'Commune'], ['d2s', 'Dept 2', 'Seule2'],
];

const effectif = (page) => page.$eval('#effectif', (el) => el.textContent.trim());
const equipes = (page) => page.$$eval('#zoneEquipes .equipe-row', (l) => l.map((r) => `${r.querySelector('.nom').textContent}:${r.querySelector('.effectif').textContent}`));
const EFFECTIF_D1 = '3 réponse(s) soumise(s) — 2 équipe(s)';
const EFFECTIF_D2 = '2 réponse(s) soumise(s) — 2 équipe(s)';

async function main() {
  const debut = Date.now();
  const chrome = nav.chromeOuSortie();
  const serveur = await nav.demarrerServeur({ nom: 'e2e-pilotage', referentiel: REFERENTIEL });
  let navigateur;
  try {
    const sessionId = await nav.creerSession(serveur.base);
    for (const [id, departement, equipe] of REPONDANTS) {
      await nav.soumettre(serveur.base, sessionId, { email: `${id}@exemple.fr`, departement, equipe });
    }
    navigateur = await nav.lancerNavigateur(chrome);
    const url = `${serveur.base}/pilotage.html?session=${sessionId}`;

    console.log('--- (1) Choix du departement : effectif et equipes du seul departement ---');
    const page = await navigateur.newPage();
    const surveillance = nav.surveillerPage(page, 'pilotage');
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('#departement option').length === 2, T);
    const options = await page.$$eval('#departement option', (l) => l.map((o) => o.textContent.trim()));
    check(JSON.stringify(options) === JSON.stringify(['Dept 1 (3)', 'Dept 2 (2)']), `le select liste les 2 departements avec leur effectif (recu ${JSON.stringify(options)})`);

    await page.select('#departement', 'Dept 1');
    await page.waitForFunction((attendu) => document.querySelector('#effectif').textContent.trim() === attendu, T, EFFECTIF_D1);
    let liste = await equipes(page);
    check(JSON.stringify(liste) === JSON.stringify(['Commune:2 réponse(s)', 'Seule1:1 réponse(s)']), `Dept 1 : seules ses equipes, « Commune » compte 2 (recu ${JSON.stringify(liste)})`);

    await page.select('#departement', 'Dept 2');
    await page.waitForFunction((attendu) => document.querySelector('#effectif').textContent.trim() === attendu, T, EFFECTIF_D2);
    liste = await equipes(page);
    check(JSON.stringify(liste) === JSON.stringify(['Commune:1 réponse(s)', 'Seule2:1 réponse(s)']), `Dept 2 : seules ses equipes, « Commune » compte 1 (recu ${JSON.stringify(liste)})`);
    const lien = await page.$eval('#zoneEquipes .equipe-row a', (a) => a.getAttribute('href'));
    check(lien.includes(`session=${sessionId}`) && lien.includes('equipe=Commune'), `le lien « Voir le detail » vise la session et l'equipe (recu ${lien})`);

    console.log('--- (2) Course : reponse tardive de Dept 2 apres retour sur Dept 1 ---');
    const pageCourse = await navigateur.newPage();
    const surveillanceCourse = nav.surveillerPage(pageCourse, 'course');
    const motifD2 = (u) => /\/consolidation\?departement=Dept(%20|\+)2\b/.test(u);
    const retard = await nav.installerRetard(pageCourse, motifD2, DELAI_RETARD_MS);
    await pageCourse.goto(url);
    await pageCourse.waitForFunction(() => document.querySelectorAll('#departement option').length === 2, T);
    await pageCourse.select('#departement', 'Dept 1');
    await pageCourse.waitForFunction((attendu) => document.querySelector('#effectif').textContent.trim() === attendu, T, EFFECTIF_D1);

    retard.actif = true;
    const reponseTardive = pageCourse.waitForResponse((r) => motifD2(r.url()), { timeout: 15000 });
    await pageCourse.select('#departement', 'Dept 2'); // requete Dept 2 -> retardee
    await pageCourse.select('#departement', 'Dept 1'); // dernier choix : Dept 1
    await pageCourse.waitForFunction((attendu) => document.querySelector('#effectif').textContent.trim() === attendu, T, EFFECTIF_D1);
    check(retard.retardees >= 1, `la requete de Dept 2 a bien ete retardee (${retard.retardees} requete(s))`);

    const reponse = await reponseTardive; // la reponse de Dept 2 arrive MAINTENANT
    await reponse.text();
    await nav.viderFile(pageCourse);
    check(await pageCourse.$eval('#departement', (el) => el.value) === 'Dept 1', 'le select reste sur Dept 1');
    check(await effectif(pageCourse) === EFFECTIF_D1, `apres la reponse tardive, l'effectif affiche est celui de Dept 1 (recu "${await effectif(pageCourse)}")`);
    liste = await equipes(pageCourse);
    check(JSON.stringify(liste) === JSON.stringify(['Commune:2 réponse(s)', 'Seule1:1 réponse(s)']), `apres la reponse tardive, la liste des equipes est celle de Dept 1 (recu ${JSON.stringify(liste)})`);

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
