const ExcelJS = require('exceljs');
const db = require('./db');
const { corrigerReferentiel } = require('./correcteur');

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
    const archiveQuestion = db.prepare('UPDATE questions SET archive = 1 WHERE id = ?');
    const deleteQuestion = db.prepare('DELETE FROM questions WHERE id = ?');
    let archivees = 0;
    for (const id of idsQuestionsAvant) {
      if (vusQuestions.has(id)) continue;
      if (aDesReponses.get(id)) {
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
    db.exec('ROLLBACK');
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
    db.exec('ROLLBACK');
    throw err;
  }
}

// mode : 'conserver' (defaut, non destructif) ou 'remplacer' (purge totale).
async function importFromBuffer(buffer, mode = 'conserver') {
  const piliers = await parseWorkbook(buffer);
  if (piliers.length === 0) {
    throw new Error("Aucun pilier/objectif/question detecte dans le fichier. Verifiez le format attendu (lignes d'entete 'PILIER - OBJECTIF').");
  }
  await corrigerReferentiel(piliers);
  const archivees = mode === 'remplacer' ? remplacerTout(piliers) : reconcileReferentiel(piliers);
  return {
    mode: mode === 'remplacer' ? 'remplacer' : 'conserver',
    piliers: piliers.length,
    sousCategories: piliers.reduce((sum, p) => sum + p.sousCategories.length, 0),
    questions: piliers.reduce((sum, p) => sum + p.sousCategories.reduce((s, sc) => s + sc.questions.length, 0), 0),
    archivees,
  };
}

// includeArchived=true sert au rendu d'une session existante, dont le perimetre
// peut referencer des questions archivees lors d'un re-import ulterieur. Par
// defaut, les entrees archivees sont masquees (creation de nouvelles sessions).
function getReferentiel({ includeArchived = false } = {}) {
  const filtre = includeArchived ? '' : 'AND archive = 0';
  const piliers = db.prepare(`SELECT id, nom, ordre FROM piliers WHERE 1=1 ${filtre} ORDER BY ordre`).all();
  return piliers.map((pilier) => {
    const sousCategories = db
      .prepare(`SELECT id, nom, ordre FROM sous_categories WHERE pilier_id = ? ${filtre} ORDER BY ordre`)
      .all(pilier.id);
    return {
      ...pilier,
      sousCategories: sousCategories.map((sousCategorie) => {
        const questions = db
          .prepare(`SELECT id, ordre, texte FROM questions WHERE sous_categorie_id = ? ${filtre} ORDER BY ordre`)
          .all(sousCategorie.id);
        return {
          ...sousCategorie,
          questions: questions.map((question) => {
            const niveaux = db
              .prepare('SELECT niveau, texte, valeur_numerique FROM niveaux WHERE question_id = ? ORDER BY niveau')
              .all(question.id);
            return { ...question, niveaux };
          }),
        };
      }),
    };
  });
}

module.exports = { importFromBuffer, getReferentiel, reconcileReferentiel, remplacerTout };
