(function (Bowtie) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const EXPORT_PADDING = 40;

  // Mirrors the node/connection visual rules in css/styles.css, so exported
  // SVG/PNG files are self-contained and render correctly even without the
  // page's stylesheet (e.g. opened standalone, or in another application).
  //
  // Built from the live page's own computed CSS custom properties rather
  // than a hand-copied hex string — that used to be a second, silently
  // driftable copy of every color in :root. Reading them here means an
  // export always matches whatever styles.css currently says, with exactly
  // one place to change a color.
  function buildExportStyle() {
    const root = getComputedStyle(document.documentElement);
    const v = (name) => root.getPropertyValue(`--${name}`).trim();
    return `
      .connection { stroke: ${v('connection')}; stroke-width: 2; fill: none; }
      .node .shape { stroke-width: 2; }
      .node.top-level-event .shape { stroke: ${v('tle-stroke')}; }
      .node.hazard .shape { stroke: ${v('hazard-stroke')}; }
      .node.cause .shape { fill: ${v('cause-fill')}; stroke: ${v('cause-stroke')}; }
      .node.outcome .shape { fill: ${v('outcome-fill')}; stroke: ${v('outcome-stroke')}; }
      .node.preventative-barrier .shape, .node.mitigative-barrier .shape { fill: ${v('control-fill')}; stroke: ${v('control-stroke')}; }
      .connection-label { font-size: 10px; fill: ${v('connection-label')}; text-anchor: start; }
      .node text { font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; font-size: 13px; fill: ${v('node-text')}; }
      .node-info-text-emphasized text { fill: ${v('node-text')}; }
      .node-id-text { font-weight: 700; }
    `;
  }

  // Renders the FULL content bounds regardless of the live canvas's current
  // pan/zoom window — exports should never crop a diagram just because the
  // user had scrolled away from part of it.
  function buildExportSvgString(svgRoot, bounds) {
    const width = Math.max(bounds.maxX - bounds.minX + EXPORT_PADDING * 2, 100);
    const height = Math.max(bounds.maxY - bounds.minY + EXPORT_PADDING * 2, 100);
    const vbX = bounds.minX - EXPORT_PADDING;
    const vbY = bounds.minY - EXPORT_PADDING;

    const clone = svgRoot.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);
    clone.setAttribute('viewBox', `${vbX} ${vbY} ${width} ${height}`);
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.removeAttribute('class');
    clone.removeAttribute('style');

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', String(vbX));
    bg.setAttribute('y', String(vbY));
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = buildExportStyle();
    clone.insertBefore(style, clone.firstChild);

    return { svgString: new XMLSerializer().serializeToString(clone), width, height };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Prefers a real native "Save As" dialog (the File System Access API) so
  // the user picks the exact file and location, rather than it landing
  // wherever the browser's own download settings say — falling back to the
  // old click-a-download-link approach wherever that API doesn't exist at
  // all (Firefox, Safari, or this page loaded over file:// rather than
  // http(s)://, where the API is entirely absent) or the browser refuses
  // the call for some other reason. `err.name === 'AbortError'` means the
  // user cancelled the dialog — not a failure, just do nothing further.
  async function saveBlob(blob, filename, pickerType) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [pickerType] });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // fall through to the legacy path below
      }
    }
    downloadBlob(blob, filename);
  }

  function exportSvg(svgRoot, bounds, filename) {
    const { svgString } = buildExportSvgString(svgRoot, bounds);
    saveBlob(
      new Blob([svgString], { type: 'image/svg+xml' }),
      filename,
      { description: 'SVG Image', accept: { 'image/svg+xml': ['.svg'] } },
    );
  }

  function exportPng(svgRoot, bounds, filename, scale) {
    const { svgString, width, height } = buildExportSvgString(svgRoot, bounds);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const renderScale = scale || 2;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * renderScale;
      canvas.height = height * renderScale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        // `canvas.toBlob` hands back `null` instead of throwing when the
        // canvas is too large to encode (auto-arrange explicitly lays out
        // into unbounded space, so a large enough diagram at this scale
        // can plausibly exceed a browser's canvas dimension/area limits) —
        // an unguarded `saveBlob(null, ...)` would eventually reach
        // `URL.createObjectURL(null)` and throw uncaught in the fallback
        // download path (architecture review finding, 2026).
        if (!blob) {
          window.alert('Failed to render the PNG export — the diagram may be too large to export at this size.');
          return;
        }
        saveBlob(blob, filename, { description: 'PNG Image', accept: { 'image/png': ['.png'] } });
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert('Failed to render the PNG export.');
    };
    img.src = url;
  }

  // Generic "save this plain object as a .json file" -- exportJson (the
  // whole-document export) is just this applied to model.toJSON(); the
  // risk matrix export (Project Settings' "Export Risk Matrix...") reuses
  // it directly for a plain RiskMatrixDefinition object instead.
  function exportJsonObject(obj, filename) {
    const json = JSON.stringify(obj, null, 2);
    saveBlob(
      new Blob([json], { type: 'application/json' }),
      filename,
      { description: 'JSON File', accept: { 'application/json': ['.json'] } },
    );
  }

  function exportJson(model, filename) {
    exportJsonObject(model.toJSON(), filename);
  }

  // Mirrors saveBlob for the import side: a real native "Open" dialog via
  // the same API, when it exists. `supported: false` covers BOTH "this
  // browser/context has no File System Access API at all" and "it exists
  // but the call itself failed for some other reason" — either way the
  // caller (ImportExportController) falls back to the legacy hidden
  // `<input type=file>`, which keeps working everywhere regardless.
  // `supported: true, text: null` specifically means the user opened the
  // native dialog and then cancelled it — not a failure, nothing to fall
  // back to.
  async function pickJsonFileText() {
    if (!window.showOpenFilePicker) return { supported: false };
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      return { supported: true, text: await file.text() };
    } catch (err) {
      if (err && err.name === 'AbortError') return { supported: true, text: null };
      return { supported: false };
    }
  }

  Bowtie.ExportUtil = {
    exportSvg, exportPng, exportJson, exportJsonObject, pickJsonFileText,
  };
})(window.Bowtie = window.Bowtie || {});
