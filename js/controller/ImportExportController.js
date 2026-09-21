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
    // `onExported`, if given, fires after a JSON export that actually
    // completed (not one the user cancelled out of a native Save dialog) —
    // this is how UnsavedChangesController knows the document was just
    // saved and the close-confirmation prompt can stand down again.
    // `onFileHandle`, if given, receives the FileSystemFileHandle of any
    // file this controller saved to or opened natively -- what
    // RecentFilesController remembers so the start screen can offer it
    // again. Nothing happens without the File System Access API: there is
    // no handle to hand over on the download/`<input type=file>` paths.
    constructor(model, svgRoot, getContentBounds, els, onImported, onExported, getRenderOpts,
      onFileHandle, onMigrated) {
      this.model = model;
      this.svgRoot = svgRoot;
      this.getContentBounds = getContentBounds;
      this.onImported = onImported;
      this.onExported = onExported;
      // The same `{ showAnnotations, displayUnit }` main.js's renderAll
      // passes, so an off-screen page render matches the live canvas.
      this.getRenderOpts = getRenderOpts;
      this.onFileHandle = onFileHandle;
      // Called with the list of applied migration descriptions after an
      // older document was upgraded on load (proposals/12).
      this.onMigrated = onMigrated;

      els.exportPngBtn.addEventListener('click', () => {
        Bowtie.ExportUtil.exportPng(this.svgRoot, this.getContentBounds(), `${this._baseName()}.png`);
      });
      els.exportSvgBtn.addEventListener('click', () => {
        Bowtie.ExportUtil.exportSvg(this.svgRoot, this.getContentBounds(), `${this._baseName()}.svg`);
      });
      // Every page, one file each (ExportUtil.exportAllPages): a folder
      // picker where the File System Access API exists, sequential
      // downloads where it doesn't. The loading modal stays up for the
      // duration, naming the page being rendered.
      if (els.exportAllSvgBtn) {
        els.exportAllSvgBtn.addEventListener('click', () => this._exportAllPages('svg'));
      }
      if (els.exportAllPngBtn) {
        els.exportAllPngBtn.addEventListener('click', () => this._exportAllPages('png'));
      }
      els.exportJsonBtn.addEventListener('click', () => this.exportJson());
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
          if (result.text != null) {
            this._rememberFile(result.handle);
            await this._processImportedText(result.text);
          }
          return;
        }
        els.importFileInput.click();
      });
      els.importFileInput.addEventListener('change', (e) => this._onImportFile(e));
    }

    // A real method rather than only a click handler, because the fatal
    // error dialog (proposals/19) needs to reach it too -- and must NOT
    // reach it by clicking #btn-export-json, which WarningsController
    // disables whenever the document has a blocking warning.
    //
    // That guard is right for the ordinary path: it stops a broken
    // analysis being handed to a colleague. It would be exactly wrong as
    // a crash escape hatch, where the alternative to an imperfect file
    // is no file at all.
    async exportJson() {
      const saved = await Bowtie.ExportUtil.exportJson(
        this.model, `${this._baseName()}.json`, (handle) => this._rememberFile(handle),
      );
      if (saved && this.onExported) this.onExported();
      return saved;
    }

    _rememberFile(handle) {
      if (handle && this.onFileHandle) this.onFileHandle(handle);
    }

    // Exports are named after the analysis, not a fixed "bowtie-diagram"
    // -- a folder of exports from several analyses is otherwise a folder
    // of identically-named files.
    _baseName() {
      return Bowtie.ExportUtil.safeFileName(this.model.name, 'bowtie-diagram');
    }

    async _exportAllPages(format) {
      const total = this.model.pages.length;
      const loading = this._showLoadingModal(`Exporting page 1 of ${total}…`);
      const message = loading.dialog.querySelector('.modal-loading p');
      try {
        await nextPaint();
        const written = await Bowtie.ExportUtil.exportAllPages(this.model, {
          format,
          opts: this.getRenderOpts ? this.getRenderOpts() : {},
          onProgress: (done) => {
            if (message && done < total) message.textContent = `Exporting page ${done + 1} of ${total}…`;
          },
        });
        loading.close();
        if (written === 0 && total > 0) return; // the user cancelled the folder picker
      } catch (err) {
        loading.close();
        this._showMessage('Export Failed', err.message || 'Could not export every page.');
      }
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
    // the first page has rendered.
    //
    // That used to come for free: `loadDocument` -> `model.loadFromJSON`
    // -> `_emitChange` -> the app's own listeners all ran synchronously,
    // so rendering had completed by the time `loadDocument` returned.
    // proposals/16 coalesces every render into the next animation frame,
    // which would otherwise close this modal one frame before the diagram
    // appears -- so the wait is now explicit. `nextPaint()` resolves after
    // the frame the render was scheduled into has actually painted, which
    // is a slightly stronger guarantee than the synchronous version gave.
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
        await nextPaint();
      } finally {
        loading.close();
      }
    }

    // Public entry point for raw JSON text from somewhere other than a
    // file dialog -- WelcomeController's "Recently opened" list reads a
    // remembered file handle and hands the text straight here, so it
    // gets the same parse/validate/loading-modal treatment as a file the
    // user picked this session.
    importText(text) {
      return this._processImportedText(text);
    }

    // Validates an already-parsed document (shape check, then the
    // version rules below) and, if valid, loads it. Public entry point for anything besides a real file
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
      // Three version cases (proposals/12). A file NEWER than this
      // editor is always refused: there is no way to know what a future
      // field means, and guessing would corrupt it. An OLDER file with a
      // migration chain is upgraded here, in memory only -- the user's
      // own file is never rewritten. An older file with no chain (v7-v9,
      // which predate the upgrade path) is refused as before.
      const current = Bowtie.BowtieModel.SCHEMA_VERSION;
      let loadable = data;
      let migrated = null;
      if (data.version !== current) {
        if (typeof data.version === 'number' && data.version > current) {
          this._showMessage(
            'Unsupported File Version',
            `This file was created with schema version ${data.version}, which is newer than `
              + `this editor (version ${current}). Update the editor to open it.`,
          );
          return false;
        }
        if (!Bowtie.Migrations.canMigrate(data.version)) {
          this._showMessage(
            'Unsupported File Version',
            `This file was created with schema version ${data.version ?? 'unknown'}, but this `
              + `editor only reads version ${current}. Files from schema v7–v9 predate the `
              + 'upgrade path and cannot be opened.',
          );
          return false;
        }
        // A migration that throws is a bug in the migration, but it
        // must not surface as an uncaught error over a half-loaded
        // document -- same reasoning as the loadFromJSON guard below.
        // Nothing has touched the model at this point, so refusing here
        // leaves the user exactly where they were.
        let result;
        try {
          result = Bowtie.Migrations.migrateDocument(data);
        } catch (err) {
          result = { ok: false, error: err };
        }
        if (!result.ok) {
          this._showMessage(
            'Upgrade Failed',
            `This file was created with schema version ${data.version} and could not be upgraded`
              + `${result.error ? `: ${result.error.message}` : '.'}`,
          );
          return false;
        }
        loadable = result.doc;
        migrated = result.applied;
      }
      // loadFromJSON throws, changing nothing on the model, when `data`
      // parses but doesn't hold together referentially (e.g. a placement
      // pointing at a library node that no longer exists) -- design review
      // finding 03. Routed through the same "Invalid File" dialog as the
      // shape/version checks above, rather than left to surface as an
      // uncaught page error over a half-loaded document.
      try {
        this.model.loadFromJSON(loadable);
      } catch (err) {
        this._showMessage('Invalid File', err.message);
        return false;
      }
      if (this.onImported) this.onImported();
      // After onImported, which marks the document clean: an upgraded
      // document is NOT what is on disk, so `onMigrated` marks it dirty
      // again (and shows what changed). Same ordering reason as
      // RecoveryController's restore.
      if (migrated && this.onMigrated) this.onMigrated(migrated);
      return true;
    }
  }

  Bowtie.ImportExportController = ImportExportController;
})(window.Bowtie = window.Bowtie || {});
