#!/usr/bin/env node
// Wraps js/data/demo-bowtie.json (a plain schema-v6 export -- the source of
// truth you edit/replace) into js/data/DemoData.js, a normal loaded-via-
// <script> file exposing Bowtie.DEMO_DATA, exactly like every other file in
// js/. This exists because the app deliberately makes no fetch() calls (it
// must work standalone over file://, where fetch() of a local file is
// blocked/CORS-restricted) -- see demo_json_proposal.md -- so the JSON
// can't be loaded directly at runtime and needs this one-time wrap into a
// real script file, committed like any other source file.
//
// Run this whenever you edit js/data/demo-bowtie.json:
//   node scripts/build-demo-data.js
//
// No npm dependencies -- plain Node, JSON.parse/stringify only.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'data', 'demo-bowtie.json');
const OUT = path.join(__dirname, '..', 'js', 'data', 'DemoData.js');

const json = fs.readFileSync(SRC, 'utf8');
const data = JSON.parse(json); // fail loudly here if the source isn't valid JSON

const out = `// GENERATED FILE -- do not edit directly.
// Source of truth: js/data/demo-bowtie.json -- edit that file (plain,
// schema-v6 JSON, the same shape "Export to JSON" produces), then run
// \`node scripts/build-demo-data.js\` to regenerate this file.
//
// Wrapped into a real script (rather than fetched as JSON) so it works
// standalone over file:// -- see scripts/build-demo-data.js.
(function (Bowtie) {
  Bowtie.DEMO_DATA = ${JSON.stringify(data, null, 2)};
})(window.Bowtie = window.Bowtie || {});
`;

fs.writeFileSync(OUT, out);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} from ${path.relative(process.cwd(), SRC)}`);
