const ExcelJS = require('exceljs');
const db = require('./db');
const { corrigerReferentiel } = require('./correcteur');
const { annulerTransaction } = require('./tx');

function cellText(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object' && 'richText' in cell) {
    return cell.richText.map((r) => r.text).join('');
  }
  if (typeof cell === 'object' && 'text' in cell) return cell.text;
  return String(cell).trim();
}

// Les noms de pilier sont ecrits en majuscules dans le fichier source
// (ex: "AGILITE A L'ECHELLE") ; on les rend lisibles en casse de titre
// plutot que de les afficher tels quels.
function humaniserNomPilier(nomBrut) {
  return nomBrut
    .toLowerCase()
    .replace(/(^|[\s'’-])\p{L}/gu, (lettre) => lettre.toUpperCase());
}

function estEnteteSectionPilierObjectif(colA) {
  if (!colA || !colA.includes(' - ')) return false;
  if (/^Question\b/i.test(colA)) return false;
  if (colA === '1 choix possible') return false;
  if (/^\d+\./.test(colA)) return false;
  return true;
}

async function parseWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // pilierNom -> { ordre, sousCategories: Map(sousCategorieNom -> { ordre, questions: [] }) }
  const piliersMap = new Map();
  let pilierOrdre = 0;

  for (const worksheet of workbook.worksheets) {
    if (/piliers et objectifs/i.test(worksheet.name)) continue;

    let currentPilierNom = null;
    let currentObjectifNom = null;
    let currentQuestionTexte = null;

    worksheet.eachRow((row) => {
      const colA = cellText(row.getCell(1).value);
      const colB = cellText(row.getCell(2).value);

      if (estEnteteSectionPilierObjectif(colA)) {
        const separateurIndex = colA.indexOf(' - ');
        currentPilierNom = humaniserNomPilier(colA.slice(0, separateurIndex).trim());
        currentObjectifNom = colA.slice(separateurIndex + 3).trim();
        return;
      }

      if (colA && /^Question\b/i.test(colA)) {
        currentQuestionTexte = colB;
        return;
      }

      if (colA === '1 choix possible' && currentQuestionTexte && currentPilierNom && currentObjectifNom) {
        const niveauxTextes = [3, 5, 7, 9].map((colIndex) => cellText(row.getCell(colIndex + 1).value));
        if (niveauxTextes.every((t) => t)) {
          if (!piliersMap.has(currentPilierNom)) {
            piliersMap.set(currentPilierNom, { ordre: pilierOrdre++, sousCategories: new Map() });
          }
          const pilier = piliersMap.get(currentPilierNom);
          if (!pilier.sousCategories.has(currentObjectifNom)) {
            pilier.sousCategories.set(currentObjectifNom, { ordre: pilier.sousCategories.size, questions: [] });
          }
          pilier.sousCategories.get(currentObjectifNom).questions.push({
            texte: currentQuestionTexte,
            niveaux: niveauxTextes.map((texte, niveau) => ({ niveau, texte, valeur_numerique: niveau })),
          });
        }
        currentQuestionTexte = null;
      }
    });
  }

  return Array.from(piliersMap.entries()).map(([nom, pilier]) => ({
    nom,
    ordre: pilier.ordre,
    sousCategories: Array.from(pilier.sousCategories.entries()).map(([nomSC, sc]) => ({
      nom: nomSC,
      ordre: sc.ordre,
      questions: sc.questions,
    })),
  }));
}

// Re-import non destructif (US1.2 / mode « conserver »). On rapproche la
// nouvelle grille de l'existante par cle de contenu (nom de pilier, nom
// d'objectif, texte de question) afin de *reutiliser le meme question_id* pour
// une question inchangee : les reponses deja collectees (qui referencent
// question_id) survivent. Une entree disparue de la nouvelle grille est
// archivee si elle porte des reponses (les anciennes sessions restent
// lisibles) ou supprimee sinon. Renvoie le nombre de questions archivees.
//
// Corps de la reconciliation SANS gestion de transaction, pour pouvoir etre
// rejoue a l'interieur d'une transaction englobante (cf. remplacerTout).
function reconcileReferentielInTx(piliers) {
    // Photo des ids existants AVANT import, pour traiter les disparus ensuite.
    const idsQuestionsAvant = db.prepare('SELECT id FROM questions').all().map((r) => Number(r.id));
    const idsScAvant = db.prepare('SELECT id FROM sous_categories').all().map((r) => Number(r.id));
    const idsPiliersAvant = db.prepare('SELECT id FROM piliers').all().map((r) => Number(r.id));

    const vusQuestions = new Set();
    const vusSc = new Set();
    const vusPiliers = new Set();

    const findPilier = db.prepare('SELECT id FROM piliers WHERE nom = ?');
    const insertPilier = db.prepare('INSERT INTO piliers (nom, ordre, archive) VALUES (?, ?, 0)');
    const updatePilier = db.prepare('UPDATE piliers SET ordre = ?, archive = 0 WHERE id = ?');

    const findSc = db.prepare('SELECT id FROM sous_categories WHERE pilier_id = ? AND nom = ?');
    const insertSc = db.prepare('INSERT INTO sous_categories (pilier_id, nom, ordre, archive) VALUES (?, ?, ?, 0)');
    const updateSc = db.prepare('UPDATE sous_categories SET ordre = ?, archive = 0 WHERE id = ?');

    const findQuestion = db.prepare('SELECT id FROM questions WHERE sous_categorie_id = ? AND texte = ?');
    const insertQuestion = db.prepare('INSERT INTO questions (sous_categorie_id, ordre, texte, archive) VALUES (?, ?, ?, 0)');
    const updateQuestion = db.prepare('UPDATE questions SET ordre = ?, archive = 0 WHERE id = ?');

    const deleteNiveaux = db.prepare('DELETE FROM niveaux WHERE question_id = ?');
    const insertNiveau = db.prepare('INSERT INTO niveaux (question_id, niveau, texte, valeur_numerique) VALUES (?, ?, ?, ?)');

    for (const pilier of piliers) {
      const existantPilier = findPilier.get(pilier.nom);
      let pilierId;
      if (existantPilier) {
        pilierId = Number(existantPilier.id);
        updatePilier.run(pilier.ordre, pilierId);
      } else {
        pilierId = Number(insertPilier.run(pilier.nom, pilier.ordre).lastInsertRowid);
      }
      vusPiliers.add(pilierId);

      for (const sousCategorie of pilier.sousCategories) {
        const existantSc = findSc.get(pilierId, sousCategorie.nom);
        let sousCategorieId;
        if (existantSc) {
          sousCategorieId = Number(existantSc.id);
          updateSc.run(sousCategorie.ordre, sousCategorieId);
        } else {
          sousCategorieId = Number(insertSc.run(pilierId, sousCategorie.nom, sousCategorie.ordre).lastInsertRowid);
        }
        vusSc.add(sousCategorieId);

        sousCategorie.questions.forEach((question, questionIndex) => {
          const existantQuestion = findQuestion.get(sousCategorieId, question.texte);
          let questionId;
          if (existantQuestion) {
            questionId = Number(existantQuestion.id);
            updateQuestion.run(questionIndex, questionId);
            // Aucune reponse ne reference la table niveaux (reponses.niveau est
            // un entier 0-3) : on peut rafraichir les libelles de niveau sans
            // risque pour les reponses deja saisies.
            deleteNiveaux.run(questionId);
          } else {
            questionId = Number(insertQuestion.run(sousCategorieId, questionIndex, question.texte).lastInsertRowid);
          }
          for (const niveau of question.niveaux) {
            insertNiveau.run(questionId, niveau.niveau, niveau.texte, niveau.valeur_numerique);
          }
          vusQuestions.add(questionId);
        });
      }
    }

    // --- Entrees disparues de la nouvelle grille ---
    const aDesReponses = db.prepare('SELECT 1 FROM reponses WHERE question_id = ? LIMIT 1');
    // Une question peut n'avoir AUCUNE reponse et rester indispensable : celles
    // qu'une session a inscrites a son perimetre (US1.3bis). `session_questions`
    // est en ON DELETE CASCADE (db.js) et `PRAGMA foreign_keys = ON`, donc la
    // supprimer emportait silencieusement les lignes de cadrage. Quand elles
    // tombaient toutes, `activeQuestionIds` (server.js) retombait sur son repli
    // « aucune ligne = tout le referentiel est actif » — repli concu pour les
    // sessions anterieures a la fonctionnalite, incapable de distinguer
    // « jamais cadree » de « cadrage efface ». Reproduit le 2026-09-01 : une
    // session cadree sur 2 questions parmi 5, l'animateur corrige une coquille
    // (le texte etant la cle de rapprochement, la question est vue comme
    // disparue), et le repondant en recoit 5 — avec une soumission qui en exige
    // desormais 5. On archive donc au lieu de supprimer, exactement comme pour
    // une question porteuse de reponses. La session continue de la servir :
    // `referentielPourSession` lit le referentiel avec `includeArchived: true`
    // puis filtre sur le perimetre, donc elle garde les questions ET la
    // formulation avec lesquelles elle a ete lancee.
    const estCadree = db.prepare('SELECT 1 FROM session_questions WHERE question_id = ? LIMIT 1');
    const archiveQuestion = db.prepare('UPDATE questions SET archive = 1 WHERE id = ?');
    const deleteQuestion = db.prepare('DELETE FROM questions WHERE id = ?');
    let archivees = 0;
    for (const id of idsQuestionsAvant) {
      if (vusQuestions.has(id)) continue;
      if (aDesReponses.get(id) || estCadree.get(id)) {
        archiveQuestion.run(id);
        archivees += 1;
      } else {
        deleteQuestion.run(id); // cascade sur niveaux
      }
    }

    // Un objectif/pilier disparu n'est supprime que s'il ne contient plus rien ;
    // sinon il est archive pour rester rattachable aux anciennes sessions.
    const compteQuestions = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE sous_categorie_id = ?');
    const archiveSc = db.prepare('UPDATE sous_categories SET archive = 1 WHERE id = ?');
    const deleteSc = db.prepare('DELETE FROM sous_categories WHERE id = ?');
    for (const id of idsScAvant) {
      if (vusSc.has(id)) continue;
      if (compteQuestions.get(id).n > 0) archiveSc.run(id);
      else deleteSc.run(id);
    }

    const compteSc = db.prepare('SELECT COUNT(*) AS n FROM sous_categories WHERE pilier_id = ?');
    const archivePilier = db.prepare('UPDATE piliers SET archive = 1 WHERE id = ?');
    const deletePilier = db.prepare('DELETE FROM piliers WHERE id = ?');
    for (const id of idsPiliersAvant) {
      if (vusPiliers.has(id)) continue;
      if (compteSc.get(id).n > 0) archivePilier.run(id);
      else deletePilier.run(id);
    }

    return archivees;
}

// Wrapper transactionnel public de la reconciliation non destructive.
function reconcileReferentiel(piliers) {
  db.exec('BEGIN');
  try {
    const archivees = reconcileReferentielInTx(piliers);
    db.exec('COMMIT');
    return archivees;
  } catch (err) {
    // ROLLBACK protege (motif de tx.js, annulerTransaction) : SQLite annule
    // lui-meme la transaction sur les erreurs les plus graves (disque plein,
    // E/S), le ROLLBACK leve alors « cannot rollback - no transaction is
    // active » et cette erreur-la REMPLACAIT la cause reelle -- sur les deux
    // gestes les plus destructifs du produit (audit-technique 2026-09-09).
    annulerTransaction(err);
    throw err;
  }
}

// Remplacement complet (mode « remplacer »). On efface TOUT le referentiel ainsi
// que toutes les donnees collectees qui en dependent (sessions, repondants,
// reponses, invites, commentaires), puis on charge la nouvelle grille a neuf.
// Aucune version precedente n'est conservee : geste destructif et irreversible,
// a reserver a un repart de zero. L'ensemble (purge + insertion) tient dans une
// seule transaction pour rester atomique. Renvoie 0 (rien a archiver).
function remplacerTout(piliers) {
  db.exec('BEGIN');
  try {
    // Ordre explicite des purges : on enleve d'abord les tables qui referencent
    // les autres, puis le referentiel lui-meme (independant de ON DELETE CASCADE).
    db.exec(`
      DELETE FROM commentaires;
      DELETE FROM reponses;
      DELETE FROM session_questions;
      DELETE FROM invites;
      DELETE FROM repondants;
      DELETE FROM sessions;
      DELETE FROM niveaux;
      DELETE FROM questions;
      DELETE FROM sous_categories;
      DELETE FROM piliers;
    `);
    // Sur une base videe, la reconciliation insere tout a neuf et n'archive rien.
    const archivees = reconcileReferentielInTx(piliers);
    db.exec('COMMIT');
    return archivees;
  } catch (err) {
    // ROLLBACK protege (motif de tx.js, annulerTransaction) : SQLite annule
    // lui-meme la transaction sur les erreurs les plus graves (disque plein,
    // E/S), le ROLLBACK leve alors « cannot rollback - no transaction is
    // active » et cette erreur-la REMPLACAIT la cause reelle -- sur les deux
    // gestes les plus destructifs du produit (audit-technique 2026-09-09).
    annulerTransaction(err);
    throw err;
  }
}

// Verrou pose pendant la fenetre destructive d'un import mode=remplacer : entre
// le lancement de la correction orthographique (worker asynchrone, ~7s pendant
// lesquelles le serveur reste disponible) et le remplacerTout qui purge tout.
// Une soumission repondant acceptee dans cette fenetre etait effacee sans trace
// (decision de conception arbitree, docs/wiki/todo.md). COMPTEUR (pas un simple
// booleen) : un import mode=conserver qui se termine PENDANT qu'un remplacer est
// encore en cours ne doit pas rouvrir la fenetre en remettant le verrou a false a
// sa place -- seul un import remplacer incremente/decremente ce compteur, donc
// seule sa propre fin peut le ramener a 0. Couvre aussi, sans cout
// supplementaire, deux imports remplacer concurrents (le verrou tient jusqu'au
// dernier des deux a se terminer).
let importsRemplacerEnCours = 0;
function estImportRemplacerEnCours() {
  return importsRemplacerEnCours > 0;
}

// mode : 'conserver' (defaut, non destructif) ou 'remplacer' (purge totale).
async function importFromBuffer(buffer, mode = 'conserver') {
  // Verrou arme AVANT parseWorkbook (pas seulement autour de la correction) :
  // trouve par revue adversariale du correctif initial (2026-09-04). Le test
  // dedie utilise un classeur de 3 lignes, quasi instantane a parser -- mais un
  // vrai referentiel volumineux fait reellement attendre `workbook.xlsx.load`
  // (ExcelJS, I/O+CPU non trivial). Armer le verrou seulement apres laissait
  // cette phase hors fenetre fermee : une soumission repondant y passait encore
  // (200) avant d'etre effacee par remplacerTout, exactement le bug que ce
  // verrou existe pour fermer. Desormais toute la fonction est sous try/finally.
  if (mode === 'remplacer') importsRemplacerEnCours += 1;
  try {
    const piliers = await parseWorkbook(buffer);
    if (piliers.length === 0) {
      throw new Error("Aucun pilier/objectif/question detecte dans le fichier. Verifiez le format attendu (lignes d'entete 'PILIER - OBJECTIF').");
    }
    // Le correcteur tourne dans un worker depuis le 2026-09-01 : il rend une COPIE
    // corrigee, il ne modifie plus `piliers` en place. Reaffecter, sinon la suite
    // travaille sur le texte non corrige.
    const corriges = await corrigerReferentiel(piliers);
    const archivees = mode === 'remplacer' ? remplacerTout(corriges) : reconcileReferentiel(corriges);
    return {
      mode: mode === 'remplacer' ? 'remplacer' : 'conserver',
      piliers: corriges.length,
      sousCategories: corriges.reduce((sum, p) => sum + p.sousCategories.length, 0),
      questions: corriges.reduce((sum, p) => sum + p.sousCategories.reduce((s, sc) => s + sc.questions.length, 0), 0),
      archivees,
    };
  } finally {
    if (mode === 'remplacer') importsRemplacerEnCours -= 1;
  }
}

// includeArchived=true sert au rendu d'une session existante, dont le perimetre
// peut referencer des questions archivees lors d'un re-import ulterieur. Par
// defaut, les entrees archivees sont masquees (creation de nouvelles sessions).
// Fix N+1 (finding perf audit-technique 2026-09-04) : la version precedente
// faisait 1 requete par pilier PUIS 1 par sous-categorie PUIS 1 par question
// (1 + P + P*SC + P*SC*Q requetes) — appelee jusqu'a 5 fois par requete HTTP
// via agregerResultats (server.js), une grille de taille normale (~5 piliers x
// 3 sous-categories x 5 questions) generait plusieurs centaines de requetes
// SQLite synchrones par page consultee. 4 requetes FIXES (une par table),
// assemblage de l'arbre en memoire via des Map groupees par id parent — le
// resultat rendu est identique (memes champs, meme ordre : chaque requete
// trie par parent_id, ordre, donc les lignes d'un meme groupe restent
// consecutives et dans l'ordre voulu apres regroupement).
function getReferentiel({ includeArchived = false } = {}) {
  const filtre = includeArchived ? '' : 'AND archive = 0';
  const piliers = db.prepare(`SELECT id, nom, ordre FROM piliers WHERE 1=1 ${filtre} ORDER BY ordre`).all();
  const sousCategories = db
    .prepare(`SELECT id, nom, ordre, pilier_id FROM sous_categories WHERE 1=1 ${filtre} ORDER BY pilier_id, ordre`)
    .all();
  const questions = db
    .prepare(`SELECT id, ordre, texte, sous_categorie_id FROM questions WHERE 1=1 ${filtre} ORDER BY sous_categorie_id, ordre`)
    .all();
  const niveaux = db
    .prepare('SELECT niveau, texte, valeur_numerique, question_id FROM niveaux ORDER BY question_id, niveau')
    .all();

  const niveauxParQuestion = new Map();
  for (const n of niveaux) {
    if (!niveauxParQuestion.has(n.question_id)) niveauxParQuestion.set(n.question_id, []);
    niveauxParQuestion.get(n.question_id).push({ niveau: n.niveau, texte: n.texte, valeur_numerique: n.valeur_numerique });
  }

  const questionsParSousCategorie = new Map();
  for (const q of questions) {
    if (!questionsParSousCategorie.has(q.sous_categorie_id)) questionsParSousCategorie.set(q.sous_categorie_id, []);
    questionsParSousCategorie
      .get(q.sous_categorie_id)
      .push({ id: q.id, ordre: q.ordre, texte: q.texte, niveaux: niveauxParQuestion.get(q.id) || [] });
  }

  const sousCategoriesParPilier = new Map();
  for (const sc of sousCategories) {
    if (!sousCategoriesParPilier.has(sc.pilier_id)) sousCategoriesParPilier.set(sc.pilier_id, []);
    sousCategoriesParPilier
      .get(sc.pilier_id)
      .push({ id: sc.id, nom: sc.nom, ordre: sc.ordre, questions: questionsParSousCategorie.get(sc.id) || [] });
  }

  return piliers.map((pilier) => ({ ...pilier, sousCategories: sousCategoriesParPilier.get(pilier.id) || [] }));
}

module.exports = { importFromBuffer, getReferentiel, reconcileReferentiel, remplacerTout, estImportRemplacerEnCours };
