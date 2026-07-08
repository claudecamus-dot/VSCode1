const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer-core');

const db = require('./db');
const { importFromBuffer, getReferentiel } = require('./referentiel');
const { importInvitesFromBuffer, replaceInvites, getInvites, getNonRepondants, looksLikeEmail } = require('./invites');
const { valeurCanonique } = require('./normalisation');
const { construireRadarSVG } = require('./radar-svg');

// Chrome headless pour rasteriser les radars SVG en PNG (export PPT, US6.4).
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json());
// admin.html est la page par defaut de l'outil (quel que soit l'environnement) :
// ouvrir la racine "/" doit tomber dessus, comme /admin.html. L'ancien sommaire
// separe (index.html) est retire ; son contenu utile vit dans l'onglet
// "Information" de admin.html.
app.use(express.static(path.join(__dirname, 'public'), { index: 'admin.html' }));

// Environnement courant (US9.5) : alimente le bandeau d'environnement de l'UI.
app.get('/api/env', (req, res) => {
  res.json({ env: process.env.APP_ENV || '' });
});

function nowIso() {
  return new Date().toISOString();
}

// Texte d'accueil par defaut de l'ecran d'identification (US3.5). Une session
// peut le surcharger ; sinon ce message — qui porte l'information de
// nominativite — s'applique.
const TEXTE_INTRO_DEFAUT =
  "Merci d'indiquer vos nom, prénom et email : ces informations sont nominatives et visibles par l'animateur de la session. " +
  "L'email sert uniquement à suivre votre participation et à ne pas vous relancer une fois votre questionnaire soumis. " +
  "Vos réponses détaillées ne seront jamais visibles directement par les autres répondants.";

function sessionStatus(session) {
  const now = Date.now();
  const ouverture = new Date(session.ouverture_at).getTime();
  const fermeture = new Date(session.fermeture_at).getTime();
  if (now < ouverture) return 'pas_encore_ouverte';
  if (now > fermeture) return 'fermee';
  return 'ouverte';
}

// Périmètre d'une session : ensemble des questions actives. Une session
// configurée a des lignes dans session_questions ; une session sans aucune
// ligne (créée avant cette fonctionnalité) est traitée comme "tout actif".
function activeQuestionIds(sessionId) {
  const rows = db.prepare('SELECT question_id FROM session_questions WHERE session_id = ?').all(sessionId);
  if (rows.length === 0) {
    return new Set(db.prepare('SELECT id FROM questions WHERE archive = 0').all().map((q) => q.id));
  }
  return new Set(rows.map((r) => r.question_id));
}

// Référentiel restreint aux questions actives de la session : on élague les
// sous-catégories puis les piliers qui se retrouveraient vides, pour que le
// répondant ne voie que ce qui le concerne.
function referentielPourSession(sessionId) {
  const actives = activeQuestionIds(sessionId);
  return getReferentiel({ includeArchived: true })
    .map((pilier) => ({
      ...pilier,
      sousCategories: pilier.sousCategories
        .map((sc) => ({ ...sc, questions: sc.questions.filter((q) => actives.has(q.id)) }))
        .filter((sc) => sc.questions.length > 0),
    }))
    .filter((pilier) => pilier.sousCategories.length > 0);
}

// --- Référentiel (Epic 1) ---

