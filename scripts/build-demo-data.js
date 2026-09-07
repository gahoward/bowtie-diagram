#!/usr/bin/env node
// Wraps the three demo variant JSON files -- js/data/demo-simple.json,
// demo-qualitative.json, demo-quantitative.json (one per document mode,
// quantitative_mode_proposal.md "Modes"; the source of truth you edit/
// replace) -- into js/data/DemoData.js, a normal loaded-via-<script> file
// exposing Bowtie.DEMO_DATA_VARIANTS, exactly like every other file in
// js/. This exists because the app deliberately makes no fetch() calls (it
// must work standalone over file://, where fetch() of a local file is
// blocked/CORS-restricted) -- see demo_json_proposal.md -- so the JSON
// can't be loaded directly at runtime and needs this one-time wrap into a
// real script file, committed like any other source file.
//
// Run this whenever you edit any js/data/demo-*.json file:
//   node scripts/build-demo-data.js
//
// No npm dependencies -- plain Node, JSON.parse/stringify only.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'js', 'data');
const OUT = path.join(DATA_DIR, 'DemoData.js');

const VARIANTS = {
  simple: 'demo-simple.json',
  qualitative: 'demo-qualitative.json',
  quantitative: 'demo-quantitative.json',
};

const variants = {};
Object.entries(VARIANTS).forEach(([key, filename]) => {
  const json = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  variants[key] = JSON.parse(json); // fail loudly here if a source isn't valid JSON
});

const out = `// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/demo-simple.json, demo-qualitative.json,
// demo-quantitative.json -- one per document mode (quantitative_mode_
// proposal.md "Modes"). Edit those files (plain schema-v8 JSON, the same
// shape "Export to JSON" produces), then run
// \`node scripts/build-demo-data.js\` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-demo-data.js.
(function (Bowtie) {
  Bowtie.DEMO_DATA_VARIANTS = ${JSON.stringify(variants, null, 2)};
  // Back-compat alias for every existing call site written before demo
  // variants existed (WelcomeController's Ctrl+Alt+D shortcut, tests) --
  // always the Simple-mode variant, today's original demo content.
  Bowtie.DEMO_DATA = Bowtie.DEMO_DATA_VARIANTS.simple;
})(window.Bowtie = window.Bowtie || {});
`;

fs.writeFileSync(OUT, out);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} from ${Object.values(VARIANTS).join(', ')}`);
