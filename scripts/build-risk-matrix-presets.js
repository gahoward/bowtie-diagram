#!/usr/bin/env node
// Wraps every js/data/risk-matrices/*.json preset into js/data/
// RiskMatrixPresets.js, exposing Bowtie.RISK_MATRIX_PRESETS -- mirrors
// build-demo-data.js exactly, for the same reason (the app makes no
// fetch() calls and must work standalone over file://).
//
// Each source JSON is authored in the unit the standard itself uses
// (authoringUnit: "year" for Leaflet 5's per-annum figures) so it reads
// exactly like the source document. This script converts every
// likelihoodClasses[].minValue into canonical events/hour using the same
// exact-decimal conversion helper (Decimal.js) the app uses at runtime,
// validates the preset's shape, and fails loudly on anything malformed
// rather than shipping a broken preset silently.
//
// Run this whenever you add or edit a file under js/data/risk-matrices/:
//   node scripts/build-risk-matrix-presets.js
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'js', 'data', 'risk-matrices');
const OUT = path.join(__dirname, '..', 'js', 'data', 'RiskMatrixPresets.js');

// Decimal.js/RiskMatrixValidator.js are written as browser IIFEs attaching
// to window.Bowtie -- load them under a minimal shim so this plain-Node
// build script can reuse the EXACT same validation/conversion logic
// Project Settings' "Import Risk Matrix..." runs at runtime, rather than a
// second, driftable reimplementation.
global.window = { Bowtie: {} };
require(path.join(__dirname, '..', 'js', 'model', 'Decimal.js'));
require(path.join(__dirname, '..', 'js', 'model', 'RiskMatrixValidator.js'));
const { validateRiskMatrix } = global.window.Bowtie;

function validateAndConvert(file, preset) {
  const result = validateRiskMatrix(preset);
  if (!result.ok) throw new Error(`${file}: ${result.error}`);
  return result.matrix;
}

function main() {
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error(`No preset JSON files found in ${SRC_DIR}`);

  const presets = {};
  files.forEach((file) => {
    const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    const preset = JSON.parse(raw); // fail loudly here if the source isn't valid JSON
    presets[preset.id] = validateAndConvert(file, preset);
  });

  const out = `// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/risk-matrices/*.json -- edit those files (each
// authored in its own natural unit, see "authoringUnit"), then run
// \`node scripts/build-risk-matrix-presets.js\` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-risk-matrix-presets.js.
// Every likelihoodClasses[].minValue below is already canonical
// events/hour; "authoringUnit" is preserved only as display metadata for
// the matrix editor, never read by calculation/banding logic.
(function (Bowtie) {
  Bowtie.RISK_MATRIX_PRESETS = ${JSON.stringify(presets, null, 2)};
})(window.Bowtie = window.Bowtie || {});
`;

  fs.writeFileSync(OUT, out);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} from ${files.length} preset(s): ${files.join(', ')}`);
}

main();
