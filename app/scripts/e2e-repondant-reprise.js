// E2E navigateur reel : parcours repondant de repondre.html et REPRISE.
//   identification -> reponses d'un pilier -> « Continuer » -> rechargement SANS ?rid=
//   (la reprise ne tient alors que par localStorage) -> reponses restaurees -> fin du
//   questionnaire -> soumission -> rechargement : etat « soumis ».
//   + lien personnel ?rid= (bandeau, contexte sans localStorage, rid etranger).
// Lancer : `node scripts/e2e-repondant-reprise.js` (Chrome requis ; SKIP hors CI sinon).
const nav = require('./navigateur-e2e');

const T = { timeout: 10000 };
let echecs = 0;
function check(condition, message) {
  if (condition) console.log(`  ok   ${message}`);
  else { echecs += 1; console.error(`  FAIL ${message}`); }
}

const niveaux = () => [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
const REFERENTIEL = ['Alpha', 'Beta'].map((nom, i) => ({
  nom: `Pilier ${nom}`,
  ordre: i,
  sousCategories: [{ nom: `Objectif ${nom}`, ordre: 0, questions: [1, 2].map((k) => ({ texte: `Question ${nom} ${k} ?`, niveaux: niveaux() })) }],
}));

/* global document */
// Repond (clic sur le segment visible, le radio est masque) a toutes les questions
// affichees, au niveau donne.
async function repondrePilierAffiche(page, niveau) {
  const ids = await page.$$eval('#zonePilierCourant input[type=radio]', (els) => [...new Set(els.map((e) => e.name))]);
  for (const nom of ids) await page.click(`label.segment:has(input[name="${nom}"][value="${niveau}"])`);
  return ids;
}

const progression = (page) => page.$eval('#progression', (el) => el.textContent);

async function main() {
  const debut = Date.now();
  const chrome = nav.chromeOuSortie();
  const serveur = await nav.demarrerServeur({ nom: 'e2e-reprise', referentiel: REFERENTIEL });
  let navigateur;
  try {
    const sessionId = await nav.creerSession(serveur.base);
    const urlSession = `${serveur.base}/repondre.html?session=${sessionId}`;
    navigateur = await nav.lancerNavigateur(chrome);

    console.log('--- (1) Identification ---');
    const page = await navigateur.newPage();
    const surveillance = nav.surveillerPage(page, 'repondant');
    await page.goto(urlSession);
    await page.waitForSelector('#formIdentification:not(.hidden)', T);
    await page.type('#email', 'e2e-reprise@exemple.fr');
    await page.type('#nom', 'Nom');
    await page.type('#prenom', 'Prenom');
    await page.type('#departement', 'Dept E2E');
    await page.type('#equipe', 'Equipe E2E');
    await page.select('#role', await page.$eval('#role option', (o) => o.value));
    await page.click('#formIdentification button[type="submit"]');
    await page.waitForSelector('#zoneQuestionnaire:not(.hidden)', T);
    const urlIdentifie = page.url();
    check(/[?&]rid=/.test(urlIdentifie), 'URL porte ?rid= apres identification');
    check(await page.$eval('#noticeLienPersonnel', (el) => !!el.offsetParent), 'bandeau « Ce lien est personnel » visible');
    check((await progression(page)).startsWith('0 / 4'), `progression initiale 0 / 4 (recu "${await progression(page)}")`);

    console.log('--- (2) Premier pilier puis « Continuer » ---');
    check(await page.$eval('#btnValiderPilier', (b) => !b.disabled), '« Continuer » actif');
    await page.click('#btnValiderPilier'); // pilier incomplet : refus
    await page.waitForFunction(() => document.querySelector('#erreurAction').textContent.includes('Répondez à toutes'), T);
    check(true, 'pilier incomplet : « Continuer » refuse avec un message');
    const ids1 = await repondrePilierAffiche(page, 3);
    check(ids1.length === 2, `2 questions du premier pilier repondues (recu ${ids1.length})`);
    check((await progression(page)).startsWith('2 / 4'), `progression 2 / 4 (recu "${await progression(page)}")`);
    await page.click('#btnValiderPilier');
    await page.waitForFunction(() => document.querySelector('#navigationPiliers button[data-index="1"].actif'), T);
    check(true, 'apres « Continuer » le pilier suivant est actif');

    console.log('--- (3) Rechargement SANS ?rid= : reprise par localStorage ---');
    await page.goto(urlSession);
    await page.waitForSelector('#zoneQuestionnaire:not(.hidden)', T);
    check(await page.$eval('#formIdentification', (el) => el.classList.contains('hidden')), 'le formulaire d\'identification ne reapparait pas');
    check((await progression(page)).startsWith('2 / 4'), `progression restauree 2 / 4 (recu "${await progression(page)}")`);
    await page.waitForSelector('#navigationPiliers button[data-index="1"].actif', T);
    check(true, 'la reprise se positionne sur le premier pilier incomplet');
    await page.click('#navigationPiliers button[data-index="0"]');
    await page.waitForSelector('#zonePilierCourant input[type=radio]:checked', T);
    const coches = await page.$$eval('#zonePilierCourant input[type=radio]:checked', (els) => els.map((e) => e.value));
    check(coches.length === 2 && coches.every((v) => v === '3'), `reponses du premier pilier restaurees au niveau 3 (recu ${JSON.stringify(coches)})`);

    console.log('--- (4) Fin du questionnaire et soumission ---');
    await page.click('#navigationPiliers button[data-index="1"]');
    await page.waitForSelector('#navigationPiliers button[data-index="1"].actif', T);
    await repondrePilierAffiche(page, 1);
    await page.click('#btnValiderPilier');
    await page.waitForSelector('#btnSoumettre', T);
    check(true, 'tous les piliers enregistres : « Confirmer et soumettre » propose');
    await page.click('#btnSoumettre');
    await page.waitForSelector('.fin-soumission', T);
    check((await page.$eval('.fin-soumission', (el) => el.textContent)).includes('bien été soumis'), 'message de soumission affiche');

    console.log('--- (5) Rechargement apres soumission : etat « soumis » ---');
    for (const [libelle, url] of [['sans ?rid= (localStorage)', urlSession], ['avec ?rid=', urlIdentifie]]) {
      await page.goto(url);
      await page.waitForSelector('.fin-soumission', T);
      check(await page.$eval('#formIdentification', (el) => el.classList.contains('hidden')), `rechargement ${libelle} : etat soumis, pas de formulaire`);
      check(await page.$$eval('#zonePilierCourant input[type=radio]', (l) => l.length === 0), `rechargement ${libelle} : plus de question modifiable`);
    }

    console.log('--- (6) Bouton « Copier mon lien » ---');
    await page.click('#boutonCopierLien');
    await page.waitForFunction(() => document.querySelector('#statutCopieLien').textContent.trim().length > 0, T);
    check(true, 'un statut s\'affiche apres « Copier mon lien »');

    console.log('--- (7) ?rid= SEUL dans un contexte sans localStorage ---');
    const contexte = await navigateur.createBrowserContext();
    const pageFraiche = await contexte.newPage();
    const surveillanceFraiche = nav.surveillerPage(pageFraiche, 'contexte-frais');
    await pageFraiche.goto(urlIdentifie);
    await pageFraiche.waitForSelector('.fin-soumission', T);
    check(await pageFraiche.$eval('#formIdentification', (el) => el.classList.contains('hidden')), '?rid= seul : acces recupere, pas de formulaire');

    console.log('--- (8) ?rid= inconnu : retombe sur le formulaire ---');
    const pageEtrangere = await contexte.newPage();
    // Le 404 de /api/repondants/<rid inconnu> est le comportement ATTENDU ici.
    const surveillanceEtrangere = nav.surveillerPage(pageEtrangere, 'rid-etranger', [/404/]);
    await pageEtrangere.goto(`${urlSession}&rid=00000000-0000-0000-0000-000000000000`);
    await pageEtrangere.waitForSelector('#formIdentification:not(.hidden)', T);
    check(await pageEtrangere.$eval('#zoneQuestionnaire', (el) => el.classList.contains('hidden')), 'rid etranger : pas de questionnaire affiche');
    await contexte.close();

    for (const s of [surveillance, surveillanceFraiche, surveillanceEtrangere]) s.verifier(check);
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
