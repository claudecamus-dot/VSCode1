const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const express = require('express');
const multer = require('multer');

const db = require('./db');
const { enTransaction } = require('./tx');
const { importFromBuffer, getReferentiel, estImportRemplacerEnCours } = require('./referentiel');
const { moyenneDe, statsNiveaux, deltaHistorique } = require('./scores');
const Classement = require('./public/classement.js');
const { importInvitesFromBuffer, replaceInvites, getInvites, getNonRepondants, looksLikeEmail } = require('./invites');
const { valeurCanonique } = require('./normalisation');
const { estModeDemo } = require('./mode');
const { barriereAuth } = require('./auth');
const { verifierOrigine } = require('./csrf');
const { entetesSecurite } = require('./entetes-securite');

const app = express();
// Routage sensible a la casse (defaut Express : desactive). Deuxieme ligne de
// defense du correctif de casse d'auth.js : la barriere normalise desormais le
// chemin avant de decider, et ici le routeur cesse de faire correspondre
// `/API/sessions/...` a `/api/sessions/...`. Les deux ensemble suppriment
// l'ecart entre « ce que le garde lit » et « ce que le routeur sert », qui
// etait la cause du contournement. Aucun lien de l'application n'utilise une
// autre casse que celle declaree (verifie sur src/public/).
app.set('case sensitive routing', true);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Barriere d'acces INTERIMAIRE sur la surface animateur / PII (arbitrage
// securite:VSCode1-api-pii, option A « Basic Auth »). Placee en tete de chaine
// pour couvrir a la fois les pages animateur et les routes /api sensibles.
// Active seulement si AUTH_USER/AUTH_PASS sont poses ; laisse le parcours
// repondant ouvert (US10.5). Mesure provisoire — l'Epic 10 reste le chantier
// de fond. Voir app/src/auth.js.
// En-tetes de securite (voir entetes-securite.js) : EN TETE de chaine, avant la
// barriere, pour couvrir aussi le 401 qu'elle rend et les erreurs du filet
// terminal — sinon les seules reponses non protegees seraient precisement celles
// que le navigateur affiche quand quelque chose va mal.
app.use(entetesSecurite);
app.use(barriereAuth());
// Anti-CSRF (voir csrf.js) : Basic Auth ne protege pas des requetes rejouees
// par le navigateur d'une victime depuis une page tierce. Place apres la
// barriere d'authentification, avant tout handler mutant.
app.use(verifierOrigine);

app.use(express.json());
// index.html est la page d'accueil : elle oriente vers le mode "demo" (donnees
// fictives, pour montrer l'outil) ou "reel" (vraies donnees d'equipe), en posant le
// cookie `mode` lu par estModeDemo(), puis renvoie vers admin.html (la console
// animateur). Ouvrir la racine "/" tombe donc sur ce choix de mode.
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

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

// Une date ISO exploitable. `new Date('nawak').getTime()` vaut NaN, et TOUTE
// comparaison avec NaN est fausse : sans ce test, une session a dates illisibles
// passait la validation de creation (NaN <= NaN est faux, donc « fermeture apres
// ouverture » etait satisfait) puis se declarait ouverte pour toujours.
function dateValide(valeur) {
  return typeof valeur === 'string' && !Number.isNaN(new Date(valeur).getTime());
}

