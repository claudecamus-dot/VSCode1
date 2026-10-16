// L'export relit le commentaire de restitution par la MEME cle canonique que GET/PUT /commentaire :
// un commentaire stocke sous une graphie equivalente (casse, accents) de l'equipe est exporte.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { check, terminer, dossierTemporaire, creerBaseAvecReferentiel, lancer, creerSessionOuverte, nettoyer } = require('./harnais-robustesse');

(async () => {
  const dossier = dossierTemporaire('back-export-commentaire');
  const dbPath = path.join(dossier, 'e.db');
  creerBaseAvecReferentiel(dbPath);
  const capture = path.join(dossier, 'capture');
  fs.mkdirSync(capture);
  const shim = path.join(dossier, 'shim-python.js');
  fs.writeFileSync(shim, [
    "const path = require('node:path');",
    "if (path.basename(process.argv[1] || '') === 'export-restitution-ppt.py') {",
    "  const fs = require('node:fs');",
    "  fs.copyFileSync(process.argv[2], path.join(process.env.CAPTURE_DIR, 'payload.json'));",
    "  fs.writeFileSync(process.argv[3], 'x');",
    '  process.exit(0);', '}', '',
  ].join('\n'));
  const serveur = await lancer({ dbPath, nom: 'back-export-commentaire', env: { PYTHON: process.execPath, NODE_OPTIONS: `--require ${shim}`, CAPTURE_DIR: capture } });
  try {
    const sessionId = await creerSessionOuverte(serveur.base);
    const w = new DatabaseSync(dbPath);
    const ins = w.prepare("INSERT INTO repondants (id, session_id, email, nom, prenom, departement, equipe, role, est_manager, dans_equipe, created_at, soumis_at) VALUES (?, ?, ?, 'N', 'P', 'D', ?, 'R', 0, 1, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')");
    ins.run('r1', sessionId, 'r1@x.fr', 'Équipe Alpha');
    // Commentaire historique stocke sous une graphie equivalente (pas la graphie exacte des repondants).
    w.prepare("INSERT INTO commentaires (session_id, equipe, texte, updated_at) VALUES (?, 'equipe alpha', 'avis alpha', '2026-01-01T00:00:00.000Z')").run(sessionId);
    w.close();
    const exporter = async (params) => {
      fs.rmSync(path.join(capture, 'payload.json'), { force: true });
      const r = await fetch(`${serveur.base}/api/sessions/${sessionId}/export-ppt?${new URLSearchParams(params)}`);
      await r.arrayBuffer();
      if (r.status !== 200) throw new Error(`export refuse : ${r.status}`);
      return JSON.parse(fs.readFileSync(path.join(capture, 'payload.json'), 'utf-8'));
    };
    const pe = await exporter({ scope: 'equipe', equipe: 'Équipe Alpha' });
    check(pe.blocs[0].commentaire === 'avis alpha', `scope equipe : commentaire retrouve sous graphie equivalente (« ${pe.blocs[0].commentaire} »)`);
    const pd = await exporter({ scope: 'departement', departement: 'D' });
    const bd = pd.blocs.find((b) => b.type === 'departement');
    check(bd.commentaire === 'Équipe Alpha : avis alpha', `scope departement : idem (« ${bd.commentaire} »)`);
  } finally { await serveur.arreter(); await nettoyer(dossier); }
  terminer();
  console.log('Export commentaire cle canonique OK');
})().catch((e) => { console.error(e); process.exit(1); });
