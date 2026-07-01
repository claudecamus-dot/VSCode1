const assert = require('node:assert/strict');
const { formatSessionLabel } = require('../src/session-utils');

const label = formatSessionLabel({
  id: '550e8400-e29b-41d4-a716-446655440000',
  ouverture_at: '2026-07-01T09:00:00Z',
  fermeture_at: '2026-07-15T18:00:00Z',
});

assert.match(label, /550e8400/);
assert.match(label, /Session/);
assert.match(label, /2026/);

console.log('Session label format OK');
