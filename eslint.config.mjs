import js from '@eslint/js';
import globals from 'globals';

// Correctness-only linting: this config deliberately ratifies the style the
// codebase already has rather than imposing a new one, so there are no
// formatting rules here at all (no indent/quote/semicolon opinions) and
// nothing that would produce a large mechanical diff.
//
// The rule that actually earns its place in this project is `no-undef`.
// index.html loads ~43 plain <script> tags in a hand-maintained order onto
// one shared `window.Bowtie` namespace, with no module system -- so a
// typo'd global or a load-order mistake is otherwise only caught if a
// Playwright test happens to click that exact path.
export default [
  {
    // Generated files -- regenerate them via their build scripts, don't
    // hand-edit, and don't lint the output.
    ignores: [
      'js/data/DemoData.js',
      'js/data/RiskMatrixPresets.js',
      'node_modules/**',
      'dist/**',
    ],
  },

  // The app itself: plain browser scripts (not modules), each an IIFE
  // attaching to the shared Bowtie namespace.
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'after-used' }],
    },
  },

  // Build/maintenance scripts: Node, CommonJS.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'after-used' }],
    },
  },
];
