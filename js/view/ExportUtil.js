(function (Bowtie) {
  const SVG_NS = Bowtie.Svg.NS;
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
      .node.threat .shape { fill: ${v('threat-fill')}; stroke: ${v('threat-stroke')}; }
      .node.consequence .shape { fill: ${v('consequence-fill')}; stroke: ${v('consequence-stroke')}; }
      .node.preventative-barrier .shape, .node.mitigative-barrier .shape { fill: ${v('control-fill')}; stroke: ${v('control-stroke')}; }
      .node.escalation-factor .shape { fill: ${v('escalation-fill')}; stroke: ${v('escalation-stroke')}; }
      .node.escalation-barrier .shape { fill: ${v('control-fill')}; stroke: ${v('control-stroke')}; }
      .connection.escalation { stroke: ${v('escalation-stroke')}; stroke-dasharray: 5 4; stroke-width: 1.5; }
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
  //
  // Returns whether a file actually got saved (false only for that
  // cancelled-dialog case) so callers that care whether the export really
  // happened — see ImportExportController's `onExported` — can tell it
  // apart from a completed save.
  //
  // `onHandle`, if given, is called with the FileSystemFileHandle the
  // native path just wrote to (never on the download fallback, which
  // gets no handle at all) — that is what RecentFilesController stores,
  // and the reason this stayed an optional callback rather than a richer
  // return value: every other caller keeps reading a plain boolean.
  async function saveBlob(blob, filename, pickerType, onHandle) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [pickerType] });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (onHandle) onHandle(handle);
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
        // fall through to the legacy path below
      }
    }
    downloadBlob(blob, filename);
    return true;
  }

  function exportSvg(svgRoot, bounds, filename) {
    const { svgString } = buildExportSvgString(svgRoot, bounds);
    return saveBlob(
      new Blob([svgString], { type: 'image/svg+xml' }),
      filename,
      { description: 'SVG Image', accept: { 'image/svg+xml': ['.svg'] } },
    );
  }

  // The rasterising half of exportPng, as a Promise so a caller exporting
  // several pages can await each one. Resolves `null` when the canvas is
  // too large to encode -- `canvas.toBlob` hands back `null` instead of
  // throwing (auto-arrange explicitly lays out into unbounded space, so a
  // large enough diagram at this scale can plausibly exceed a browser's
  // canvas dimension/area limits), and an unguarded `saveBlob(null, ...)`
  // would eventually reach `URL.createObjectURL(null)` and throw uncaught
  // in the fallback download path (architecture review finding, 2026).
  function svgStringToPngBlob(svgString, width, height, scale) {
    return new Promise((resolve, reject) => {
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
        canvas.toBlob(resolve, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to render the SVG for PNG export.'));
      };
      img.src = url;
    });
  }

  async function exportPng(svgRoot, bounds, filename, scale) {
    const { svgString, width, height } = buildExportSvgString(svgRoot, bounds);
    let blob;
    try {
      blob = await svgStringToPngBlob(svgString, width, height, scale);
    } catch {
      window.alert('Failed to render the PNG export.');
      return false;
    }
    if (!blob) {
      window.alert('Failed to render the PNG export — the diagram may be too large to export at this size.');
      return false;
    }
    return saveBlob(blob, filename, { description: 'PNG Image', accept: { 'image/png': ['.png'] } });
  }

  // Renders one page -- any page, not just the active one -- onto a
  // throwaway SVG, so every page can be exported or printed without
  // disturbing the live canvas or making the user switch tabs. The
  // surface must be IN the document while rendering: TextWrap measures
  // with getComputedTextLength, which needs real layout (hence
  // off-screen rather than `display: none`). Its layers carry classes,
  // not ids, so the document never holds duplicate ids -- see
  // CanvasView's constructor.
  //
  // `render(pageId, opts)` is called for each page in turn and the
  // surface is reused; `destroy()` removes it. Callers must call
  // `destroy()` when done (a `finally` block).
  function createPageRenderer(model, opts = {}) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', `0 0 ${Bowtie.BowtieModel.CANVAS_W} ${Bowtie.BowtieModel.CANVAS_H}`);
    svg.setAttribute('width', String(Bowtie.BowtieModel.CANVAS_W));
    svg.setAttribute('height', String(Bowtie.BowtieModel.CANVAS_H));
    svg.style.position = 'absolute';
    svg.style.left = '-10000px';
    svg.style.top = '0';
    svg.setAttribute('aria-hidden', 'true');
    const connections = document.createElementNS(SVG_NS, 'g');
    connections.setAttribute('class', 'connections-layer');
    const nodes = document.createElementNS(SVG_NS, 'g');
    nodes.setAttribute('class', 'nodes-layer');
    svg.appendChild(connections);
    svg.appendChild(nodes);
    document.body.appendChild(svg);

    let pageId = null;
    const view = new Bowtie.CanvasView(svg);
    const scoped = new Bowtie.PageScopedModel(model, () => pageId);

    return {
      svg,
      render(id) {
        pageId = id;
        view.render(scoped, opts);
        return { svgRoot: svg, bounds: view.getContentBounds() };
      },
      destroy() {
        svg.remove();
      },
    };
  }

  // A filename-safe version of the analysis/page name: the characters
  // Windows forbids, plus leading/trailing dots and spaces.
  function safeFileName(text, fallback) {
    const cleaned = String(text || '').replace(/[\\/:*?"<>|]/g, '-').replace(/^[\s.]+|[\s.]+$/g, '').trim();
    return cleaned || fallback;
  }

  // Every page, one file each. With the File System Access API the user
  // picks a folder once and each file is written into it; without it
  // (Firefox, Safari, file://) each file goes through the ordinary
  // download path, spaced out so a burst of downloads from one click
  // isn't throttled. Returns the number of files written (0 if the user
  // cancelled the folder picker).
  //
  // `onProgress(done, total)` fires before each page renders, for the
  // caller's "Exporting page 2 of 5…" message.
  async function exportAllPages(model, { format = 'svg', opts = {}, scale, onProgress } = {}) {
    const pages = model.pages;
    const baseName = safeFileName(model.name, 'bowtie-diagram');
    let directory = null;
    if (window.showDirectoryPicker) {
      try {
        directory = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (err) {
        if (err && err.name === 'AbortError') return 0;
        directory = null; // fall through to the download path
      }
    }

    const renderer = createPageRenderer(model, opts);
    let written = 0;
    try {
      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        if (onProgress) onProgress(i, pages.length);
        const { svgRoot, bounds } = renderer.render(page.id);
        const { svgString, width, height } = buildExportSvgString(svgRoot, bounds);
        const filename = `${baseName} - ${safeFileName(page.name, `page ${i + 1}`)}.${format}`;
        // Pages are rendered and written strictly one at a time: they
        // share the single off-screen surface above, and the download
        // fallback needs its own spacing between files.
        let blob;
        if (format === 'png') {
          blob = await svgStringToPngBlob(svgString, width, height, scale);
          if (!blob) continue; // too large to encode; skip this page rather than abort the run
        } else {
          blob = new Blob([svgString], { type: 'image/svg+xml' });
        }
        if (directory) {
          const fileHandle = await directory.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          downloadBlob(blob, filename);
          if (i < pages.length - 1) await new Promise((r) => { setTimeout(r, 300); });
        }
        written += 1;
      }
    } finally {
      renderer.destroy();
    }
    if (onProgress) onProgress(pages.length, pages.length);
    return written;
  }

  // Generic "save this plain object as a .json file" -- exportJson (the
  // whole-document export) is just this applied to model.toJSON(); the
  // risk matrix export (Project Settings' "Export Risk Matrix...") reuses
  // it directly for a plain RiskMatrixDefinition object instead.
  function exportJsonObject(obj, filename, onHandle) {
    const json = JSON.stringify(obj, null, 2);
    return saveBlob(
      new Blob([json], { type: 'application/json' }),
      filename,
      { description: 'JSON File', accept: { 'application/json': ['.json'] } },
      onHandle,
    );
  }

  function exportJson(model, filename, onHandle) {
    return exportJsonObject(model.toJSON(), filename, onHandle);
  }

  // Any plain-text export (the Risk Summary's CSV) through the same
  // native-picker-then-download path every other export uses. The BOM
  // is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the
  // system's legacy code page -- without it a degree sign or an en dash
  // in an consequence name arrives mangled.
  function exportText(text, filename, { mimeType = 'text/plain', description = 'Text File', extension = '.txt', bom = false } = {}) {
    const body = bom ? `\uFEFF${text}` : text;
    return saveBlob(
      new Blob([body], { type: `${mimeType};charset=utf-8` }),
      filename,
      { description, accept: { [mimeType]: [extension] } },
    );
  }

  function exportCsv(text, filename) {
    return exportText(text, filename, {
      mimeType: 'text/csv', description: 'CSV File', extension: '.csv', bom: true,
    });
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
      // The handle rides along for RecentFilesController -- a caller that
      // doesn't remember files simply ignores it.
      return { supported: true, text: await file.text(), handle };
    } catch (err) {
      if (err && err.name === 'AbortError') return { supported: true, text: null };
      return { supported: false };
    }
  }

  Bowtie.ExportUtil = {
    exportSvg,
    exportPng,
    exportJson,
    exportJsonObject,
    exportText,
    exportCsv,
    pickJsonFileText,
    createPageRenderer,
    exportAllPages,
    buildExportSvgString,
    safeFileName,
  };
})(window.Bowtie = window.Bowtie || {});
