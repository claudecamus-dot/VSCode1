// Le detail nominatif « qui a repondu quoi » ne part au navigateur qu'A LA
// DEMANDE (arbitrage utilisateur du 2026-09-10 sur le constat de securite du
// 2026-09-04).
//
// Ce qui etait faux avant : /api/sessions/:id/resultats renvoyait, pour CHAQUE
// question, la liste { nom, prenom, niveau, niveau_texte } de chaque repondant.
// resultats.html l'injectait entierement dans le DOM et la masquait par la
// seule regle CSS `.detail-nominatif.ferme { display: none }`. Un masquage CSS
// n'est pas une retenue de donnees : Ctrl+F, impression, « enregistrer la
// page », l'inspecteur ou un partage d'ecran la rendaient lisible a quiconque
// voyait l'ecran, y compris a qui ne devait voir que l'agrege.
//
// SUR QUELLE DONNEE CE TEST DECIDE. Pas sur un drapeau, pas sur la presence
// d'un mot dans le code : sur le CORPS REELLEMENT SERIALISE par le serveur.
// Precision volontaire du perimetre : la reponse porte toujours, et doit
// porter, `repondants: { soumis, nonSoumis }` — le panneau « qui a repondu »
// est une fonction assumee de l'ecran animateur, affichee en clair, jamais
// masquee. Ce qui devient sensible est l'APPARIEMENT nom <-> niveau par
// question. Le verrou porte donc sur le sous-arbre `piliers`, la ou vit cet
// appariement, et garde en temoin que `repondants` marche encore : une garde
// qui interdirait « tout nom partout » casserait l'ecran sans fermer le
// constat, et se ferait desactiver a la premiere gene.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;
const CHEMIN_SERVEUR = path.join(__dirname, '..', 'src', 'server.js');
const CHEMIN_PAGE = path.join(__dirname, '..', 'src', 'public', 'resultats.html');

// Valeurs improbables ailleurs dans le referentiel ou les libelles : leur
// ABSENCE d'un JSON est alors une preuve, pas une coincidence.
const ALPHA = { nom: 'ZzzNomAlpha', prenom: 'YyyPrenomAlpha', equipe: 'VvvEquipeAlpha' };
const MANAGER = { nom: 'MmmNomManager', prenom: 'NnnPrenomManager' };
const BETA = { nom: 'BbbNomBeta', prenom: 'CccPrenomBeta', equipe: 'WwwEquipeBeta' };
const DEPARTEMENT = 'DddDepartementCommun';
const TEXTE_NIVEAU_2 = 'QqqTexteDuNiveauDeux';

let echecs = 0;
function check(condition, message) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    echecs += 1;
    console.error(`  FAIL ${message}`);
  }
}

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({
    niveau: n,
    // Le libelle du niveau 2 est marque : il n'existe QUE dans le detail
    // nominatif (le referentiel public le porte aussi, mais pas la reponse de
    // /resultats une fois le correctif en place — d'ou le controle cible sur
    // le sous-arbre `piliers` et non sur le corps entier).
    texte: n === 2 ? TEXTE_NIVEAU_2 : `niveau ${n}`,
    valeur_numerique: n,
  }));
}

