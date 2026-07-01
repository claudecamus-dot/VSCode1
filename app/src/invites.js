const ExcelJS = require('exceljs');
const db = require('./db');

function cellText(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object' && 'richText' in cell) {
    return cell.richText.map((r) => r.text).join('');
  }
  if (typeof cell === 'object' && 'text' in cell) return cell.text;
  return String(cell).trim();
}

function looksLikeEmail(valeur) {
  return typeof valeur === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur.trim());
}

function parseCsv(buffer) {
  return buffer
    .toString('utf-8')
    .split(/\r?\n/)
    .filter((ligne) => ligne.trim())
    .map((ligne) => {
      const [email, nom] = ligne.split(/[;,]/).map((v) => (v || '').trim());
      return { email, nom: nom || null };
    });
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  const lignes = [];
  worksheet.eachRow((row) => {
    lignes.push({ email: cellText(row.getCell(1).value), nom: cellText(row.getCell(2).value) });
  });
  return lignes;
}

async function importInvitesFromBuffer(buffer, nomFichier) {
  const estXlsx = /\.xlsx$/i.test(nomFichier || '');
  const lignesBrutes = estXlsx ? await parseXlsx(buffer) : parseCsv(buffer);

  const vues = new Set();
  const invites = [];
  for (const ligne of lignesBrutes) {
    if (!looksLikeEmail(ligne.email)) continue;
    const email = ligne.email.trim().toLowerCase();
    if (vues.has(email)) continue;
    vues.add(email);
    invites.push({ email, nom: ligne.nom || null });
  }

  if (invites.length === 0) {
    throw new Error('Aucun email valide detecte dans le fichier (colonne A = email, colonne B = nom optionnel).');
  }
  return invites;
}

function replaceInvites(sessionId, invites) {
  db.prepare('DELETE FROM invites WHERE session_id = ?').run(sessionId);
  const insert = db.prepare('INSERT INTO invites (session_id, email, nom) VALUES (?, ?, ?)');
  for (const invite of invites) {
    insert.run(sessionId, invite.email, invite.nom);
  }
}

function getInvites(sessionId) {
  return db.prepare('SELECT email, nom FROM invites WHERE session_id = ? ORDER BY email').all(sessionId);
}

// Invites n'ayant pas (encore) soumis de questionnaire, pour le rappel cible
// (US2.5). On rapproche par email : un invite est considere comme ayant repondu
// si un repondant de la session a soumis (soumis_at non nul) avec le meme email.
// Faute d'email cote repondant (sessions anterieures), aucun rapprochement n'est
// possible : la liste degrade alors naturellement vers "tous les invites".
function getNonRepondants(sessionId) {
  const invites = getInvites(sessionId);
  const repondus = new Set(
    db
      .prepare(
        'SELECT DISTINCT email FROM repondants WHERE session_id = ? AND soumis_at IS NOT NULL AND email IS NOT NULL'
      )
      .all(sessionId)
      .map((r) => r.email.trim().toLowerCase())
  );
  return invites.filter((invite) => !repondus.has(invite.email.trim().toLowerCase()));
}

module.exports = { importInvitesFromBuffer, replaceInvites, getInvites, getNonRepondants, looksLikeEmail };