app.post('/api/referentiel/import', upload.single('fichier'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant (champ "fichier").' });
  // Champ texte du multipart (req.body via multer). 'remplacer' = purge totale,
  // sinon ré-import non destructif par défaut.
  const mode = req.body && req.body.mode === 'remplacer' ? 'remplacer' : 'conserver';
  try {
    const resume = await importFromBuffer(req.file.buffer, mode);
    res.json({ ok: true, ...resume });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Compteurs de ce qui serait perdu en cas de « remplacer complètement », pour
// alimenter la confirmation côté animateur avant le geste destructif.
app.get('/api/referentiel/stats', (req, res) => {
  res.json({
    sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,
    reponses: db.prepare('SELECT COUNT(*) AS n FROM reponses').get().n,
    piliers: db.prepare('SELECT COUNT(*) AS n FROM piliers WHERE archive = 0').get().n,
    questions: db.prepare('SELECT COUNT(*) AS n FROM questions WHERE archive = 0').get().n,
  });
});

app.get('/api/referentiel', (req, res) => {
  res.json(getReferentiel());
});

app.get('/api/sessions', (req, res) => {
  const sessions = db
    .prepare('SELECT id, ouverture_at, fermeture_at FROM sessions ORDER BY ouverture_at DESC')
    .all();
  res.json(sessions);
});

app.get('/api/sessions/:id/summary', (req, res) => {
  const session = db.prepare('SELECT id, ouverture_at, fermeture_at FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  res.json(session);
});

// Texte d'accueil par defaut, pour pre-remplir le formulaire de creation (US3.5).
app.get('/api/texte-intro-defaut', (req, res) => {
  res.json({ texte: TEXTE_INTRO_DEFAUT });
});

app.get('/api/roles', (req, res) => {
  res.json(db.prepare('SELECT nom FROM roles ORDER BY nom').all().map((r) => r.nom));
});

app.post('/api/roles', (req, res) => {
  const { nom } = req.body || {};
  if (!nom || typeof nom !== 'string' || !nom.trim()) {
    return res.status(400).json({ error: 'Le nom du role est requis.' });
  }
  const valeur = nom.trim();
  if (db.prepare('SELECT 1 FROM roles WHERE nom = ?').get(valeur)) {
    return res.status(409).json({ error: 'Ce role existe deja.' });
  }
  db.prepare('INSERT INTO roles (nom) VALUES (?)').run(valeur);
  res.json({ ok: true });
});

// Suppression d'un role : la liste des roles n'est qu'un catalogue de suggestions
// global (les repondants stockent leur role en texte libre copie), donc retirer
// un role n'affecte pas les reponses deja saisies.
app.delete('/api/roles/:nom', (req, res) => {
  const info = db.prepare('DELETE FROM roles WHERE nom = ?').run(req.params.nom);
  if (info.changes === 0) return res.status(404).json({ error: 'Role inconnu.' });
  res.json({ ok: true });
});

app.get('/api/departements', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT departement FROM repondants ORDER BY departement').all().map((r) => r.departement));
});

app.get('/api/equipes', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT equipe FROM repondants ORDER BY equipe').all().map((r) => r.equipe));
});

// --- Fusion des doublons residuels d'equipe/departement (US3.4bis) ---
// Champs fusionnables : la valeur sert a construire un nom de colonne, donc on
// la restreint a une liste blanche pour eviter toute injection SQL.
const CHAMPS_FUSIONNABLES = { departement: 'departement', equipe: 'equipe' };

app.get('/api/repondants/valeurs/:champ', (req, res) => {
  const colonne = CHAMPS_FUSIONNABLES[req.params.champ];
  if (!colonne) return res.status(400).json({ error: 'Champ inconnu (departement ou equipe).' });
  const valeurs = db
    .prepare(`SELECT ${colonne} AS valeur, COUNT(*) AS n FROM repondants GROUP BY ${colonne} ORDER BY ${colonne}`)
    .all();
  res.json(valeurs);
});

app.post('/api/repondants/fusion', (req, res) => {
  const { champ, source, cible } = req.body || {};
  const colonne = CHAMPS_FUSIONNABLES[champ];
  if (!colonne) return res.status(400).json({ error: 'Champ inconnu (departement ou equipe).' });
  if (!source || !cible || typeof source !== 'string' || typeof cible !== 'string') {
    return res.status(400).json({ error: 'source et cible sont requis.' });
  }
  if (source === cible) return res.status(400).json({ error: 'La source et la cible doivent etre differentes.' });
  // Reaffectation globale : un doublon peut s'etre glisse dans plusieurs sessions.
  const info = db.prepare(`UPDATE repondants SET ${colonne} = ? WHERE ${colonne} = ?`).run(cible, source);
  res.json({ ok: true, reaffectes: info.changes });
});

// --- Sessions (Epic 2) ---

app.post('/api/sessions', (req, res) => {
  const { ouverture_at, fermeture_at, questions_actives, texte_intro } = req.body || {};
  if (!ouverture_at || !fermeture_at) {
    return res.status(400).json({ error: 'ouverture_at et fermeture_at sont requis (ISO 8601).' });
  }
  if (texte_intro !== undefined && typeof texte_intro !== 'string') {
    return res.status(400).json({ error: 'texte_intro doit etre une chaine de caracteres.' });
  }
  if (new Date(fermeture_at) <= new Date(ouverture_at)) {
    return res.status(400).json({ error: 'fermeture_at doit etre apres ouverture_at.' });
  }
  if (getReferentiel().length === 0) {
    return res.status(400).json({ error: "Aucun referentiel importe : importez un fichier Excel avant de creer une session." });
  }

  // Périmètre : si `questions_actives` est fourni, on l'utilise tel quel (apres
  // validation) ; sinon, par defaut, toutes les questions du referentiel sont
  // actives. On materialise toujours l'ensemble actif dans session_questions.
  const toutesIds = new Set(db.prepare('SELECT id FROM questions WHERE archive = 0').all().map((q) => q.id));
  let actives;
  if (questions_actives === undefined) {
    actives = [...toutesIds];
  } else {
    if (!Array.isArray(questions_actives)) {
      return res.status(400).json({ error: 'questions_actives doit etre un tableau d\'identifiants de questions.' });
    }
    actives = [...new Set(questions_actives.map(Number))];
    if (actives.length === 0) {
      return res.status(400).json({ error: 'Selectionnez au moins une question active pour la session.' });
    }
    const inconnue = actives.find((qid) => !toutesIds.has(qid));
    if (inconnue !== undefined) {
      return res.status(400).json({ error: `Question ${inconnue} inconnue dans le referentiel.` });
    }
  }

  // Texte vide => null : la session retombe sur le message par defaut a la lecture.
  const texteIntro = texte_intro && texte_intro.trim() ? texte_intro.trim() : null;

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at, texte_intro) VALUES (?, ?, ?, ?, ?)').run(
    id,
    ouverture_at,
    fermeture_at,
    nowIso(),
    texteIntro
  );
  const insertActive = db.prepare('INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)');
  for (const qid of actives) insertActive.run(id, qid);

  res.json({ id, lien: `/repondre.html?session=${id}`, questions_actives: actives.length });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  // On renvoie toujours un texte d'accueil effectif (surcharge de session ou defaut).
  res.json({ ...session, texte_intro: session.texte_intro || TEXTE_INTRO_DEFAUT, statut: sessionStatus(session) });
});

