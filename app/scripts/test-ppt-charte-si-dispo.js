// Pont vers test-ppt-charte.py (charte graphique du PPT) depuis `npm test`.
// Cause corrigée : `py scripts/test-ppt-charte.py` en dur dans package.json —
// `py` (lanceur Windows) absent sur ubuntu, exit 127, CI rouge.
require('./_pont-python').lancerSiPptx('test-ppt-charte.py', 'test-ppt-charte');