function sessionStatus(session) {
  const now = Date.now();
  const ouverture = new Date(session.ouverture_at).getTime();
  const fermeture = new Date(session.fermeture_at).getTime();
  // Dates illisibles : on ferme. Les creations sont validees en amont depuis le
  // 2026-09-01, mais une base anterieure peut porter de telles sessions — et
  // « ouverte pour toujours » sur une donnee corrompue est le pire des defauts.
  if (Number.isNaN(ouverture) || Number.isNaN(fermeture)) return 'fermee';
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

// Second handler `async` du fichier : meme protection que /invites ci-dessous —
// corps entier sous `try`, `next(err)` pour ce qui n'est pas un probleme de
// format, sinon une rejection non geree arrete le processus.
app.post('/api/referentiel/import', upload.single('fichier'), async (req, res, next) => {
  try {
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
  } catch (err) {
    next(err);
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

// Listing filtre par le mode courant (demo/reel) : garde-fou anti-melange — on ne
// voit que les sessions du mode courant (voir estModeDemo/mode.js).
app.get('/api/sessions', (req, res) => {
  const sessions = db
    .prepare('SELECT id, ouverture_at, fermeture_at FROM sessions WHERE est_demo = ? ORDER BY ouverture_at DESC')
    .all(estModeDemo(req.headers.cookie) ? 1 : 0);
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

// CORRECTIF SECURITE (arbitrage utilisateur du 2026-09-16, US10.5 invalidee —
// finding « exposition d'organigramme » de la salle atelier-dev). Ces deux
// routes etaient GLOBALES (`SELECT DISTINCT ... FROM repondants` sans filtre)
// et ouvertes sans identifiants ni identifiant de session dans l'URL : n'importe
// qui, sans jamais avoir recu de lien de session, lisait la liste agregee des
// departements/equipes de TOUTES les sessions jamais creees sur l'instance —
// donc de tous les clients passes par l'outil. Remplacees par des routes
// session-scopees, gardees par `chargerSession`, qui ne renvoient que les
// valeurs deja saisies DANS cette session : suggestions d'auto-completion pour
// le formulaire d'identification (src/public/repondre.html), plus jamais
// l'annuaire complet de l'instance. Une session neuve (aucun repondant encore
// enregistre) renvoie une liste vide : le champ reste une saisie libre, ce
// n'est qu'une aide, pas une contrainte (voir ROUTES_REPONDANT, auth.js).
app.get('/api/sessions/:id/departements-suggestions', chargerSession, (req, res) => {
  const valeurs = db
    .prepare('SELECT DISTINCT departement FROM repondants WHERE session_id = ? ORDER BY departement')
    .all(req.session.id)
    .map((r) => r.departement);
  res.json(valeurs);
});

app.get('/api/sessions/:id/equipes-suggestions', chargerSession, (req, res) => {
  const valeurs = db
    .prepare('SELECT DISTINCT equipe FROM repondants WHERE session_id = ? ORDER BY equipe')
    .all(req.session.id)
    .map((r) => r.equipe);
  res.json(valeurs);
});

// Catalogue de roles (US3.x) : par construction PARTAGE entre toutes les
// sessions (table `roles`, sans colonne session_id) — un admin le configure
// une fois, generique, pas par client. Sur re-verification (R1) ce n'est donc
// pas une donnee d'organigramme au meme titre que departements/equipes
// ci-dessus (aucune refonte de schema pour ce correctif, disproportionnee vis-
// a-vis du finding). Le vrai defaut corrige ici : la route GLOBALE
// `GET /api/roles` etait atteignable SANS AUCUN CONTEXTE, avant meme d'avoir
// recu un lien de session. Elle reste utilisee par l'admin (admin.html,
// protege par la barriere Basic Auth, credentials deja en cache navigateur) ;
// le parcours repondant passe desormais par cette variante session-scopee, qui
// exige au moins une session VALIDE dans l'URL avant de repondre.
app.get('/api/sessions/:id/roles', chargerSession, (req, res) => {
  res.json(db.prepare('SELECT nom FROM roles ORDER BY nom').all().map((r) => r.nom));
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
  if (refuserSiImportEnCours(res)) return;
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
  if (!dateValide(ouverture_at) || !dateValide(fermeture_at)) {
    return res.status(400).json({ error: 'ouverture_at et fermeture_at doivent etre des dates ISO 8601 valides.' });
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

  // Session + perimetre en UNE transaction : une session dont le perimetre n'est
  // ecrit qu'a moitie retombe sur le repli « aucune ligne = tout est actif » de
  // activeQuestionIds(), donc sur un questionnaire qui n'est pas celui cadre.
  const id = crypto.randomUUID();
  enTransaction(() => {
    db.prepare('INSERT INTO sessions (id, ouverture_at, fermeture_at, created_at, texte_intro, est_demo) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      ouverture_at,
      fermeture_at,
      nowIso(),
      texteIntro,
      estModeDemo(req.headers.cookie) ? 1 : 0
    );
    const insertActive = db.prepare('INSERT INTO session_questions (session_id, question_id) VALUES (?, ?)');
    for (const qid of actives) insertActive.run(id, qid);
  });

  res.json({ id, lien: `/repondre.html?session=${id}`, questions_actives: actives.length });
});

// Préambule commun à toute route ':id' de session : charge la session ou répond
// 404. Extrait le 2026-09-14 (finding risque_technique, audit du 2026-09-13) : le
// même bloc était copié 16 fois à l'identique — seul obstacle structurel cité aux
// correctifs de sécurité qui doivent poser une garde au niveau session (statut,
// mode démo/réel, autorisation) : une garde posée ici s'applique désormais aux 16
// routes d'un coup, jamais à 15 sur 16 par oubli. Correctif minimal : chaque site
// d'appel ne change que ces deux lignes contre le middleware `chargerSession` +
// `const session = req.session;` — corps de chaque handler inchangé. Exception
// assumée : `POST /api/sessions/:id/repondants` reste inline (voir plus bas) —
// son garde-fou `refuserSiImportEnCours` doit s'exécuter AVANT le chargement de
// session, un middleware générique inverserait cet ordre.
function chargerSession(req, res, next) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session inconnue.' });
  req.session = session;
  next();
}

app.get('/api/sessions/:id', chargerSession, (req, res) => {
  const session = req.session;
  // On renvoie toujours un texte d'accueil effectif (surcharge de session ou defaut).
  res.json({ ...session, texte_intro: session.texte_intro || TEXTE_INTRO_DEFAUT, statut: sessionStatus(session) });
});

// Référentiel restreint au périmètre de la session (piliers/questions actifs).
app.get('/api/sessions/:id/referentiel', chargerSession, (req, res) => {
  const session = req.session;
  res.json(referentielPourSession(session.id));
});

// --- Invitation par email (Epic 2) ---

// Handler `async` : le corps ENTIER est sous `try`, et tout ce qui n'est pas une
// erreur de format part en `next(err)`. Express 4 n'intercepte pas les promesses
// rejetees d'un handler (aucun `.catch` dans son router/layer.js) : l'acces base
// qui etait ici HORS du `try` produisait une rejection non geree, donc l'ARRET du
// processus serveur — tous les repondants en cours perdaient leur session
// (mesure le 2026-09-01 : handler sync qui jette -> 500 propre ; handler async
// qui jette -> aucune reponse et code de sortie 1). Le `try` interne conserve le
// 400 pour ce qui est vraiment un fichier illisible : sans lui, une panne de base
// serait annoncee a l'animateur comme un mauvais format, et il referait son
// fichier au lieu d'appeler l'exploitant.
app.post('/api/sessions/:id/invites', upload.single('fichier'), chargerSession, async (req, res, next) => {
  try {
    const session = req.session;
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant (champ "fichier").' });
    let invites;
    try {
      invites = await importInvitesFromBuffer(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    // L'ECRITURE est hors du `try` ci-dessus, a dessein : lui seul qualifie un
    // fichier illisible. Une panne de base (verrou tenu au-dela des 5 s, disque
    // plein, ROLLBACK impossible) doit partir en next(err) -> 500, sinon
    // l'animateur refait son classeur Excel en boucle pendant que sa liste
    // d'invites est dans un etat incertain — exactement ce que le commentaire
    // ci-dessus revendiquait sans que le code le fasse.
    replaceInvites(session.id, invites);
    res.json({ ok: true, invites: invites.length });
  } catch (err) {
    next(err);
  }
});

app.get('/api/sessions/:id/invites', chargerSession, (req, res) => {
  const session = req.session;
  res.json(getInvites(session.id));
});

// Invites n'ayant pas encore soumis : cible du rappel (US2.5).
app.get('/api/sessions/:id/invites/non-repondants', chargerSession, (req, res) => {
  const session = req.session;
  res.json(getNonRepondants(session.id));
});

// --- Identification du répondant (Epic 3) ---

app.post('/api/sessions/:id/repondants', (req, res) => {
  if (refuserSiImportEnCours(res)) return;
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

  // Un email ne s'identifie qu'une fois par session (index d'unicite pose dans
  // db.js). On refuse plutot que de renvoyer le repondant existant : le lien de
  // reponse est diffuse a toute l'equipe, donc rendre l'identifiant sur simple
  // connaissance d'un email laisserait lire ET reecrire le questionnaire d'un
  // collegue. Celui qui reprend son propre parcours passe par le lien memorise
  // dans son navigateur, jamais par ce chemin.
  const emailNormalise = email.trim().toLowerCase();
  const dejaIdentifie = db
    .prepare('SELECT 1 FROM repondants WHERE session_id = ? AND email = ?')
    .get(session.id, emailNormalise);
  if (dejaIdentifie) {
    return res.status(409).json({
      error: "Cet email s'est deja identifie sur cette session. Reprenez votre questionnaire depuis le lien de votre navigateur, ou contactez l'animateur.",
    });
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
    emailNormalise,
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

// La fenetre de saisie s'applique a CHAQUE ecriture, pas seulement a
// l'identification. Elle n'etait controlee qu'a la creation du repondant : celui
// qui s'etait identifie avant la cloture continuait ensuite d'enregistrer et de
// soumettre indefiniment — l'animateur fermait sa session, lisait ses resultats,
// exportait son PPT, et les agregats bougeaient encore derriere.
function sessionOuverteOu409(repondant, res) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(repondant.session_id);
  const statut = session ? sessionStatus(session) : 'fermee';
  if (statut !== 'ouverte') {
    res.status(409).json({
      error:
        statut === 'pas_encore_ouverte'
          ? "Cette session n'est pas encore ouverte a la saisie."
          : 'Cette session est fermee : vos reponses deja enregistrees sont conservees, mais elles ne peuvent plus etre modifiees.',
      statut,
    });
    return false;
  }
  return true;
}

// Vue REPONDANT : projection en LISTE BLANCHE, volontairement non nominative
// (finding securite de l'audit du 2026-09-04). Cette route est ouverte sans
// compte par ROUTES_REPONDANT (auth.js, US10.5) : son identifiant est un jeton
// porteur, sans expiration, qui voyage dans l'URL, l'historique du navigateur et
// tout lien copie — elle rendait pourtant la LIGNE COMPLETE (email, nom, prenom,
// departement, equipe, role). La route reste OUVERTE (le parcours de reponse en
// depend), mais ne renvoie plus que ce dont son unique appelant applicatif se
// sert (src/public/repondre.html, chargerRepondant) : l'identifiant, la session
// d'appartenance du lien, l'etat de soumission et les reponses deja saisies.
// Liste blanche et non liste noire : une colonne ajoutee plus tard a la table
// repondants reste fermee par defaut, comme la barriere d'auth elle-meme.
// Le detail nominatif garde son destinataire legitime : l'animateur
// authentifie, par /api/sessions/:id/resultats (drill-down US6.2).
const CHAMPS_VUE_REPONDANT = ['id', 'session_id', 'soumis_at'];

app.get('/api/repondants/:id', (req, res) => {
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  const reponses = db.prepare('SELECT question_id, niveau FROM reponses WHERE repondant_id = ?').all(repondant.id);
  const vue = {};
  for (const champ of CHAMPS_VUE_REPONDANT) vue[champ] = repondant[champ];
  res.json({ ...vue, reponses });
});

// Fail-closed sur la fenetre destructive de l'import « remplacer » (decision de
// conception arbitree, docs/wiki/todo.md) : plutot que d'accepter une ecriture
// qu'un remplacerTout concurrent va effacer sans trace, on la refuse pendant la
// fenetre et on demande de reessayer.
function refuserSiImportEnCours(res) {
  if (!estImportRemplacerEnCours()) return false;
  res.status(503).json({ error: 'Import du referentiel en cours (mode remplacer), reessayez dans quelques instants.' });
  return true;
}

app.put('/api/repondants/:id/piliers/:pilierId/reponses', (req, res) => {
  if (refuserSiImportEnCours(res)) return;
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  if (repondant.soumis_at) {
    return res.status(409).json({ error: 'Questionnaire deja soumis, modification impossible.' });
  }
  if (!sessionOuverteOu409(repondant, res)) return;

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

  // Perimetre VIDE (pilierId inexistant, ou pilier sans aucune question active
  // dans cette session) : sans cette garde, un corps `{reponses: []}` satisfaisait
  // le controle de completude ci-dessous (`0 !== 0` est faux), la boucle de
  // validation ne s'executait pas, la transaction n'ecrivait rien -- et l'API
  // repondait 200 { ok: true } en affirmant une sauvegarde qui n'avait pas eu
  // lieu. C'est la meme classe de defaut que celle fermee pour le cas PARTIEL
  // (commentaire ci-dessous) ; elle restait ouverte pour le cas VIDE (audit du
  // 2026-09-13). Il n'y a rien a sauvegarder ici : la ressource n'existe pas.
  if (questionIds.size === 0) {
    return res.status(404).json({ error: 'Pilier inconnu ou hors du perimetre actif de cette session.' });
  }

  const { reponses } = req.body || {};
  if (!Array.isArray(reponses)) {
    return res.status(400).json({ error: 'reponses doit etre un tableau de { question_id, niveau }.' });
  }
  if (reponses.length !== questionIds.size) {
    return res.status(400).json({ error: 'Toutes les questions de ce pilier doivent etre repondues pour le sauvegarder.' });
  }

  // TOUT valider avant d'ecrire quoi que ce soit. L'ancienne boucle validait et
  // ecrivait au meme tour : sur cinq reponses dont la quatrieme portait un niveau
  // hors bornes, les trois premieres etaient persistees, puis l'API rendait un 400
  // en affirmant qu'un pilier ne se sauvegarde que complet — elle venait d'en
  // enregistrer un partiel. La transaction ci-dessous couvre en plus l'echec
  // d'ecriture lui-meme (verrou, disque).
  const vues = new Set();
  for (const reponse of reponses) {
    // Une entree qui n'est pas un objet faisait lever `reponse.question_id` : le
    // repondant recevait un 500 « prevenez l'exploitant » pour une saisie mal
    // formee, et l'exploitant une alerte pour ce qui est un 400.
    if (!reponse || typeof reponse !== 'object') {
      return res.status(400).json({ error: 'Chaque reponse doit etre un objet { question_id, niveau }.' });
    }
    if (!questionIds.has(reponse.question_id)) {
      return res.status(400).json({ error: `La question ${reponse.question_id} n'appartient pas a ce pilier.` });
    }
    // La meme question deux fois : le controle de completude ci-dessus compte les
    // ENTREES, pas les questions couvertes. Onze fois la question 1 sur un pilier
    // de onze questions satisfaisait donc `reponses.length === questionIds.size`,
    // l'API repondait { ok: true } apres avoir ecrit UNE ligne, et le repondant
    // se retrouvait bloque a la soumission (1/40) sans savoir quoi rouvrir.
    if (vues.has(reponse.question_id)) {
      return res.status(400).json({ error: `La question ${reponse.question_id} est presente plusieurs fois dans l'envoi.` });
    }
    vues.add(reponse.question_id);
    // Le niveau doit etre un ENTIER avant d'etre lie : node:sqlite refuse un
    // booleen, un objet ou un tableau (« Provided value cannot be bound to SQLite
    // parameter »), ce qui partait en 500 au lieu du 400 que merite une saisie
    // mal formee.
    if (!Number.isInteger(reponse.niveau)) {
      return res.status(400).json({ error: `Niveau invalide pour la question ${reponse.question_id}.` });
    }
    const niveauValide = db
      .prepare('SELECT 1 FROM niveaux WHERE question_id = ? AND niveau = ?')
      .get(reponse.question_id, reponse.niveau);
    if (!niveauValide) {
      return res.status(400).json({ error: `Niveau invalide pour la question ${reponse.question_id}.` });
    }
  }

  const upsert = db.prepare(
    `INSERT INTO reponses (repondant_id, question_id, niveau) VALUES (?, ?, ?)
     ON CONFLICT(repondant_id, question_id) DO UPDATE SET niveau = excluded.niveau`
  );
  enTransaction(() => {
    for (const reponse of reponses) {
      upsert.run(repondant.id, reponse.question_id, reponse.niveau);
    }
  });

  res.json({ ok: true });
});

app.post('/api/repondants/:id/soumission', (req, res) => {
  if (refuserSiImportEnCours(res)) return;
  const repondant = getRepondantOr404(req, res);
  if (!repondant) return;
  if (repondant.soumis_at) {
    return res.status(409).json({ error: 'Questionnaire deja soumis.' });
  }
  if (!sessionOuverteOu409(repondant, res)) return;

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

// Un parametre de query STRING repete (?equipe=A&equipe=B) devient un TABLEAU chez
// Express, jamais une chaine — audit du 2026-09-02 : `manager === 'sans'` sur un
// tableau ne matche jamais (le filtre echoue vers l'OUVERT, silencieusement), et un
// tableau lie en parametre SQL prepare fait sortir node:sqlite en 500 (« Unknown
// named parameter '0' ») la ou une 400 s'imposait. Normalise en gardant la DERNIERE
// valeur (convention la plus commune pour un parametre repete par erreur/proxy),
// jamais un tableau brut — appliquee a chaque lecture de req.query ci-dessous.
// Le parseur `extended` ne produit pas QUE des tableaux : `?equipe[x]=A` donne un
// OBJET, invisible pour `Array.isArray`. Il ressortait donc tel quel et partait en
// parametre lie a node:sqlite (« Provided value cannot be bound to SQLite
// parameter ») -> filet terminal -> 500 la ou une 400 s'imposait, sur les 5 routes
// qui lisent equipe/departement/scope (audit du 2026-09-13). Un objet n'est pas une
// valeur de parametre valide : on le traite comme une valeur ABSENTE, ce que chaque
// appelant sanctionne deja par son « parametre requis » -> 400.
function unParam(valeur) {
  if (Array.isArray(valeur)) return valeur[valeur.length - 1];
  if (valeur !== null && typeof valeur === 'object') return undefined;
  return valeur;
}

// Filtre manager='sans' partage (finding risque_technique audit 2026-07-24 : motif
// repete ~6 fois) : liste centralisee des criteres compatibles avec est_manager (0/1).
function estManagerExclu(manager) {
  // `manager` reste NON normalise par `unParam` ici a dessein : c'est un filtre
  // d'EXCLUSION vie privee (masquer les managers), pas un simple selecteur -- sur
  // un parametre repete (?manager=sans&manager=x), "garder la derniere valeur"
  // (la normalisation appliquee partout ailleurs dans ce fichier) redonnait le
  // MEME defaut que celui corrige, sous une forme deterministe plutot
  // qu'accidentelle : un `x` ajoute apres `sans` aurait desactive l'exclusion.
  // Un filtre de confidentialite doit echouer vers le PLUS restrictif : si UNE
  // SEULE valeur demande l'exclusion, elle s'applique (chasse aux cas limites,
  // audit du 2026-09-02, corrige le 2026-09-03).
  //
  // Le durcissement ci-dessus ne couvrait que la forme TABLEAU du meme parseur :
  // `?manager[x]=sans` produit un OBJET, `Array.isArray` est faux, la comparaison
  // a 'sans' echoue et l'exclusion tombait SANS BRUIT (audit du 2026-09-13). La
  // recherche est donc recursive sur toutes les formes que le parseur peut rendre
  // (chaine, tableau, objet, imbriques) : une seule occurrence de 'sans' suffit.
  return contientSans(manager);
}

function contientSans(valeur) {
  if (valeur === 'sans') return true;
  if (valeur === null || typeof valeur !== 'object') return false;
  return Object.values(valeur).some(contientSans);
}

// Effectifs groupes par equipe/departement (finding risque_technique audit 2026-07-24 :
// /equipes et /departements etaient des routes quasi identiques, seule la colonne de
// regroupement variait). `colonne` est un litteral interne ('equipe'|'departement'),
// jamais derive de req.query — pas d'injection SQL possible via ce parametre.
function agregerEffectifPar(sessionId, colonne, manager) {
  let sql = `SELECT ${colonne} AS cle, COUNT(*) AS effectif
       FROM repondants
       WHERE session_id = ? AND soumis_at IS NOT NULL`;
  const params = [sessionId];
  if (estManagerExclu(manager)) {
    sql += ' AND est_manager = 0';
  }
  sql += ` GROUP BY ${colonne} ORDER BY ${colonne}`;
  return db.prepare(sql).all(...params);
}

app.get('/api/sessions/:id/equipes', chargerSession, (req, res) => {
  const session = req.session;
  const equipes = agregerEffectifPar(session.id, 'equipe', req.query.manager)
    .map((r) => ({ equipe: r.cle, effectif: r.effectif }));
  res.json(equipes);
});

// Departements presents dans la session (repondants ayant soumis), avec effectif.
app.get('/api/sessions/:id/departements', chargerSession, (req, res) => {
  const session = req.session;
  const departements = agregerEffectifPar(session.id, 'departement', req.query.manager)
    .map((r) => ({ departement: r.cle, effectif: r.effectif }));
  res.json(departements);
});

// Taux de reponse de la session (US6.2), independant du filtre equipe :
// questionnaires soumis rapportes au nombre d'invites (US2.5).
app.get('/api/sessions/:id/participation', chargerSession, (req, res) => {
  const session = req.session;
  const soumis = db
    .prepare('SELECT COUNT(*) AS n FROM repondants WHERE session_id = ? AND soumis_at IS NOT NULL')
    .get(session.id).n;
  const invites = db.prepare('SELECT COUNT(*) AS n FROM invites WHERE session_id = ?').get(session.id).n;
  res.json({ soumis, invites });
});

// Commentaire libre de restitution par equipe (US6.3) : saisi en preview,
// restitue a l'ecran (et plus tard dans l'export PPT, US6.4).
//
// Borne de longueur cote SERVEUR. Seul le TYPE du champ etait valide
// (audit-technique 2026-09-09) : un client posait un texte de plusieurs
// megaoctets, stocke tel quel, puis rendu dans l'ecran de restitution ET repris
// par la geometrie du .pptx d'export, ou il n'a aucune place. Aucune borne cote
// navigateur non plus (pas de maxlength sur le <textarea>), donc rien n'arretait
// le cas. 5000 caracteres : tres au-dela d'un commentaire de restitution reel
// (quelques lignes par equipe) et tres en deca de ce qui deforme l'export.
const LONGUEUR_MAX_COMMENTAIRE = 5000;
app.get('/api/sessions/:id/commentaire', chargerSession, (req, res) => {
  const session = req.session;
  const equipe = unParam(req.query.equipe);
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
  const ligne = db.prepare('SELECT texte FROM commentaires WHERE session_id = ? AND equipe = ?').get(session.id, equipe);
  res.json({ equipe, texte: ligne ? ligne.texte : '' });
});

app.put('/api/sessions/:id/commentaire', chargerSession, (req, res) => {
  const session = req.session;
  const { equipe, texte } = req.body || {};
  if (!equipe || typeof equipe !== 'string') return res.status(400).json({ error: "Le champ 'equipe' est requis." });
  if (texte !== undefined && typeof texte !== 'string') {
    return res.status(400).json({ error: 'texte doit etre une chaine de caracteres.' });
  }
  // Borne mesuree sur la chaine RECUE, pas sur sa version trimmee : sinon
  // 2 Mo d'espaces traversent la borne avant d'etre reduits a rien.
  if (typeof texte === 'string' && texte.length > LONGUEUR_MAX_COMMENTAIRE) {
    return res.status(400).json({
      error: `Le commentaire de restitution est limite a ${LONGUEUR_MAX_COMMENTAIRE} caracteres (${texte.length} recus).`,
    });
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

// Agregation des resultats pour une session, restreinte par un filtre
// { equipe } ou { departement } : structure pilier -> objectif -> question avec
// moyennes et pre-analyses. Reutilisee par l'ecran de resultats (Epic 5/US6.2),
// la comparaison historique (US6.5) et la consolidation departement (Epic 7).
// `options.nominatif` : le detail « qui a repondu quoi » (nom, prenom et
// libelle du niveau, par reponse). Il est desormais OPT-IN — `nominatif: true`
// et rien d'autre l'active — la ou il etait opt-out (`!== false`).
//
// Ce sens de defaut est le correctif de fond du 2026-09-10 (arbitrage
// utilisateur du constat de securite du 2026-09-04). Historique : le 2026-09-01
// on avait ferme la consolidation departement et la comparaison historique en
// leur passant `{ nominatif: false }` — chacune l'avait oublie et telechargeait
// nom, prenom et niveau de chaque reponse dans le navigateur du sponsor. Fermer
// les fuites une par une laisse la SUIVANTE ouverte : tout appelant qui oublie
// l'option recoit la PII. Avec un defaut opt-in, l'oubli va vers le silence, et
// c'est demander la PII qui devient un acte explicite et relisible en diff.
// Aujourd'hui un seul appelant la demande : la route de detail d'UNE question,
// appelee au depliement d'un accordeon (US6.2), authentifiee et scopee equipe.
//
// `nbReponses` est rendu DANS TOUS LES CAS : c'est le compte, pas l'identite.
// L'ecran en a besoin pour annoncer « voir le detail nominatif (N) » sans avoir
// recu les N lignes, et le classement des « points forts » pour exiger au moins
// 2 reponses avant de parler d'accord.
// Selection des repondants ayant soumis, filtres par equipe/departement et par
// exclusion manager. Extrait d'agregerResultats (finding perf 2026-09-12) pour
// etre reutilise par le detail cible d'UNE question SANS reimplementer son
// propre filtre derive : c'est ainsi qu'on obtiendrait deux verites sur « qui
// compte dans cette equipe » (le meme risque que documente plus bas pour la
// route de detail).
function selectionnerRepondants(sessionId, filtre, manager) {
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
  if (estManagerExclu(manager)) {
    repondants = repondants.filter((r) => !r.est_manager);
  }
  return repondants;
}

function agregerResultats(sessionId, filtre, manager, options = {}) {
  const nominatif = options.nominatif === true;
  const repondants = selectionnerRepondants(sessionId, filtre, manager);
  const repondantIds = new Set(repondants.map((r) => r.id));
  // Fix N+1 (finding perf audit 2026-07-24) : UNE requete pour toutes les reponses
  // des repondants retenus (au lieu d'une par question, imbriquee dans les boucles
  // pilier -> sous-categorie -> question), groupees ici par question. Le lookup
  // repondant passe aussi de find() lineaire (O(reponses x repondants)) a une Map.
  const repondantsParId = new Map(repondants.map((r) => [r.id, r]));
  const reponsesParQuestion = new Map();
  if (repondantIds.size > 0) {
    const placeholders = [...repondantIds].map(() => '?').join(',');
    const toutes = db
      .prepare(`SELECT repondant_id, question_id, niveau FROM reponses WHERE repondant_id IN (${placeholders})`)
      .all(...repondantIds);
    for (const r of toutes) {
      if (!reponsesParQuestion.has(r.question_id)) reponsesParQuestion.set(r.question_id, []);
      reponsesParQuestion.get(r.question_id).push(r);
    }
  }

  const piliers = referentielPourSession(sessionId);
  const resultatPiliers = piliers.map((pilier) => {
    const sousCategories = pilier.sousCategories.map((sousCategorie) => {
      const questions = sousCategorie.questions.map((question) => {
        // Deja filtre par repondant (requete IN ci-dessus) — plus de requete ici.
        const reponsesQuestion = reponsesParQuestion.get(question.id) || [];

        // Quand le detail n'est pas demande, la cle `reponses` est ABSENTE, pas
        // vide. Un tableau vide se confond avec « personne n'a repondu » et se
        // lit sans bruit : `q.reponses.length` aurait rendu 0 partout, et
        // « voir le detail nominatif (0) » se serait affiche sur des questions
        // repondues sans que rien n'echoue. Absente, la cle fait echouer tout
        // lecteur residuel au lieu de lui mentir.
        const reponsesDetail = nominatif
          ? reponsesQuestion.map((r) => {
              const repondant = repondantsParId.get(r.repondant_id);
              const niveauInfo = question.niveaux.find((n) => n.niveau === r.niveau);
              return {
                nom: repondant.nom,
                prenom: repondant.prenom,
                niveau: r.niveau,
                niveau_texte: niveauInfo ? niveauInfo.texte : null,
              };
            })
          : undefined;

        // Pre-analyses (US6.2) : moyenne, min, max et ecart-type des niveaux
        // saisis (statsNiveaux, teste unitairement) ; un fort ecart-type signale
        // un desaccord dans l'equipe, donc un point d'attention.
        const { moyenne, min, max, ecartType } = statsNiveaux(reponsesQuestion.map((r) => r.niveau));

        return {
          id: question.id,
          texte: question.texte,
          moyenne,
          min,
          max,
          ecartType,
          niveaux: question.niveaux,
          nbReponses: reponsesQuestion.length,
          reponses: reponsesDetail,
        };
      });

      const moyenneSousCategorie = moyenneDe(questions.map((q) => q.moyenne));
      return { id: sousCategorie.id, nom: sousCategorie.nom, moyenne: moyenneSousCategorie, questions };
    });

    const moyennePilier = moyenneDe(sousCategories.map((sc) => sc.moyenne));
    return { id: pilier.id, nom: pilier.nom, moyenne: moyennePilier, sousCategories };
  });

  return { effectif: repondants.length, piliers: resultatPiliers };
}

// Detail nominatif d'UNE question : « qui a repondu quoi », charge A LA DEMANDE
// au depliement de l'accordeon (US6.2), et nulle part ailleurs.
//
// Pourquoi une route separee plutot qu'un `?nominatif=1` sur /resultats : le
// parametre aurait garde UNE route capable de deverser la PII de TOUTES les
// questions d'un coup, donc la meme reponse volumineuse a n'importe qui sachant
// l'ajouter. Ici la granularite EST la garde : une requete ne peut rendre que
// les reponses d'une seule question, d'une seule equipe, d'une seule session.
//
// Controles, dans l'ordre : la session existe ; `equipe` est fourni (sans lui
// on refuse — jamais de repli « toute la session ») ; la question appartient au
// referentiel de CETTE session (sinon 404) ; le filtre manager de l'agrege
// s'applique a l'identique. L'authentification, elle, n'est pas refaite ici :
// elle est portee en amont par `barriereAuth()` (fail-closed integral), qui
// protege tout ce qui n'est pas dans ROUTES_REPONDANT — et cette route n'y est
// pas, volontairement. Le test verrouille ce 401, en casse melangee comprise.
//
// Fix perf (audit-technique, 2026-09-12) : cette route appelait auparavant
// agregerResultats() sur l'INTEGRALITE du referentiel de la session (boucle
// piliers -> sous-categories -> questions + 2 requetes SQL) pour n'en extraire
// qu'une seule question, repete a chaque clic sur une question DIFFERENTE (le
// cache client, bloc.dataset.charge, ne protege que la meme question
// ree-ouverte). Le filtre repondants (equipe/departement/manager) reste
// PARTAGE avec agregerResultats via selectionnerRepondants() — pour la meme
// raison qu'avant : une garde qui reimplemente son propre filtre derive de
// celui qu'elle est censee refleter, c'est comme ca qu'on obtient deux verites
// sur « qui compte dans cette equipe ». Seule la partie couteuse et inutile
// ici (construire l'arbre complet et les reponses de TOUTES les questions)
// est evitee : la requete `reponses` est desormais bornee a la question
// demandee, et l'appartenance au referentiel de la session se verifie par
// `activeQuestionIds()` (la meme source que `referentielPourSession`) sans
// construire les piliers/sous-categories.
app.get('/api/sessions/:id/questions/:questionId/detail', chargerSession, (req, res) => {
  const session = req.session;
  const equipe = unParam(req.query.equipe);
  const manager = req.query.manager;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });

  // `questions.id` est un INTEGER SQLite ; un parametre d'URL est toujours une
  // `string`. On convertit explicitement (plutot que de compter sur l'affinite
  // SQLite) : une valeur non entiere (ex. "question-qui-nexiste-pas") echoue
  // ici, avant toute requete.
  const questionId = Number(req.params.questionId);
  if (!Number.isInteger(questionId) || !activeQuestionIds(session.id).has(questionId)) {
    return res.status(404).json({ error: 'Question inconnue pour cette session.' });
  }
  const question = db.prepare('SELECT id, texte FROM questions WHERE id = ?').get(questionId);
  if (!question) return res.status(404).json({ error: 'Question inconnue pour cette session.' });

  const repondants = selectionnerRepondants(session.id, { equipe }, manager);
  const repondantsParId = new Map(repondants.map((r) => [r.id, r]));
  const repondantIds = [...repondantsParId.keys()];
  let reponsesQuestion = [];
  if (repondantIds.length > 0) {
    const placeholders = repondantIds.map(() => '?').join(',');
    reponsesQuestion = db
      .prepare(`SELECT repondant_id, niveau FROM reponses WHERE question_id = ? AND repondant_id IN (${placeholders})`)
      .all(questionId, ...repondantIds);
  }
  const niveauxQuestion = db.prepare('SELECT niveau, texte FROM niveaux WHERE question_id = ?').all(questionId);
  const reponses = reponsesQuestion.map((r) => {
    const repondant = repondantsParId.get(r.repondant_id);
    const niveauInfo = niveauxQuestion.find((n) => n.niveau === r.niveau);
    return {
      nom: repondant.nom,
      prenom: repondant.prenom,
      niveau: r.niveau,
      niveau_texte: niveauInfo ? niveauInfo.texte : null,
    };
  });
  return res.json({ questionId: question.id, equipe, nbReponses: reponses.length, reponses });
});

app.get('/api/sessions/:id/resultats', chargerSession, (req, res) => {
  const session = req.session;
  const equipe = unParam(req.query.equipe);
  const manager = req.query.manager;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });

  // SANS detail nominatif (defaut opt-in depuis le 2026-09-10) : l'ecran le
  // reclame question par question sur /questions/:questionId/detail quand
  // l'animateur deplie. `repondants` ci-dessous garde ses noms : le panneau
  // « qui a repondu / qui manque » est un affichage assume, jamais masque —
  // ce qu'on retire est l'APPARIEMENT nom <-> niveau repondu.
  const { effectif, piliers } = agregerResultats(session.id, { equipe }, manager);
  let membres = db
    .prepare('SELECT nom, prenom, soumis_at, est_manager FROM repondants WHERE session_id = ? AND equipe = ?')
    .all(session.id, equipe);
  if (estManagerExclu(manager)) {
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
app.get('/api/sessions/:id/consolidation', chargerSession, (req, res) => {
  const session = req.session;
  const departement = unParam(req.query.departement);
  const manager = req.query.manager;
  if (!departement) return res.status(400).json({ error: "Le parametre 'departement' est requis." });

  const { effectif, piliers } = agregerResultats(session.id, { departement }, manager, { nominatif: false });

  // Repartition par equipe au sein du departement (meme filtre manager).
  let reps = db
    .prepare('SELECT equipe, est_manager FROM repondants WHERE session_id = ? AND departement = ? AND soumis_at IS NOT NULL')
    .all(session.id, departement);
  if (estManagerExclu(manager)) reps = reps.filter((r) => !r.est_manager);
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
         AND s.est_demo = ?
       ORDER BY s.ouverture_at DESC
       LIMIT 1`
    )
    // `est_demo` egal a celui de la session courante : le jeu de demonstration
    // cree des equipes ouvertes 60 jours plus tot, et rien n'empeche une equipe
    // reelle de porter le meme libelle. La progression affichee a l'ecran et dans
    // le PPT presente au client se serait alors calculee contre des donnees
    // fictives. Une session de demo se compare a une demo, une reelle a une reelle.
    .get(session.id, equipe, session.ouverture_at, session.est_demo ? 1 : 0);
  if (!precedente) return { disponible: false };

  // La comparaison ne restitue que des moyennes par pilier et par objectif : le
  // detail nominatif des DEUX sessions n'y a aucun usage, et celui de la session
  // precedente est encore plus sensible (elle peut avoir change de perimetre).
  const courant = agregerResultats(session.id, { equipe }, manager, { nominatif: false });
  const ancien = agregerResultats(precedente.id, { equipe }, manager, { nominatif: false });

  // Alignement par nom : on ancre sur le referentiel de la session courante.
  //
  // La cle d'un objectif est (pilier, objectif), JAMAIS son nom seul : indexee
  // sur `sc.nom` a travers tous les piliers, deux sous-categories homonymes dans
  // deux piliers differents (cas banal : « Pilotage », « Qualite ») s'ecrasaient,
  // le dernier gagnait, et l'axe `precedent` du radar -- puis la progression
  // affichee a l'ecran ET dans le PPT remis au client -- portait sur le mauvais
  // objectif, sans aucun signal (audit du 2026-09-13). Meme qualification que
  // `Classement.aplatirQuestions(piliers, (p, sc) => ...)` plus bas.
  const cleObjectif = (nomPilier, nomObjectif) => JSON.stringify([nomPilier, nomObjectif]);
  const ancienParPilier = new Map(ancien.piliers.map((p) => [p.nom, p]));
  const ancienParObjectif = new Map();
  for (const p of ancien.piliers) {
    for (const sc of p.sousCategories) ancienParObjectif.set(cleObjectif(p.nom, sc.nom), sc.moyenne);
  }

  // Axes du radar : un par objectif (sous-categorie) du referentiel courant,
  // avec la moyenne courante et la moyenne precedente (par nom, null si absente).
  const axes = [];
  courant.piliers.forEach((pilier, pilierIndex) => {
    for (const sc of pilier.sousCategories) {
      const cle = cleObjectif(pilier.nom, sc.nom);
      axes.push({
        label: sc.nom,
        pilier: pilier.nom,
        pilierIndex,
        courant: sc.moyenne,
        precedent: ancienParObjectif.has(cle) ? ancienParObjectif.get(cle) : null,
      });
    }
  });

  // Regression/progression par pilier (delta = courant - precedent).
  const piliers = courant.piliers.map((pilier) => {
    const ancienPilier = ancienParPilier.get(pilier.nom);
    const precedent = ancienPilier ? ancienPilier.moyenne : null;
    const delta = deltaHistorique(pilier.moyenne, precedent);
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

app.get('/api/sessions/:id/comparaison', chargerSession, (req, res) => {
  const session = req.session;
  const equipe = unParam(req.query.equipe);
  const manager = req.query.manager;
  if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
  res.json(calculerComparaison(session, equipe, manager));
});

// --- Export du support de restitution PPT (US6.4) ---
// Construit le "bloc" de restitution d'une entite (equipe ou departement) :
// radar (objectifs + evolution eventuelle), commentaire, points d'attention.
function construireBlocRestitution(session, filtre, type, nom, manager) {
  const { effectif, piliers } = agregerResultats(session.id, filtre, manager);
  if (effectif === 0) return null;

  // Points d'attention / points forts (memes regles que l'ecran resultats,
  // US6.2) — classement extrait dans classement.js pour eviter que cette
  // implementation serveur et celle de resultats.html derivent l'une de
  // l'autre (constat audit-technique 2026-09-04).
  const questions = Classement.aplatirQuestions(piliers, (p, sc) => `${p.nom} · ${sc.nom}`);
  const { dispersion: dispersionClassee, faibles: faiblesClasses } = Classement.classerPointsAttention(questions);
  const { hauts: hautsClasses, accords: accordsClasses } = Classement.classerPointsForts(questions);

  const champsAvecDispersion = (q) => ({ texte: q.texte, moyenne: q.moyenne, ecartType: q.ecartType, min: q.min, max: q.max, contexte: q.contexte });
  const champsSimples = (q) => ({ texte: q.texte, moyenne: q.moyenne, contexte: q.contexte });

  const dispersion = dispersionClassee.map(champsAvecDispersion);
  const faibles = faiblesClasses.map(champsSimples);
  const hauts = hautsClasses.map(champsSimples);
  const accords = accordsClasses.map(champsAvecDispersion);

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

// Export PPT scope par ecran (US6.4) :
//  - scope=equipe       -> couverture + 2 slides de l'equipe (bouton resultats).
//  - scope=departement  -> couverture + 2 slides du departement + 2 slides par
//                          equipe du departement (bouton vue pilotage).
// Radar = image SVG facon web ; genere via Python (python-pptx + template OCTO).
app.get('/api/sessions/:id/export-ppt', chargerSession, (req, res) => {
  const session = req.session;
  const scope = unParam(req.query.scope);
  const equipe = unParam(req.query.equipe);
  const departement = unParam(req.query.departement);
  const manager = req.query.manager;

  let blocs; // affecte dans chaque branche de scope (sinon reponse 400 avant usage)
  let nomFichier = 'Restitution.pptx';
  let sousTitre; // idem : affecte dans chaque branche de scope

  if (scope === 'equipe') {
    if (!equipe) return res.status(400).json({ error: "Le parametre 'equipe' est requis." });
    const bloc = construireBlocRestitution(session, { equipe }, 'equipe', equipe, manager);
    if (!bloc) return res.status(400).json({ error: 'Aucune reponse soumise pour cette equipe.' });
    blocs = [bloc];
    // Ne pas re-prefixer "Équipe" si le nom d'equipe le contient deja (ex.
    // "Équipe Alpha" -> "Équipe Alpha", pas "Équipe Équipe Alpha").
    const libelleEquipe = /^\s*équipe\b/i.test(equipe) ? equipe : `Équipe ${equipe}`;
    sousTitre = libelleEquipe + (bloc.departement ? ` — ${bloc.departement}` : '');
    nomFichier = `Restitution - ${nomFichierSur(equipe)}.pptx`;
  } else if (scope === 'departement') {
    if (!departement) return res.status(400).json({ error: "Le parametre 'departement' est requis." });
    const blocDep = construireBlocRestitution(session, { departement }, 'departement', departement, manager);
    if (!blocDep) return res.status(400).json({ error: 'Aucune reponse soumise pour ce departement.' });
    let reps = db
      .prepare('SELECT equipe, est_manager FROM repondants WHERE session_id = ? AND departement = ? AND soumis_at IS NOT NULL')
      .all(session.id, departement);
    if (estManagerExclu(manager)) reps = reps.filter((r) => !r.est_manager);
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
  const nettoyer = () => {
    fs.promises.unlink(jsonPath).catch(() => {});
    fs.promises.unlink(outPath).catch(() => {});
  };

  try {
    fs.writeFileSync(jsonPath, JSON.stringify(payload), 'utf-8');
  } catch (err) {
    nettoyer();
    return res.status(500).json({ error: 'Preparation de l\'export impossible.', detail: String(err.message).slice(0, 500) });
  }

  // `timeout` : un python-pptx qui part en boucle, ou un interpreteur qui attend
  // une entree, laissait sinon la requete ouverte jusqu'au delai reseau du client.
  // 120 s couvre largement un export reel (mesure : quelques secondes).
  execFile(python, [script, jsonPath, outPath], { timeout: 120_000 }, (err, stdout, stderr) => {
    if (err) {
      nettoyer();
      const expire = err.killed || err.signal === 'SIGTERM';
      return res.status(500).json({
        error: expire ? "La generation du PPT a depasse le delai de 2 minutes." : 'Echec de la generation du PPT.',
        detail: String(stderr || err.message).slice(0, 500),
      });
    }
    // Python peut sortir en 0 sans avoir ecrit son fichier : sans ce controle,
    // res.download echouait APRES l'envoi des en-tetes et la requete restait
    // pendante.
    // Existence NE SUFFIT PAS : python peut sortir en 0 apres avoir cree le
    // fichier sans l'ecrire (template introuvable en fin de script, disque plein
    // sur le save final). `res.download` servait alors un .pptx de 0 octet en
    // HTTP 200 — PowerPoint refuse de l'ouvrir, et `nettoyer()` efface la piece a
    // conviction juste apres. On mesure donc la TAILLE.
    let tailleProduite;
    try {
      tailleProduite = fs.statSync(outPath).size;
    } catch {
      tailleProduite = 0;
    }
    if (tailleProduite === 0) {
      nettoyer();
      return res.status(500).json({
        error: "L'export s'est termine sans produire de fichier exploitable.",
        detail: String(stdout || '').slice(0, 500),
      });
    }
    // Le nettoyage etait passe tel quel comme rappel de `download` : il ignorait
    // son argument d'erreur, donc un envoi interrompu ne repondait jamais.
    res.download(outPath, nomFichier, (errEnvoi) => {
      nettoyer();
      if (errEnvoi && !res.headersSent) {
        res.status(500).json({ error: 'Envoi du PPT impossible.' });
      }
    });
  });
});

// --- Filet d'erreur terminal ---

// Doit rester APRES toutes les routes : Express reconnait un middleware d'erreur
// a son arite de 4, et ne l'appelle que pour ce qui a ete passe a `next(err)` ou
// jete par un handler synchrone. Sans lui, deux comportements observes :
//   - une erreur multer (typiquement le depassement de `fileSize`, 10 Mo) tombait
//     sur le gestionnaire par defaut d'Express, qui rend une PAGE HTML 500 avec
//     pile d'appels — la ou toute l'UI attend `{ error }` en JSON ;
//   - un `next(err)` n'avait nulle part ou aller.
// `_next` est present mais inutilise : le retirer ramenerait l'arite a 3 et
// Express traiterait ce middleware comme une route ordinaire, jamais appelee sur
// erreur. Ne pas le supprimer en croyant nettoyer.
app.use((err, req, res, _next) => {
  console.error('[erreur non geree]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  const trop_gros = err && err.code === 'LIMIT_FILE_SIZE';
  if (trop_gros) {
    return res.status(413).json({ error: 'Fichier trop volumineux (10 Mo maximum).' });
  }
  // Erreur CLIENTE qui porte deja son propre statut. body-parser (express.json)
  // en pose deux, tous deux `expose: true` : 413 « entity.too.large » au-dela de
  // sa limite (100 ko par defaut) et 400 sur un JSON malforme. Sans ce relais,
  // les deux arrivaient au client en 500 « erreur interne du serveur » --
  // trompeur (c'est la requete qui est fautive, pas le serveur) et, surtout,
  // CONTOURNANT : la borne de longueur du commentaire de restitution (400
  // au-dela de 5000 caracteres) n'est jamais atteinte pour un corps de plus de
  // 100 ko, et le meme envoi abusif ressortait donc en 500 (mesure le
  // 2026-09-09 par le test test-robustesse-http.js, sur le correctif de borne
  // lui-meme). On ne relaie QUE des statuts 4xx explicitement exposables : une
  // erreur interne reste un 500 opaque, sans fuite de detail.
  const statutClient = err && err.expose === true && Number.isInteger(err.status) && err.status >= 400 && err.status < 500
    ? err.status
    : null;
  if (statutClient !== null) {
    return res.status(statutClient).json({
      error: statutClient === 413
        ? 'Corps de requete trop volumineux.'
        : 'Corps de requete illisible (JSON attendu).',
    });
  }
  res.status(500).json({ error: 'Erreur interne du serveur. Si elle persiste, prevenez l\'exploitant.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Serveur demarre sur http://localhost:${port}`);
});