// Référentiel restreint au périmètre de la session (piliers/questions actifs).
app.get('/api/sessions/:id/referentiel', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  res.json(referentielPourSession(session.id));
});

// --- Invitation par email (Epic 2) ---

app.post('/api/sessions/:id/invites', upload.single('fichier'), async (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant (champ "fichier").' });
  try {
    const invites = await importInvitesFromBuffer(req.file.buffer, req.file.originalname);
    replaceInvites(session.id, invites);
    res.json({ ok: true, invites: invites.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/sessions/:id/invites', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  res.json(getInvites(session.id));
});

// Invites n'ayant pas encore soumis : cible du rappel (US2.5).
app.get('/api/sessions/:id/invites/non-repondants', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  res.json(getNonRepondants(session.id));
});

// --- Identification du répondant (Epic 3) ---

app.post('/api/sessions/:id/repondants', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  if (sessionStatus(session) !== 'ouverte') {
    return res.status(409).json({ error: 'Cette session n\'est pas ouverte a la saisie actuellement.' });
  }

  const { email, nom, prenom, departement, equipe, role, est_manager, dans_equipe } = req.body || {};
  const champsTexte = { nom, prenom, departement, equipe, role };
  for (const [champ, valeur] of Object.entries(champsTexte)) {
    if (!valeur || typeof valeur !== 'string' || !valeur.trim()) {
      return res.status(400).json({ error: `Le champ "${champ}" est requis.` });
    }
  }
  // L'email rattache le repondant a la liste d'invites pour le rappel cible (US2.5).
  if (!looksLikeEmail(email)) {
    return res.status(400).json({ error: 'Un email valide est requis.' });
  }
  if (typeof est_manager !== 'boolean' || typeof dans_equipe !== 'boolean') {
    return res.status(400).json({ error: 'est_manager et dans_equipe doivent etre des booleens.' });
  }

  // Saisie tolerante (US3.3) : on rattache departement/equipe a une orthographe
  // deja connue qui n'en differe que par la casse, les accents ou les espaces,
  // afin de ne pas fragmenter les resultats. Catalogue global (les equipes/
  // departements ne sont pas propres a une session), comme les suggestions.
  const departementsConnus = db.prepare('SELECT departement AS valeur, COUNT(*) AS n FROM repondants GROUP BY departement').all();
  const equipesConnues = db.prepare('SELECT equipe AS valeur, COUNT(*) AS n FROM repondants GROUP BY equipe').all();
  const departementCanon = valeurCanonique(departementsConnus, departement);
  const equipeCanon = valeurCanonique(equipesConnues, equipe);

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    session.id,
    email.trim().toLowerCase(),
    nom.trim(),
    prenom.trim(),
    departementCanon,
    equipeCanon,
    role.trim(),
    est_manager ? 1 : 0,
    dans_equipe ? 1 : 0,
    nowIso()
  );
  res.json({ id });
});

// --- Parcours de réponse (Epic 4) ---

function getRepondantOr404(req, res) {
  const repondant = db.prepare('SELECT * FROM repondants WHERE id = ?').get(req.params.id);
  if (!repondant) {
    res.status(404).json({ error: 'Repondant inconnu.' });
    return null;
  }
  return repondant;
}

app.get('/api/repondants/:id', (req, res) => {
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  const reponses = db.prepare('SELECT question_id, niveau FROM reponses WHERE repondant_id = ?').all(repondant.id);
  res.json({ ...repondant, reponses });
});

