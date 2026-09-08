(function (Bowtie) {
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
          if (result.text != null) this._processImportedText(result.text);
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
    _processImportedText(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        this._showMessage('Invalid File', 'That file is not valid JSON.');
        return;
      }
      this.loadDocument(data);
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
      this.model.loadFromJSON(data);
      if (this.onImported) this.onImported();
      return true;
    }
  }

  Bowtie.ImportExportController = ImportExportController;
})(window.Bowtie = window.Bowtie || {});