async function main() {
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'detail-a-la-demande-'));
  const dbPath = path.join(dossierTmp, 'detail.db');

  process.env.DB_PATH = dbPath;
  const dbSeed = require('../src/db');
  const { reconcileReferentiel } = require('../src/referentiel');
  reconcileReferentiel([
    { nom: 'Pilier X', ordre: 0, sousCategories: [{ nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
  ]);
  const pilierId = dbSeed.prepare("SELECT id FROM piliers WHERE nom = 'Pilier X'").get().id;
  const q1 = dbSeed.prepare("SELECT id FROM questions WHERE texte = 'Q1'").get().id;
  dbSeed.close();

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  // Barriere ACTIVE : c'est la configuration de production, la seule ou l'on
  // peut prouver qu'une route nominative refuse un appel sans identifiants.
  const serveur = spawn(process.execPath, [CHEMIN_SERVEUR], {
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-detail-a-la-demande', AUTH_USER: USER, AUTH_PASS: PASS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });

  const animateur = { Authorization: basic(USER, PASS) };

  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);

    console.log('Preparation : une session, 3 repondants soumis (2 equipes, dont 1 manager) :');
    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...animateur },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    check(creation.status === 200, `session creee (recu ${creation.status})`);
    const { id: sessionId } = await creation.json();

    async function inscrireEtRepondre(identite, equipe, estManager, niveau) {
      const ident = await fetchMutant(`${base}/api/sessions/${sessionId}/repondants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${identite.nom.toLowerCase()}@exemple.invalid`,
          nom: identite.nom,
          prenom: identite.prenom,
          departement: DEPARTEMENT,
          equipe,
          role: 'Testeur',
          est_manager: estManager,
          dans_equipe: true,
        }),
      });
      const { id } = await ident.json();
      await fetchMutant(`${base}/api/repondants/${id}/piliers/${pilierId}/reponses`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reponses: [{ question_id: q1, niveau }] }),
      });
      await fetchMutant(`${base}/api/repondants/${id}/soumission`, { method: 'POST' });
      return id;
    }

    await inscrireEtRepondre(ALPHA, ALPHA.equipe, false, 2);
    await inscrireEtRepondre(MANAGER, ALPHA.equipe, true, 3);
    await inscrireEtRepondre(BETA, BETA.equipe, false, 1);

    // ------------------------------------------------------------------
    // 1. LA FUITE : la reponse initiale ne porte plus l'appariement nom<->niveau
    // ------------------------------------------------------------------
    console.log("\n1. Reponse initiale de /resultats : plus d'appariement « qui a repondu quoi » :");
    const initial = await fetch(
      `${base}/api/sessions/${sessionId}/resultats?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`,
      { headers: animateur }
    );
    check(initial.status === 200, `GET resultats -> 200 (recu ${initial.status})`);
    const data = await initial.json();
    const piliersSerialises = JSON.stringify(data.piliers);
    check(!piliersSerialises.includes(ALPHA.nom), `le nom du repondant est absent du sous-arbre piliers (${ALPHA.nom})`);
    check(!piliersSerialises.includes(ALPHA.prenom), `le prenom du repondant est absent du sous-arbre piliers (${ALPHA.prenom})`);
    check(!piliersSerialises.includes(MANAGER.nom), `le nom du manager est absent du sous-arbre piliers (${MANAGER.nom})`);
    check(!piliersSerialises.includes('niveau_texte'), 'le libelle de niveau par reponse est absent du sous-arbre piliers');

    // Temoin : ce qui doit RESTER. Sans lui, la garde pourrait etre satisfaite
    // par une reponse vide, et l'ecran serait casse sans que rien ne le dise.
    console.log('   Temoin — ce que la reponse initiale doit continuer a porter :');
    const q = data.piliers[0].sousCategories[0].questions[0];
    check(q.moyenne !== null, `la moyenne de la question est toujours calculee (${q.moyenne})`);
    check(q.nbReponses === 2, `le nombre de reponses est toujours annonce, sans les nommer (recu ${q.nbReponses})`);
    const listeParticipants = JSON.stringify(data.repondants);
    check(
      listeParticipants.includes(ALPHA.nom) && listeParticipants.includes(MANAGER.nom),
      'le panneau « qui a repondu / qui manque » garde ses noms (affichage assume, non masque)'
    );

    // ------------------------------------------------------------------
    // 2. LE SQUELETTE DE LA PAGE ne fabrique plus ces lignes au rendu initial
    // ------------------------------------------------------------------
    console.log('\n2. Squelette de resultats.html : le rendu initial ne fabrique plus les lignes nominatives :');
    const page = fs.readFileSync(CHEMIN_PAGE, 'utf8');
    // Borner la fenetre au CORPS de rendrePiliers() : le meme fichier contient
    // legitimement `r.prenom` plus bas, dans chargerDetailNominatif(), qui est
    // precisement le chemin autorise. Une fenetre ouverte jusqu'a la fin du
    // fichier rendait ce controle rouge apres correctif — il aurait accuse le
    // remede. Bornes : du debut de la fonction au debut de la suivante.
    const debut = page.indexOf('function rendrePiliers');
    const fin = page.indexOf('async function chargerDetailNominatif');
    check(debut !== -1 && fin > debut, 'rendrePiliers() et chargerDetailNominatif() sont tous deux presents');
    const rendrePiliers = page.slice(debut, fin);
    // Frontiere de mot A GAUCHE aussi : sans elle, `r\.nom` matchait
    // `pilier.nom` et `sousCategorie.nom` — la garde restait rouge apres
    // correctif en accusant du code sain. Un motif qui attrape autre chose que
    // ce qu'il decrit ne prouve rien, dans un sens comme dans l'autre.
    check(!/\br\.prenom\b|\br\.nom\b/.test(rendrePiliers), 'rendrePiliers() n\'interpole plus prenom/nom d\'un repondant');
    check(!/q\.reponses/.test(rendrePiliers), 'rendrePiliers() ne lit plus q.reponses (la donnee n\'est plus la)');
    // Contre-epreuve : le chemin autorise, lui, existe bien. Sans elle, la
    // garde ci-dessus serait satisfaite par la suppression pure et simple du
    // detail nominatif de l'application.
    const aLaDemande = page.slice(fin);
    check(/r\.prenom/.test(aLaDemande), 'chargerDetailNominatif() rend bien les lignes nominatives, a la demande');
    check(
      /\/questions\/\$\{encodeURIComponent\(questionId\)\}\/detail/.test(aLaDemande),
      'chargerDetailNominatif() appelle la route dediee de detail d\'UNE question'
    );

    // ------------------------------------------------------------------
    // 3. LE DEPLIEMENT MARCHE ENCORE : la donnee arrive quand on la demande
    // ------------------------------------------------------------------
    console.log('\n3. Depliement : la route dediee rend le detail d\'UNE question :');
    const detail = await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`,
      { headers: animateur }
    );
    check(detail.status === 200, `GET detail -> 200 (recu ${detail.status})`);
    const brutDetail = await detail.text();
    check(brutDetail.includes(ALPHA.nom), `le nom du repondant arrive a la demande (${ALPHA.nom})`);
    check(brutDetail.includes(ALPHA.prenom), `le prenom du repondant arrive a la demande (${ALPHA.prenom})`);
    check(brutDetail.includes(TEXTE_NIVEAU_2), 'le libelle du niveau choisi arrive a la demande');
    // Parse tolerant : quand la route n'existe pas encore (ou rend du HTML
    // d'erreur), on veut voir TOUS les echecs du fichier, pas s'arreter au
    // premier — un rapport rouge partiel cache ce qui reste a faire.
    let detailJson = null;
    try { detailJson = JSON.parse(brutDetail); } catch { detailJson = null; }
    check(
      detailJson !== null && Array.isArray(detailJson.reponses) && detailJson.reponses.length === 2,
      `2 reponses rendues en JSON (recu ${detailJson && detailJson.reponses ? detailJson.reponses.length : 'pas de JSON'})`
    );

    // ------------------------------------------------------------------
    // 4. LA ROUTE DEDIEE APPLIQUE LES MEMES RESTRICTIONS QUE L'AGREGE
    // ------------------------------------------------------------------
    console.log('\n4. La route dediee restreint autant que l\'agrege (equipe, manager, auth) :');
    const detailBeta = await (await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(BETA.equipe)}&manager=avec`,
      { headers: animateur }
    )).text();
    check(!detailBeta.includes(ALPHA.nom), 'le detail de l\'equipe Beta ne fuit pas un repondant d\'Alpha');
    check(detailBeta.includes(BETA.nom), 'le detail de l\'equipe Beta rend bien son propre repondant');

    const detailSansManager = await (await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=sans`,
      { headers: animateur }
    )).text();
    check(!detailSansManager.includes(MANAGER.nom), 'manager=sans exclut le manager du detail (filtre vie privee respecte)');
    check(detailSansManager.includes(ALPHA.nom), 'manager=sans garde les repondants non-managers');

    const detailSansIdentifiants = await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`
    );
    check(detailSansIdentifiants.status === 401, `la route dediee refuse un appel sans identifiants (recu ${detailSansIdentifiants.status})`);
    const brutRefus = await detailSansIdentifiants.text();
    check(!brutRefus.includes(ALPHA.nom), 'le refus ne laisse pas fuir le nom dans son corps');

    // Lecon de test-auth.js (« casse ») : le routeur Express et le systeme de
    // fichiers Windows sont insensibles a la casse, la liste blanche non. Une
    // route nominative ajoutee sans y penser retomberait dans le trou corrige
    // le 2026-09-01.
    const detailCasse = await fetch(
      `${base}/API/Sessions/${sessionId}/Questions/${q1}/Detail?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`
    );
    check(detailCasse.status === 401, `la route dediee refuse aussi en casse melangee (recu ${detailCasse.status})`);

    const detailInconnu = await fetch(
      `${base}/api/sessions/${sessionId}/questions/question-qui-nexiste-pas/detail?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`,
      { headers: animateur }
    );
    check(detailInconnu.status === 404, `une question hors referentiel de la session -> 404 (recu ${detailInconnu.status})`);

    const detailSansEquipe = await fetch(
      `${base}/api/sessions/${sessionId}/questions/${q1}/detail?manager=avec`,
      { headers: animateur }
    );
    check(detailSansEquipe.status === 400, `sans parametre equipe -> 400, pas un dump de la session (recu ${detailSansEquipe.status})`);

    // ------------------------------------------------------------------
    // 5. PASSE ADVERSARIALE : AUCUNE AUTRE ROUTE ne rend le meme appariement
    // ------------------------------------------------------------------
    // Le motif qui a piege quatre gardes la veille : la garde nominale est
    // verte, et la donnee sort par la porte d'a cote. On balaie donc toutes
    // les routes de lecture que l'ecran animateur (ou son voisin sponsor)
    // peut appeler, y compris celles qui n'affichent rien de nominatif.
    console.log('\n5. Passe adversariale : aucune AUTRE route de lecture ne rend l\'appariement :');
    const autresRoutes = [
      `/api/sessions/${sessionId}/consolidation?departement=${encodeURIComponent(DEPARTEMENT)}&manager=avec`,
      `/api/sessions/${sessionId}/comparaison?equipe=${encodeURIComponent(ALPHA.equipe)}&manager=avec`,
      `/api/sessions/${sessionId}/referentiel`,
      `/api/sessions/${sessionId}/participation`,
      `/api/sessions/${sessionId}/equipes?manager=avec`,
      `/api/sessions/${sessionId}/departements?manager=avec`,
    ];
    for (const route of autresRoutes) {
      const rep = await fetch(`${base}${route}`, { headers: animateur });
      const brut = await rep.text();
      // On ne juge que les routes qui repondent : un 404 (comparaison sans
      // session precedente) ne prouve rien mais ne fuit rien non plus.
      const porteLAppariement = brut.includes(TEXTE_NIVEAU_2) && (brut.includes(ALPHA.nom) || brut.includes(MANAGER.nom));
      check(!porteLAppariement, `${route.split('?')[0]} (${rep.status}) ne rend pas l'appariement nom<->niveau`);
    }
    console.log('   (les routes ci-dessus peuvent legitimement porter des noms SEULS — participation, listes — ');
    console.log('    ce qui est interdit ici est le couple nom + libelle du niveau repondu.)');
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }

  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} TEST(S) EN ECHEC`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