app.put('/api/repondants/:id/piliers/:pilierId/reponses', (req, res) => {
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  if (repondant.soumis_at) {
    return res.status(409).json({ error: 'Questionnaire deja soumis, modification impossible.' });
  }

  const pilierId = Number(req.params.pilierId);
  // On ne considère que les questions du pilier *actives pour cette session*.
  const actives = activeQuestionIds(repondant.session_id);
  const questions = db
    .prepare(
      `SELECT q.id FROM questions q
       JOIN sous_categories sc ON sc.id = q.sous_categorie_id
       WHERE sc.pilier_id = ?`
    )
    .all(pilierId);
  const questionIds = new Set(questions.map((q) => q.id).filter((id) => actives.has(id)));

  const { reponses } = req.body || {};
  if (!Array.isArray(reponses)) {
    return res.status(400).json({ error: 'reponses doit etre un tableau de { question_id, niveau }.' });
  }
  if (reponses.length !== questionIds.size) {
    return res.status(400).json({ error: 'Toutes les questions de ce pilier doivent etre repondues pour le sauvegarder.' });
  }

  const upsert = db.prepare(
    `INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, ?)
     ON CONFLICT(repondant_id, question_id) DO UPDATE SET niveau = excluded.niveau`
  );

  for (const reponse of reponses) {
    if (!questionIds.has(reponse.question_id)) {
      return res.status(400).json({ error: `La question ${reponse.question_id} n'appartient pas a ce pilier.` });
    }
    const niveauValide = db
      .prepare('SELECT 1 FROM niveaux WHERE question_id = ? AND niveau = ?')
      .get(reponse.question_id, reponse.niveau);
    if (!niveauValide) {
      return res.status(400).json({ error: `Niveau invalide pour la question ${reponse.question_id}.` });
    }
    upsert.run(repondant.id, reponse.question_id, reponse.niveau);
  }

  res.json({ ok: true });
});

app.post('/api/repondants/:id/soumission', (req, res) => {
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  if (repondant.soumis_at) {
    return res.status(409).json({ error: 'Questionnaire deja soumis.' });
  }

  // La complétude se mesure sur le périmètre actif de la session, pas sur tout
  // le référentiel.
  const actives = activeQuestionIds(repondant.session_id);
  const totalQuestions = actives.size;
  const reponduQuestions = db
    .prepare('SELECT question_id FROM reponses WHERE repondant_id = ?')
    .all(repondant.id)
    .filter((r) => actives.has(r.question_id)).length;
  if (reponduQuestions !== totalQuestions) {
    return res.status(409).json({
      error: `Toutes les questions doivent etre repondues avant soumission (${reponduQuestions}/${totalQuestions}).`,
    });
  }

  db.prepare('UPDATE repondants SET soumis_at = ? WHERE id = ?').run(nowIso(), repondant.id);
  res.json({ ok: true });
});

// --- Résultats agrégés par équipe (Epic 5, Increment 2) ---

app.get('/api/sessions/:id/equipes', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { manager } = req.query;
  let sql = `
      SELECT equipe,
             COUNT(*) AS effectif
       FROM repondants
       WHERE session_id = ? AND soumis_at IS NOT NULL`;
  const params = [session.id];
  if (manager === 'sans') {
    sql += ' AND est_manager = 0';
  }
  sql += ' GROUP BY equipe ORDER BY equipe';
  const equipes = db.prepare(sql).all(...params);
  res.json(equipes);
});

// Departements presents dans la session (repondants ayant soumis), avec effectif.
app.get('/api/sessions/:id/departements', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { manager } = req.query;
  let sql = `
      SELECT departement, COUNT(*) AS effectif
      FROM repondants
      WHERE session_id = ? AND soumis_at IS NOT NULL`;
  const params = [session.id];
  if (manager === 'sans') {
    sql += ' AND est_manager = 0';
  }
  sql += ' GROUP BY departement ORDER BY departement';
  const departements = db.prepare(sql).all(...params);
  res.json(departements);
});

// Taux de reponse de la session (US6.2), independant du filtre equipe :
// questionnaires soumis rapportes au nombre d'invites (US2.5).
app.get('/api/sessions/:id/participation', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const soumis = db
    .prepare('SELECT COUNT(*) AS n FROM repondants WHERE session_id = ? AND soumis_at IS NOT NULL')
    .get(session.id).n;
  const invites = db.prepare('SELECT COUNT(*) AS n FROM invites WHERE session_id = ?').get(session.id).n;
  res.json({ soumis, invites });
});

// Commentaire libre de restitution par equipe (US6.3) : saisi en preview,
// restitue a l'ecran (et plus tard dans l'export PPT, US6.4).
app.get('/api/sessions/:id/commentaire', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { equipe } = req.query;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
  const ligne = db.prepare('SELECT texte FROM commentaires WHERE session_id = ? AND equipe = ?').get(session.id, equipe);
  res.json({ equipe, texte: ligne ? ligne.texte : '' });
});

