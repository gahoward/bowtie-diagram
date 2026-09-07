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

// Decimal.js is written as a browser IIFE attaching to window.Bowtie --
// load it under a minimal shim so this plain-Node build script can reuse
// the exact same conversion logic the app runs at runtime, rather than a
// second, driftable reimplementation.
global.window = { Bowtie: {} };
// eslint-disable-next-line import/no-dynamic-require, global-require
require(path.join(__dirname, '..', 'js', 'model', 'Decimal.js'));
const { Decimal, convertHourYear } = global.window.Bowtie;

function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

function validateAndConvert(file, preset) {
  if (!preset.id || !preset.name || !preset.cells) fail(file, 'missing id/name/cells');
  if (!['hour', 'year'].includes(preset.authoringUnit)) fail(file, 'authoringUnit must be "hour" or "year"');

  const severity = preset.severityClasses || [];
  const likelihood = preset.likelihoodClasses || [];
  const riskClasses = preset.riskClasses || [];
  const riskIds = new Set(riskClasses.map((r) => r.id));

  // Ordinals contiguous from 0, one per class, no gaps or duplicates.
  [severity, likelihood].forEach((classes, i) => {
    const label = i === 0 ? 'severityClasses' : 'likelihoodClasses';
    const ordinals = classes.map((c) => c.ordinal).slice().sort((a, b) => a - b);
    ordinals.forEach((ord, idx) => {
      if (ord !== idx) fail(file, `${label} ordinals must be contiguous from 0 (got ${JSON.stringify(ordinals)})`);
    });
  });

  // likelihoodClasses must be sorted most-frequent-first (array order) --
  // see auto-arrange-fix.md-style "band boundaries" reasoning in
  // quantitative_mode_proposal.md: this makes gaps/overlaps structurally
  // impossible. Most-frequent-first means each entry's own minValue is
  // STRICTLY GREATER than the next entry's, with no duplicates.
  for (let i = 0; i < likelihood.length - 1; i += 1) {
    const a = Decimal.parse(likelihood[i].minValue);
    const b = Decimal.parse(likelihood[i + 1].minValue);
    if (!a.greaterThan(b)) {
      fail(file, `likelihoodClasses must be sorted strictly most-frequent-first with no duplicate minValue (index ${i})`);
    }
  }

  // Every matrix cell must reference a real riskClasses id, and the grid
  // dimensions must exactly match the declared class counts.
  if (preset.cells.length !== likelihood.length) {
    fail(file, `cells has ${preset.cells.length} rows, expected ${likelihood.length} (one per likelihood class)`);
  }
  preset.cells.forEach((row, li) => {
    if (row.length !== severity.length) {
      fail(file, `cells[${li}] has ${row.length} columns, expected ${severity.length} (one per severity class)`);
    }
    row.forEach((cell, si) => {
      if (!riskIds.has(cell)) fail(file, `cells[${li}][${si}] = "${cell}" is not a known risk class id`);
    });
  });

  // Convert every minValue from the preset's declared authoringUnit into
  // canonical events/hour -- the ONE shared conversion helper, so the
  // preset build, the matrix editor, and threat/barrier entry can never
  // drift out of step with each other.
  const convertedLikelihood = likelihood.map((cls) => {
    const parsed = Decimal.parse(cls.minValue);
    const canonical = preset.authoringUnit === 'year' ? convertHourYear(parsed, 'yearToHour') : parsed;
    return { ...cls, minValue: canonical.toDecimalString() };
  });

  return { ...preset, likelihoodClasses: convertedLikelihood };
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
