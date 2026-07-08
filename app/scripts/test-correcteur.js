// Garde-fou du correcteur orthographique conservateur (src/correcteur.js).
//
// Objectif principal : verrouiller le chargement du dictionnaire ESM
// `dictionary-fr` via `import()` dynamique depuis un module CommonJS
// (`nspell(module.default)`). Si une future version du paquet change la forme
// de son export, `corrigerReferentiel` rejette et ce test echoue — c'est le
// seul risque residuel identifie pour cette dependance (voir le wiki, zones
// d'ombre). Les assertions sont DETERMINISTES : elles ne dependent pas des
// suggestions du dictionnaire, seulement des regles conservatrices du module
// (majuscules / acronymes / vocabulaire metier laisses intacts).

const assert = require('node:assert/strict');
const { corrigerReferentiel } = require('../src/correcteur');

async function main() {
  const piliers = [
    {
      nom: 'Scrum et agilité', // "Scrum" (majuscule) -> preserve quel que soit le dico
      sousCategories: [
        {
          nom: 'kanban', // terme metier de TERMES_AUTORISES -> preserve
          questions: [
            {
              texte: 'MVP livré', // "MVP" (acronyme majuscule) -> preserve
              niveaux: [{ texte: 'oui' }],
            },
          ],
        },
      ],
    },
  ];

  // Charge dictionary-fr (ESM) via import() dynamique + nspell : si ce chargement
  // casse, la promesse rejette et le test tombe.
  const res = await corrigerReferentiel(piliers);

  assert.ok(Array.isArray(res) && res.length === 1, 'corrigerReferentiel renvoie les piliers');
  assert.match(res[0].nom, /Scrum/, 'nom propre "Scrum" (majuscule) préservé');
  assert.equal(res[0].sousCategories[0].nom, 'kanban', 'terme métier "kanban" préservé');
  assert.match(
    res[0].sousCategories[0].questions[0].texte,
    /MVP/,
    'acronyme "MVP" préservé',
  );

  console.log('Correcteur (chargement ESM dictionary-fr + corrections conservatrices) OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