app.put('/api/sessions/:id/commentaire', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { equipe, texte } = req.body || {};
  if (!equipe || typeof equipe !== 'string') return res.status(400).json({ error: "Le champ 'equipe' est requis." });
  if (texte !== undefined && typeof texte !== 'string') {
    return res.status(400).json({ error: 'texte doit etre une chaine de caracteres.' });
  }
  const valeur = (texte || '').trim();
  if (valeur === '') {
    db.prepare('DELETE FROM commentaires WHERE session_id = ? AND equipe = ?').run(session.id, equipe);
  } else {
    db.prepare(
      `INSERT INTO commentaires (session_id, equipe, texte, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, equipe) DO UPDATE SET texte = excluded.texte, updated_at = excluded.updated_at`
    ).run(session.id, equipe, valeur, nowIso());
  }
  res.json({ ok: true, texte: valeur });
});

function moyenneDe(liste) {
  const valides = liste.filter((m) => m !== null);
  return valides.length > 0 ? valides.reduce((a, b) => a + b, 0) / valides.length : null;
}

// Agregation des resultats pour une session, restreinte par un filtre
// { equipe } ou { departement } : structure pilier -> objectif -> question avec
// moyennes et pre-analyses. Reutilisee par l'ecran de resultats (Epic 5/US6.2),
// la comparaison historique (US6.5) et la consolidation departement (Epic 7).
function agregerResultats(sessionId, filtre, manager) {
  let sql = 'SELECT * FROM repondants WHERE session_id = ? AND soumis_at IS NOT NULL';
  const params = [sessionId];
  if (filtre.equipe !== undefined) {
    sql += ' AND equipe = ?';
    params.push(filtre.equipe);
  }
  if (filtre.departement !== undefined) {
    sql += ' AND departement = ?';
    params.push(filtre.departement);
  }
  let repondants = db.prepare(sql).all(...params);
  if (manager === 'sans') {
    repondants = repondants.filter((r) => !r.est_manager);
  }
  const repondantIds = new Set(repondants.map((r) => r.id));

  const piliers = referentielPourSession(sessionId);
  const resultatPiliers = piliers.map((pilier) => {
    const sousCategories = pilier.sousCategories.map((sousCategorie) => {
      const questions = sousCategorie.questions.map((question) => {
        const reponsesQuestion = db
          .prepare('SELECT repondant_id, niveau FROM reponses WHERE question_id = ?')
          .all(question.id)
          .filter((r) => repondantIds.has(r.repondant_id));

        const reponsesDetail = reponsesQuestion.map((r) => {
          const repondant = repondants.find((rep) => rep.id === r.repondant_id);
          const niveauInfo = question.niveaux.find((n) => n.niveau === r.niveau);
          return {
            nom: repondant.nom,
            prenom: repondant.prenom,
            niveau: r.niveau,
            niveau_texte: niveauInfo ? niveauInfo.texte : null,
          };
        });

        // Pre-analyses (US6.2) : moyenne, min, max et ecart-type (dispersion,
        // population) des niveaux saisis ; un fort ecart-type signale un
        // desaccord dans l'equipe, donc un point d'attention.
        const valeurs = reponsesQuestion.map((r) => r.niveau);
        const moyenne = valeurs.length ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : null;
        const min = valeurs.length ? Math.min(...valeurs) : null;
        const max = valeurs.length ? Math.max(...valeurs) : null;
        const ecartType = valeurs.length
          ? Math.sqrt(valeurs.reduce((s, n) => s + (n - moyenne) ** 2, 0) / valeurs.length)
          : null;

        return { id: question.id, texte: question.texte, moyenne, min, max, ecartType, niveaux: question.niveaux, reponses: reponsesDetail };
      });

      const moyenneSousCategorie = moyenneDe(questions.map((q) => q.moyenne));
      return { id: sousCategorie.id, nom: sousCategorie.nom, moyenne: moyenneSousCategorie, questions };
    });

    const moyennePilier = moyenneDe(sousCategories.map((sc) => sc.moyenne));
    return { id: pilier.id, nom: pilier.nom, moyenne: moyennePilier, sousCategories };
  });

  return { effectif: repondants.length, piliers: resultatPiliers };
}

app.get('/api/sessions/:id/resultats', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { equipe, manager } = req.query;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });

  const { effectif, piliers } = agregerResultats(session.id, { equipe }, manager);
  let membres = db
    .prepare('SELECT nom, prenom, soumis_at, est_manager FROM repondants WHERE session_id = ? AND equipe = ?')
    .all(session.id, equipe);
  if (manager === 'sans') {
    membres = membres.filter((m) => m.est_manager === 0);
  }
  const repondants = membres.map((m) => ({
    nom: m.nom,
    prenom: m.prenom,
    soumis_at: m.soumis_at,
    est_manager: Boolean(m.est_manager),
  }));
  const soumis = repondants.filter((m) => m.soumis_at !== null);
  const nonSoumis = repondants.filter((m) => m.soumis_at === null);
  res.json({ equipe, effectif, effectifTotal: repondants.length, repondants: { soumis, nonSoumis }, piliers });
});

