'use strict';

// Config ESLint (flat) minimale : outille les conventions du code sans imposer
// de refonte. Regles = recommandations ESLint (detecte les vrais problemes :
// variables non utilisees, non definies, redeclarations...). Le formatage pur
// (espaces, guillemets) n'est volontairement pas verrouille ici — a confier a
// Prettier/.editorconfig si le besoin se confirme.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,

  // Serveur, modules et scripts Node : CommonJS (require / module.exports)
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
    ignores: ['src/public/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Pages statiques : navigateur, scripts classiques (pas de modules ES)
  {
    files: ['src/public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },

  // Fichiers/dossiers non lintes
  {
    ignores: ['node_modules/**', 'data/**', 'eslint.config.js'],
  },
];
