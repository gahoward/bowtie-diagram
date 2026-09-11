(function (Bowtie) {
  // Two nested requestAnimationFrame calls, not one: the first fires
  // BEFORE the browser's next paint, so scheduling the heavy synchronous
  // import work there would still block that very paint -- the loading
  // modal opened just before calling this would never actually become
  // visible. The second rAF is scheduled from inside the first, so it
  // only runs AFTER that paint has happened, guaranteeing the modal was
  // on screen at least one frame before the synchronous work begins.
  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  class ImportExportController {
    // `getContentBounds` is a callback (not a static value) so exports always
    // reflect the diagram's current extent, not whatever it was on load.
    // `onImported`, if given, fires after a successful import — this is how
    // UndoController resets its undo/redo history to match "importing a
    // file resets both stacks" rather than treating the whole imported
    // document as one giant undo step.
    constructor(model, svgRoot, getContentBounds, els, onImported) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.getContentBounds = getContentBounds;
      this.onImported = onImported;

      els.exportPngBtn.addEventListener('click', () => {
        Bowtie.ExportUtil.exportPng(this.svgRoot, this.getContentBounds(), 'bowtie-diagram.png');
      });
      els.exportSvgBtn.addEventListener('click', () => {
        Bowtie.ExportUtil.exportSvg(this.svgRoot, this.getContentBounds(), 'bowtie-diagram.svg');
      });
      els.exportJsonBtn.addEventListener('click', () => {
        Bowtie.ExportUtil.exportJson(this.model, 'bowtie-diagram.json');
      });
      // Prefers the real native "Open" dialog (File System Access API);
      // `pickJsonFileText` resolves `{ supported: false }` both when that
      // API doesn't exist at all (Firefox, Safari, file://) and when it
      // exists but the call itself failed, so either way this falls back
      // to the classic hidden `<input type=file>` click, which still works
      // everywhere. `{ supported: true, text: null }` means the user
      // cancelled the native dialog — nothing to fall back to, just stop.
      els.importJsonBtn.addEventListener('click', async () => {
        const result = await Bowtie.ExportUtil.pickJsonFileText();
        if (result.supported) {
          if (result.text != null) await this._processImportedText(result.text);
          return;
        }
        els.importFileInput.click();
      });
      els.importFileInput.addEventListener('change', (e) => this._onImportFile(e));
    }

    _showMessage(title, message) {
      const body = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(p);
      Bowtie.ModalView.openModal({ title, bodyEl: body, actions: [{ label: 'OK', primary: true }] });
    }

    // No actions and dismissible: false -- nothing the user does (a stray
    // click on the backdrop, Escape) should be able to close this while an
    // import is still in flight; only `_processImportedText`'s own
    // `finally` below ever calls `.close()` on the handle this returns.
    _showLoadingModal(message) {
      const body = document.createElement('div');
      body.className = 'modal-loading';
      const spinner = document.createElement('div');
      spinner.className = 'modal-loading-spinner';
      const p = document.createElement('p');
      p.textContent = message;
      body.appendChild(spinner);
      body.appendChild(p);
      return Bowtie.ModalView.openModal({ title: 'Importing', bodyEl: body, actions: [], dismissible: false });
    }

    _onImportFile(e) {
      const file = e.target.files[0];
      e.target.value = ''; // allow re-importing the same filename later
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => this._processImportedText(reader.result);
      reader.onerror = () => this._showMessage('Import Failed', 'Failed to read the file.');
      reader.readAsText(file);
    }

    // Shared by both import paths above — the legacy <input>/FileReader
    // route and the native-file-picker route hand off to this the exact
    // same way (a raw text string) — and by anything else handing this
    // controller an already-*parsed* document object (the "Load Demo"
    // action; see loadDocument below). Only the JSON.parse step is specific
    // to text.
    //
    // Wraps the actual load in a loading modal that stays up until the
    // import has either failed (loadDocument shows its own error dialog on
    // top before this closes it underneath) or the document has loaded AND
    // the first page has rendered — `loadDocument` -> `model.loadFromJSON`
    // -> `_emitChange` -> the app's own `onChange` listeners (PageTabsView,
    // then CanvasView) all run synchronously, so by the time `loadDocument`
    // returns, rendering has already either completed or thrown; there is
    // no separate "wait for render" step needed beyond just awaiting it.
    async _processImportedText(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        this._showMessage('Invalid File', 'That file is not valid JSON.');
        return;
      }
      const loading = this._showLoadingModal('Importing your diagram…');
      try {
        await nextPaint(); // let the loading modal actually paint before the synchronous work below
        this.loadDocument(data);
      } finally {
        loading.close();
      }
    }

    // Validates an already-parsed document (shape check, then exact
    // SCHEMA_VERSION match — no migration path for older versions) and, if
    // valid, loads it. Public entry point for anything besides a real file
    // import that wants to hand the model a full document — currently just
    // WelcomeController's "Load Demo" action (`Bowtie.DEMO_DATA`). Routing
    // the demo through the exact same validation a real import gets isn't
    // defensive-programming-for-its-own-sake: if SCHEMA_VERSION is ever
    // bumped and DemoData.js isn't updated to match, the demo fails with
    // the same friendly "unsupported file version" dialog a real stale
    // export would get, not a demo silently handing the live model a
    // document it wasn't written to expect. Returns true/false so a caller
    // can tell whether the load actually happened.
    loadDocument(data) {
      // Schema v7 nests topLevelEvent/hazard under `pages` instead of
      // carrying them as top-level keys (see BowtieModel's multi-page data
      // model); a pre-multi-page document still has them at the top level.
      // Neither controllers nor this shape check are page-aware yet, so
      // this only needs to recognize a document was exported at all —
      // accepting either shape here, not just the new one.
      const hasPages = Array.isArray(data && data.pages) && data.pages.length > 0;
      const hasLegacyShape = !!(data && data.hazard && data.topLevelEvent);
      if (!hasPages && !hasLegacyShape) {
        this._showMessage('Invalid File', 'That file does not look like a bowtie diagram export.');
        return false;
      }
      if (data.version !== Bowtie.BowtieModel.SCHEMA_VERSION) {
        this._showMessage(
          'Unsupported File Version',
          `This file was created with schema version ${data.version ?? 'unknown'}, but this `
            + `editor only reads version ${Bowtie.BowtieModel.SCHEMA_VERSION}.`,
        );
        return false;
      }
      // loadFromJSON throws, changing nothing on the model, when `data`
      // parses but doesn't hold together referentially (e.g. a placement
      // pointing at a library node that no longer exists) -- design review
      // finding 03. Routed through the same "Invalid File" dialog as the
      // shape/version checks above, rather than left to surface as an
      // uncaught page error over a half-loaded document.
      try {
        this.model.loadFromJSON(data);
      } catch (err) {
        this._showMessage('Invalid File', err.message);
        return false;
      }
      if (this.onImported) this.onImported();
      return true;
    }
  }

  Bowtie.ImportExportController = ImportExportController;
})(window.Bowtie = window.Bowtie || {});
