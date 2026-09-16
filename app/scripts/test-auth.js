// Test fonctionnel de la barriere d'acces INTERIMAIRE (Basic Auth, option A de
// l'arbitrage securite:VSCode1-api-pii). Demarre le VRAI serveur en processus
// enfant et le sollicite en HTTP reel — pas un mock du middleware.
//
// Prouve trois choses :
//   1. Barriere ACTIVE (AUTH_USER/AUTH_PASS poses) : la surface animateur/PII
//      renvoie 401 sans identifiants, 200 avec les bons, 401 avec de mauvais.
//   2. Le parcours REPONDANT reste ouvert sans identifiants (US10.5).
//   3. Barriere INACTIVE (variables absentes) : comportement STRICTEMENT
//      inchange — la meme route repond 200 sans identifiants (controle).
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { portLibre, attendreServeur, attendreMort, nettoyer, fetchMutant, USER, PASS, basic } = require('./test-helpers-serveur');

const DELAI_DEMARRAGE_MS = 15000;

function niveaux() {
  return [0, 1, 2, 3].map((n) => ({ niveau: n, texte: `niveau ${n}`, valeur_numerique: n }));
}

async function avecServeur(envSupp, corps, { seed = false } = {}) {
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const dossierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-http-'));
  const dbPath = path.join(dossierTmp, 'auth.db');
  if (seed) {
    // Seed direct (meme pattern que test-fenetre-saisie.js) : la creation de
    // session (POST /api/sessions) exige un referentiel non vide ; necessaire
    // pour le scenario departements/equipes/roles session-scopes ci-dessous,
    // qui cree une vraie session. `require('../src/db')` ouvre une connexion
    // mise en cache par Node sur le CHEMIN DU MODULE (pas sur DB_PATH) : ne
    // JAMAIS appeler ce bloc plus d'une fois par processus, un second appel
    // reutiliserait la connexion (deja fermee) du premier DB_PATH.
    process.env.DB_PATH = dbPath;
    const dbSeed = require('../src/db');
    const { reconcileReferentiel } = require('../src/referentiel');
    reconcileReferentiel([
      { nom: 'Pilier X', ordre: 0, sousCategories: [{ nom: 'Objectif Y', ordre: 0, questions: [{ texte: 'Q1', niveaux: niveaux() }] }] },
    ]);
    dbSeed.close();
  }
  const serveur = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'src', 'server.js')],
    {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath, APP_ENV: 'test-auth', ...envSupp },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let sortie = '';
  serveur.stdout.on('data', (d) => { sortie += d; });
  serveur.stderr.on('data', (d) => { sortie += d; });
  try {
    await attendreServeur(base, DELAI_DEMARRAGE_MS);
    await corps(base);
  } catch (err) {
    console.error('Sortie du serveur pendant le test :\n' + sortie);
    throw err;
  } finally {
    serveur.kill();
    await attendreMort(serveur);
    await nettoyer(dossierTmp);
  }
}

async function main() {
  // --- 1 & 2 : barriere ACTIVE ---
  await avecServeur({ AUTH_USER: USER, AUTH_PASS: PASS }, async (base) => {
    // Surface animateur / PII : fermee sans identifiants.
    const sessionsAnon = await fetch(`${base}/api/sessions`);
    assert.equal(sessionsAnon.status, 401, 'GET /api/sessions (collection admin) doit etre 401 sans identifiants');
    assert.match(sessionsAnon.headers.get('www-authenticate') || '', /^Basic /, 'un defi Basic doit etre renvoye');

    // Mauvais identifiants : toujours 401.
    const sessionsMauvais = await fetch(`${base}/api/sessions`, { headers: { Authorization: basic(USER, 'faux') } });
    assert.equal(sessionsMauvais.status, 401, 'mauvais mot de passe doit rester 401');

    // Bons identifiants : la route repond.
    const sessionsOk = await fetch(`${base}/api/sessions`, { headers: { Authorization: basic(USER, PASS) } });
    assert.equal(sessionsOk.status, 200, 'GET /api/sessions doit repondre 200 avec les bons identifiants');

    // Page animateur : fermee sans identifiants, ouverte avec (declenche l'invite navigateur).
    const adminAnon = await fetch(`${base}/admin.html`);
    assert.equal(adminAnon.status, 401, 'admin.html doit etre 401 sans identifiants');
    const adminOk = await fetch(`${base}/admin.html`, { headers: { Authorization: basic(USER, PASS) } });
    assert.equal(adminOk.status, 200, 'admin.html doit etre 200 avec les bons identifiants');

    // Parcours REPONDANT : ouvert SANS identifiants (US10.5).
    for (const route of ['/api/env', '/api/texte-intro-defaut']) {
      const r = await fetch(`${base}${route}`);
      assert.equal(r.status, 200, `route repondant ${route} doit rester ouverte (US10.5), recu ${r.status}`);
    }
    const repondrePage = await fetch(`${base}/repondre.html`);
    assert.equal(repondrePage.status, 200, 'repondre.html doit rester ouverte sans identifiants');

    // Correctif securite (arbitrage 2026-09-16, US10.5 invalidee sur ces 3
    // routes precises) : departements/equipes/roles ne sont plus des routes
    // GLOBALES sans contexte -- elles exigent desormais un identifiant de
    // session dans l'URL, meme sans compte (le parcours repondant les utilise
    // toujours sans identifiants Basic Auth).
    const creation = await fetchMutant(`${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: basic(USER, PASS) },
      body: JSON.stringify({
        ouverture_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        fermeture_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    assert.equal(creation.status, 200, 'creation de session (animateur authentifie)');
    const { id: sessionId } = await creation.json();
    for (const route of [`/api/sessions/${sessionId}/roles`, `/api/sessions/${sessionId}/departements-suggestions`, `/api/sessions/${sessionId}/equipes-suggestions`]) {
      const r = await fetch(`${base}${route}`);
      assert.equal(r.status, 200, `route repondant session-scopee ${route} doit rester ouverte (US10.5), recu ${r.status}`);
    }
    // Les anciennes routes globales, elles, sont desormais fermees (US10.5
    // invalidee : elles agregaient TOUTES les sessions, cross-client).
    for (const route of ['/api/departements', '/api/equipes', '/api/roles']) {
      const r = await fetch(`${base}${route}`);
      assert.equal(r.status, 401, `ancienne route globale ${route} doit desormais exiger des identifiants (recu ${r.status})`);
    }
  }, { seed: true });

  // --- 3 : barriere INACTIVE (controle : comportement inchange) ---
  await avecServeur({ AUTH_USER: '', AUTH_PASS: '' }, async (base) => {
    const sessions = await fetch(`${base}/api/sessions`);
    assert.equal(sessions.status, 200, 'sans AUTH_USER/AUTH_PASS, /api/sessions doit rester 200 (comportement inchange)');
    const admin = await fetch(`${base}/admin.html`);
    assert.equal(admin.status, 200, 'sans identifiants configures, admin.html reste ouverte comme avant');
  });

  console.log('Test barriere Basic Auth OK (fail-closed sur PII, parcours repondant ouvert, no-op sans creds)');
}

main().then(
  () => process.exit(0),
  (err) => { console.error(err); process.exit(1); },
);