// --- Consolidation multi-equipes par departement (Epic 7, vue pilotage) ---

// Radar consolide d'un departement (toutes ses equipes) + liste des equipes
// pour le zoom (US7.2/US7.3).
app.get('/api/sessions/:id/consolidation', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { departement, manager } = req.query;
  if (!departement) return res.status(400).json({ error: "Le parametre 'departement' est requis." });

  const { effectif, piliers } = agregerResultats(session.id, { departement }, manager);

  // Repartition par equipe au sein du departement (meme filtre manager).
  let reps = db
    .prepare('SELECT equipe, est_manager FROM repondants WHERE session_id = ? AND departement = ? AND soumis_at IS NOT NULL')
    .all(session.id, departement);
  if (manager === 'sans') reps = reps.filter((r) => !r.est_manager);
  const parEquipe = new Map();
  for (const r of reps) parEquipe.set(r.equipe, (parEquipe.get(r.equipe) || 0) + 1);
  const equipes = [...parEquipe.entries()]
    .map(([equipe, eff]) => ({ equipe, effectif: eff }))
    .sort((a, b) => a.equipe.localeCompare(b.equipe));

  res.json({ departement, effectif, piliers, equipes });
});

// Comparaison historique (US6.5) : si une session anterieure existe pour la
// meme equipe, on superpose les deux radars et on calcule la regression/
// progression par pilier. "Meme equipe" = meme libelle d'equipe (consistance
// assuree par US3.3/US3.4bis). On retient automatiquement la precedente la plus
// recente (ouverture anterieure a la session courante).
function calculerComparaison(session, equipe, manager) {
  const precedente = db
    .prepare(
      `SELECT DISTINCT s.id, s.ouverture_at, s.fermeture_at
       FROM sessions s
       JOIN repondants r ON r.session_id = s.id
       WHERE s.id != ? AND r.equipe = ? AND r.soumis_at IS NOT NULL AND s.ouverture_at < ?
       ORDER BY s.ouverture_at DESC
       LIMIT 1`
    )
    .get(session.id, equipe, session.ouverture_at);
  if (!precedente) return { disponible: false };

  const courant = agregerResultats(session.id, { equipe }, manager);
  const ancien = agregerResultats(precedente.id, { equipe }, manager);

  // Alignement par nom : on ancre sur le referentiel de la session courante.
  const ancienParPilier = new Map(ancien.piliers.map((p) => [p.nom, p]));
  const ancienParObjectif = new Map();
  for (const p of ancien.piliers) {
    for (const sc of p.sousCategories) ancienParObjectif.set(sc.nom, sc.moyenne);
  }

  // Axes du radar : un par objectif (sous-categorie) du referentiel courant,
  // avec la moyenne courante et la moyenne precedente (par nom, null si absente).
  const axes = [];
  courant.piliers.forEach((pilier, pilierIndex) => {
    for (const sc of pilier.sousCategories) {
      axes.push({
        label: sc.nom,
        pilier: pilier.nom,
        pilierIndex,
        courant: sc.moyenne,
        precedent: ancienParObjectif.has(sc.nom) ? ancienParObjectif.get(sc.nom) : null,
      });
    }
  });

  // Regression/progression par pilier (delta = courant - precedent).
  const piliers = courant.piliers.map((pilier) => {
    const ancienPilier = ancienParPilier.get(pilier.nom);
    const precedent = ancienPilier ? ancienPilier.moyenne : null;
    const delta = pilier.moyenne !== null && precedent !== null ? pilier.moyenne - precedent : null;
    return { nom: pilier.nom, courant: pilier.moyenne, precedent, delta };
  });

  return {
    disponible: true,
    courant: { effectif: courant.effectif },
    precedente: {
      id: precedente.id,
      ouverture_at: precedente.ouverture_at,
      fermeture_at: precedente.fermeture_at,
      effectif: ancien.effectif,
    },
    axes,
    piliers,
  };
}

app.get('/api/sessions/:id/comparaison', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { equipe, manager } = req.query;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
  res.json(calculerComparaison(session, equipe, manager));
});

