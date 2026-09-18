#!/usr/bin/env node
// One-shot codemod for proposals/11: Cause -> Threat, Outcome ->
// Consequence, across every layer at once (model, view, controllers,
// markup, CSS, data, tests). Checked in rather than run-and-forgotten so
// the exact rules that produced the rename are reviewable next to the
// diff -- and because the id-prefix rotation below is the kind of thing
// nobody should have to reconstruct from memory.
//
// Usage: node scripts/rename-terms.js [--dry]
//
// Three things make this more than a find-and-replace:
//
// 1. **The id prefixes rotate.** `C_` means Cause today and Consequence
//    tomorrow, so a naive pass would map both Causes and Outcomes onto
//    `C_`. Done as a three-step rotation through a sentinel no source
//    file contains.
// 2. **"because" is not a cause.** A lowercase `cause` preceded by a
//    letter is left alone; an uppercase `Cause` may be preceded by one,
//    since that is camelCase (`addCause`). Likewise a trailing lowercase
//    letter blocks the match (`caused`), while a trailing uppercase one
//    does not (`causesForPage`).
// 3. **Plurals first.** `causes` has to be tried before `cause`, or the
//    singular rule eats the stem and leaves a stray `s`.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['js', 'css', 'tests', 'index.html', 'README.md', 'CHANGELOG.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__pycache__', 'fixtures']);
const EXTENSIONS = new Set(['.js', '.css', '.py', '.html', '.json', '.md']);

// A sentinel no source file contains, used to rotate C_ -> T_ and
// O_ -> C_ without the second step clobbering the first.
const SENTINEL = '@@CONSEQUENCE_PREFIX@@';

const RULES = [
  // --- id prefixes (rotate, do not translate) ---
  [/\bO_/g, SENTINEL],
  [/\bC_/g, 'T_'],
  [new RegExp(SENTINEL, 'g'), 'C_'],

  // --- words: plural before singular, caps before camel before plain ---
  [/(?<![A-Z])CAUSES(?![A-Z])/g, 'THREATS'],
  [/(?<![A-Z])CAUSE(?![A-Z])/g, 'THREAT'],
  [/(?<![A-Z])OUTCOMES(?![A-Z])/g, 'CONSEQUENCES'],
  [/(?<![A-Z])OUTCOME(?![A-Z])/g, 'CONSEQUENCE'],

  [/Causes(?![a-z])/g, 'Threats'],
  [/Cause(?![a-z])/g, 'Threat'],
  [/Outcomes(?![a-z])/g, 'Consequences'],
  [/Outcome(?![a-z])/g, 'Consequence'],

  [/(?<![A-Za-z])causes(?![a-z])/g, 'threats'],
  [/(?<![A-Za-z])cause(?![a-z])/g, 'threat'],
  [/(?<![A-Za-z])outcomes(?![a-z])/g, 'consequences'],
  [/(?<![A-Za-z])outcome(?![a-z])/g, 'consequence'],
];

function* walk(entry) {
  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(entry))) yield entry;
    return;
  }
  for (const name of fs.readdirSync(entry)) {
    if (SKIP_DIRS.has(name)) continue;
    yield* walk(path.join(entry, name));
  }
}

function main() {
  const dry = process.argv.includes('--dry');
  let changedFiles = 0;
  let changedLines = 0;

  TARGETS.forEach((target) => {
    const full = path.join(ROOT, target);
    if (!fs.existsSync(full)) return;
    for (const file of walk(full)) {
      // Never rewrite this script's own rules.
      if (path.resolve(file) === path.resolve(__filename)) continue;
      const before = fs.readFileSync(file, 'utf8');
      const after = RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), before);
      if (after === before) continue;
      const beforeLines = before.split('\n');
      const afterLines = after.split('\n');
      changedFiles += 1;
      changedLines += beforeLines.filter((line, i) => line !== afterLines[i]).length;
      if (!dry) fs.writeFileSync(file, after);
    }
  });

  console.log(`${dry ? 'Would rewrite' : 'Rewrote'} ${changedFiles} files (${changedLines} lines).`);
  if (!dry) {
    console.log('Now: hand-fix NODE_ID_PREFIX, bump SCHEMA_VERSION, add the v10->v11 migration,');
    console.log('then `npm run build:demo && node scripts/build-risk-matrix-presets.js`, lint and the suite.');
  }
}

main();
