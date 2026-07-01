function formatSessionLabel(session) {
  if (!session) return 'Session';
  const dateDebut = session.ouverture_at ? new Date(session.ouverture_at) : null;
  const dateFin = session.fermeture_at ? new Date(session.fermeture_at) : null;
  const partieDate = dateDebut && !Number.isNaN(dateDebut.getTime())
    ? dateDebut.toLocaleDateString('fr-FR')
    : 'Date à définir';
  const idCourt = typeof session.id === 'string' && session.id.length > 8 ? session.id.slice(0, 8) : session.id || 'session';
  return `Session ${idCourt} — ${partieDate}${dateFin && !Number.isNaN(dateFin.getTime()) ? ` → ${dateFin.toLocaleDateString('fr-FR')}` : ''}`;
}

module.exports = { formatSessionLabel };