// --- Export du support de restitution PPT (US6.4) ---
// Construit le "bloc" de restitution d'une entite (equipe ou departement) :
// radar (objectifs + evolution eventuelle), commentaire, points d'attention.
function construireBlocRestitution(session, filtre, type, nom, manager) {
  const { effectif, piliers } = agregerResultats(session.id, filtre, manager);
  if (effectif === 0) return null;

  // Points d'attention (memes regles que l'ecran resultats, US6.2).
  const questions = piliers.flatMap((p) =>
    p.sousCategories.flatMap((sc) =>
      sc.questions.filter((q) => q.moyenne !== null).map((q) => ({ ...q, contexte: `${p.nom} · ${sc.nom}` }))
    )
  );
  const dispersion = [...questions]
    .sort((a, b) => b.ecartType - a.ecartType)
    .slice(0, 3)
    .map((q) => ({ texte: q.texte, ecartType: q.ecartType, min: q.min, max: q.max, contexte: q.contexte }));
  const faibles = [...questions]
    .sort((a, b) => a.moyenne - b.moyenne)
    .slice(0, 3)
    .map((q) => ({ texte: q.texte, moyenne: q.moyenne, contexte: q.contexte }));

  // Pendant positif de dispersion/faibles (US "Points forts") : scores les plus
  // hauts, et meilleurs accords (dispersion la plus faible). Un accord n'a de
  // sens qu'avec au moins 2 reponses : a 1 seule, l'ecart-type est trivialement
  // 0 sans traduire un vrai consensus.
  const hauts = [...questions]
    .sort((a, b) => b.moyenne - a.moyenne)
    .slice(0, 3)
    .map((q) => ({ texte: q.texte, moyenne: q.moyenne, contexte: q.contexte }));
  const accords = [...questions]
    .filter((q) => q.reponses.length >= 2)
    .sort((a, b) => a.ecartType - b.ecartType)
    .slice(0, 3)
    .map((q) => ({ texte: q.texte, ecartType: q.ecartType, min: q.min, max: q.max, contexte: q.contexte }));

  // Evolution : seulement pour les equipes (comparaison par equipe, US6.5).
  const comp = type === 'equipe' ? calculerComparaison(session, filtre.equipe, manager) : { disponible: false };
  const precParObjectif = {};
  if (comp.disponible) for (const a of comp.axes) precParObjectif[a.label] = a.precedent;

  const objectifs = piliers.flatMap((p, pilierIndex) =>
    p.sousCategories.map((sc) => ({
      nom: sc.nom,
      moyenne: sc.moyenne,
      precedent: comp.disponible ? (precParObjectif[sc.nom] ?? null) : null,
      pilierIndex,
    }))
  );

  let departement; // toujours affecte dans les deux branches ci-dessous
  let commentaire = '';
  let nbEquipes;
  if (type === 'equipe') {
    departement = db
      .prepare('SELECT DISTINCT departement FROM repondants WHERE session_id = ? AND equipe = ? AND soumis_at IS NOT NULL')
      .all(session.id, filtre.equipe)
      .map((r) => r.departement)
      .join(', ');
    const c = db.prepare('SELECT texte FROM commentaires WHERE session_id = ? AND equipe = ?').get(session.id, filtre.equipe);
    commentaire = c ? c.texte : '';
  } else {
    departement = nom;
    const eqs = db
      .prepare('SELECT DISTINCT equipe FROM repondants WHERE session_id = ? AND departement = ? AND soumis_at IS NOT NULL')
      .all(session.id, filtre.departement)
      .map((r) => r.equipe);
    nbEquipes = eqs.length;
    // Commentaire departement = concatenation des commentaires d'equipe (US6.3).
    if (eqs.length > 0) {
      const rows = db
        .prepare(`SELECT equipe, texte FROM commentaires WHERE session_id = ? AND equipe IN (${eqs.map(() => '?').join(',')})`)
        .all(session.id, ...eqs);
      commentaire = rows
        .sort((a, b) => a.equipe.localeCompare(b.equipe))
        .map((r) => `${r.equipe} : ${r.texte}`)
        .join('\n');
    }
  }

  const bloc = {
    type,
    nom,
    departement,
    effectif,
    objectifs,
    piliers: piliers.map((p) => ({ nom: p.nom, moyenne: p.moyenne })),
    dispersion,
    faibles,
    hauts,
    accords,
    commentaire,
    comparaison: comp.disponible
      ? { disponible: true, precedenteDate: new Date(comp.precedente.ouverture_at).toLocaleDateString('fr-FR'), piliers: comp.piliers }
      : { disponible: false },
  };
  if (nbEquipes !== undefined) bloc.nbEquipes = nbEquipes;
  return bloc;
}

