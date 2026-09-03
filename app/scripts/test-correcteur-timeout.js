// Audit technique du 2026-09-02 (robustesse) : les evenements 'error' et 'exit'
// du worker couvrent son CRASH, pas son BLOCAGE -- un worker qui ne repond
// jamais (dictionnaire bloque, entree pathologique) laissait
// POST /api/referentiel/import pendu indefiniment, sans jamais rejeter.
//
// Ce test force `CORRECTEUR_DELAI_MAX_MS` tres en dessous du temps de
// chargement reel du dictionnaire (~4,6 s mesures) : la promesse DOIT rejeter
// par timeout plutot que par un chargement anormalement rapide, et le worker
// doit etre reellement termine (le processus de test doit pouvoir sortir).
const assert = require('node:assert/strict');

process.env.CORRECTEUR_DELAI_MAX_MS = '20'; // tres inferieur aux ~4,6 s de chargement reel
const { corrigerReferentiel } = require('../src/correcteur');

async function main() {
  const piliers = [{ nom: 'Test timeout', sousCategories: [] }];

  const debut = Date.now();
  await assert.rejects(
    () => corrigerReferentiel(piliers),
    /sans reponse apres 20ms/,
    'la promesse rejette avec le message de timeout attendu',
  );
  const duree = Date.now() - debut;
  assert.ok(duree < 4000, `le rejet arrive par le TIMEOUT (20ms), pas par la fin du chargement reel (~4,6s) -- duree observee ${duree}ms`);

  console.log(`Timeout du correcteur declenche en ${duree}ms (borne < 4000ms) OK`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
