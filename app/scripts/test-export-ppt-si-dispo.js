// Pont vers le test du LIVRABLE principal (scripts/test-export-ppt.py) depuis la
// commande standard `npm test` — finding risque_technique de l'audit flotte
// 2026-07-24 : « le seul test du chemin export n'est pas branché dans npm test ».
// Sélection de l'interpréteur et règle skip/échec : voir _pont-python.js
// (skip propre en local sans python-pptx ; échec si CI ou REQUIRE_PPTX défini).
require('./_pont-python').lancerSiPptx('test-export-ppt.py', 'test-export-ppt');