// Nom de fichier "sur" : retire uniquement les caracteres invalides pour un nom
// de fichier (on garde accents et espaces, lisibles), et borne le vide.
function nomFichierSur(nom) {
  return String(nom).replace(/[\\/:*?"<>|-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'restitution';
}

// Rasterise le radar de chaque bloc (SVG facon web) en PNG, pose bloc.radarImage.
// Renvoie la liste des PNG (a nettoyer). Un seul lancement de navigateur.
async function rasteriserRadars(blocs) {
  const pngs = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    for (const bloc of blocs) {
      const axes = bloc.objectifs.map((o) => ({
        label: o.nom,
        pilierIndex: o.pilierIndex,
        courant: o.moyenne,
        precedent: o.precedent,
      }));
      const svg = construireRadarSVG(axes, bloc.piliers.map((p) => p.nom));
      // SVG inline statique (aucune ressource reseau) : 'load' suffit et evite
      // que 'networkidle0' ne se bloque (timeout) lors de rasterisations en
      // serie comme l'export departement (plusieurs radars d'affilee).
      await page.setContent(`<!DOCTYPE html><html><body style="margin:0">${svg}</body></html>`, { waitUntil: 'load' });
      const el = await page.$('svg');
      const png = path.join(os.tmpdir(), `radar-${crypto.randomUUID()}.png`);
      await el.screenshot({ path: png });
      bloc.radarImage = png;
      pngs.push(png);
    }
  } finally {
    await browser.close();
  }
  return pngs;
}

// Export PPT scope par ecran (US6.4) :
//  - scope=equipe       -> couverture + 2 slides de l'equipe (bouton resultats).
//  - scope=departement  -> couverture + 2 slides du departement + 2 slides par
//                          equipe du departement (bouton vue pilotage).
// Radar = image SVG facon web ; genere via Python (python-pptx + template OCTO).
app.get('/api/sessions/:id/export-ppt', async (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  const { scope, equipe, departement, manager } = req.query;

  let blocs; // affecte dans chaque branche de scope (sinon reponse 400 avant usage)
  let nomFichier = 'Restitution.pptx';
  let sousTitre; // idem : affecte dans chaque branche de scope

  if (scope === 'equipe') {
    if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
    const bloc = construireBlocRestitution(session, { equipe }, 'equipe', equipe, manager);
    if (!bloc) return res.status(400).json({ error: 'Aucune reponse soumise pour cette equipe.' });
    blocs = [bloc];
    sousTitre = `Équipe ${equipe}` + (bloc.departement ? ` — ${bloc.departement}` : '');
    nomFichier = `Restitution - ${nomFichierSur(equipe)}.pptx`;
  } else if (scope === 'departement') {
    if (!departement) return res.status(400).json({ error: "Le parametre 'departement' est requis." });
    const blocDep = construireBlocRestitution(session, { departement }, 'departement', departement, manager);
    if (!blocDep) return res.status(400).json({ error: 'Aucune reponse soumise pour ce departement.' });
    let reps = db
      .prepare('SELECT equipe, est_manager FROM repondants WHERE session_id = ? AND departement = ? AND soumis_at IS NOT NULL')
      .all(session.id, departement);
    if (manager === 'sans') reps = reps.filter((r) => !r.est_manager);
    const equipes = [...new Set(reps.map((r) => r.equipe))].sort((a, b) => a.localeCompare(b));
    blocs = [blocDep];
    for (const e of equipes) {
      const b = construireBlocRestitution(session, { equipe: e }, 'equipe', e, manager);
      if (b) blocs.push(b);
    }
    sousTitre = `Département ${departement}`;
    nomFichier = `Restitution - ${nomFichierSur(departement)}.pptx`;
  } else {
    return res.status(400).json({ error: "Le parametre 'scope' est requis (equipe ou departement)." });
  }

  const payload = {
    couverture: {
      titre: 'Restitution — Maturité agile/produit',
      sousTitre,
      date: new Date().toLocaleDateString('fr-FR'),
    },
    blocs,
  };

  const jsonPath = path.join(os.tmpdir(), `restit-${crypto.randomUUID()}.json`);
  const outPath = path.join(os.tmpdir(), `restit-${crypto.randomUUID()}.pptx`);
  const script = path.join(__dirname, '..', 'scripts', 'export-restitution-ppt.py');
  const python = process.env.PYTHON || 'python';
  let pngs = [];
  const nettoyer = () => {
    fs.promises.unlink(jsonPath).catch(() => {});
    fs.promises.unlink(outPath).catch(() => {});
    for (const p of pngs) fs.promises.unlink(p).catch(() => {});
  };

  try {
    pngs = await rasteriserRadars(blocs);
    fs.writeFileSync(jsonPath, JSON.stringify(payload), 'utf-8');
  } catch (err) {
    nettoyer();
    return res.status(500).json({ error: 'Preparation de l\'export (radar) impossible.', detail: String(err.message).slice(0, 500) });
  }

  execFile(python, [script, jsonPath, outPath], (err, stdout, stderr) => {
    if (err) {
      nettoyer();
      return res.status(500).json({ error: 'Echec de la generation du PPT.', detail: String(stderr || err.message).slice(0, 500) });
    }
    res.download(outPath, nomFichier, nettoyer);
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serveur demarre sur http://localhost:${port}`);
});
