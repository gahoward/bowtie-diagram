#!/usr/bin/env node
// Produces the two release artifacts described in the deployment proposal:
//   dist/bowtie-diagram.html      -- single self-contained file, minified,
//                                    everything inlined. Double-click, no
//                                    server.
//   dist/bowtie-diagram-web.zip   -- the plain, unminified multi-file site
//                                    (index.html/css/js + README/LICENSE),
//                                    for anyone who wants to host it
//                                    themselves instead.
//
// The single-file build's script/link order is parsed straight out of
// index.html rather than hand-listed here -- there is exactly ONE source
// of truth for load order, and it can never drift out of sync with the
// real page.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const archiver = require('archiver');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INDEX_HTML = path.join(ROOT, 'index.html');

function readIndexHtml() {
  return fs.readFileSync(INDEX_HTML, 'utf8');
}

// Pulls every `<script src="...">` and the single `<link rel="stylesheet"
// href="...">` out of index.html, in document order -- this IS the load
// order the app depends on (see index.html's own comment / DESIGN_NOTES.md:
// "Load order in index.html matters ... because nothing uses a module
// resolver").
function parseAssetOrder(html) {
  const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const cssHrefMatch = html.match(/<link rel="stylesheet" href="([^"]+)">/);
  if (scriptSrcs.length === 0) throw new Error('No <script src="..."> tags found in index.html');
  if (!cssHrefMatch) throw new Error('No <link rel="stylesheet" href="..."> tag found in index.html');
  return { scriptSrcs, cssHref: cssHrefMatch[1] };
}

function buildSingleFile() {
  const html = readIndexHtml();
  const { scriptSrcs, cssHref } = parseAssetOrder(html);

  const concatenatedJs = scriptSrcs
    .map((src) => fs.readFileSync(path.join(ROOT, src), 'utf8'))
    .join('\n;\n');
  const minifiedJs = esbuild.transformSync(concatenatedJs, { minify: true, loader: 'js' }).code;

  const css = fs.readFileSync(path.join(ROOT, cssHref), 'utf8');
  const minifiedCss = esbuild.transformSync(css, { minify: true, loader: 'css' }).code;

  let out = html;
  out = out.replace(
    `<link rel="stylesheet" href="${cssHref}">`,
    `<style>${minifiedCss}</style>`,
  );
  // Replace every individual script tag; leave exactly one <script> with
  // the full concatenated+minified bundle where the LAST one used to be,
  // so relative document position (end of body) is preserved.
  scriptSrcs.forEach((src, i) => {
    const tag = `<script src="${src}"></script>`;
    out = out.replace(tag, i === scriptSrcs.length - 1 ? `<script>${minifiedJs}</script>` : '');
  });

  fs.mkdirSync(DIST, { recursive: true });
  const outPath = path.join(DIST, 'bowtie-diagram.html');
  fs.writeFileSync(outPath, out);
  console.log(`Wrote ${path.relative(ROOT, outPath)} (${(out.length / 1024).toFixed(1)} KB)`);
}

// The hostable bundle is deliberately NOT built from the single-file
// output above -- it's the plain source tree, unminified, so it can never
// be broken by anything the single-file build does (see
// deployment_proposal.md §2).
function buildWebZip() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(DIST, { recursive: true });
    const outPath = path.join(DIST, 'bowtie-diagram-web.zip');
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`Wrote ${path.relative(ROOT, outPath)} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);

    archive.file(path.join(ROOT, 'index.html'), { name: 'index.html' });
    archive.file(path.join(ROOT, 'README.md'), { name: 'README.md' });
    archive.file(path.join(ROOT, 'LICENSE'), { name: 'LICENSE' });
    archive.directory(path.join(ROOT, 'css'), 'css');
    archive.directory(path.join(ROOT, 'js'), 'js');

    archive.finalize();
  });
}

async function main() {
  buildSingleFile();
  await buildWebZip();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
